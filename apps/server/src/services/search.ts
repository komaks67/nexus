import { Meilisearch, type Index } from "meilisearch";
import type { MessageDTO, SearchHitDTO } from "@nexus/shared";
import { env } from "../env.js";

/**
 * Meilisearch（全文検索エンジン）との連携。
 * メッセージを保存したあと、別の流れで少し遅れて検索用データを登録する。
 */
export interface MessageDoc {
  id: string;
  content: string;
  authorId: string;
  authorName: string;
  channelId: string;
  channelName: string;
  serverId: string;
  parentId: string | null;
  hasAttachment: boolean;
  filenames: string[];
  /** 並び替え用（UNIX ミリ秒） */
  createdAt: number;
}

export const HIGHLIGHT_PRE = "\u0001";
export const HIGHLIGHT_POST = "\u0002";

const client = new Meilisearch({ host: env.MEILI_HOST, apiKey: env.MEILI_MASTER_KEY || undefined });
export const messageIndex: Index<MessageDoc> = client.index<MessageDoc>("messages");

/** 起動時に一度だけ、絞り込み・並び替えに使う項目を設定する */
export async function ensureSearchIndex(): Promise<void> {
  try {
    await client.createIndex("messages", { primaryKey: "id" }).waitTask({ timeout: 10_000 });
  } catch {
    // 既に存在する場合などは無視して設定更新へ進む
  }
  await messageIndex
    .updateSettings({
      searchableAttributes: ["content", "filenames", "authorName", "channelName"],
      filterableAttributes: ["serverId", "channelId", "authorId", "hasAttachment", "createdAt", "parentId"],
      sortableAttributes: ["createdAt"],
      displayedAttributes: ["*"],
      typoTolerance: { enabled: true, minWordSizeForTypos: { oneTypo: 4, twoTypos: 8 } },
    })
    .waitTask({ timeout: 30_000 });
}

export function toMessageDoc(m: MessageDTO, channelName: string): MessageDoc {
  return {
    id: m.id,
    content: m.content,
    authorId: m.author.id,
    authorName: m.author.displayName,
    channelId: m.channelId,
    channelName,
    serverId: m.serverId,
    parentId: m.parentId,
    hasAttachment: m.attachments.length > 0,
    filenames: m.attachments.map((a) => a.filename),
    createdAt: new Date(m.createdAt).getTime(),
  };
}

/* ---------- 非同期インデックス登録キュー ----------
 * 500ms ごと、または 200件たまったらまとめて送る（1件ずつ送るより速い）。
 * 失敗したら少し待って再送する。
 */
const queue: MessageDoc[] = [];
let timer: NodeJS.Timeout | null = null;
let retryDelay = 1000;

export function enqueueMessageIndex(m: MessageDTO, channelName: string): void {
  queue.push(toMessageDoc(m, channelName));
  if (queue.length >= 200) void flush();
  else if (!timer) timer = setTimeout(() => void flush(), 500);
}

async function flush(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (queue.length === 0) return;
  const batch = queue.splice(0, 1000);
  try {
    await messageIndex.addDocuments(batch);
    retryDelay = 1000;
  } catch (err) {
    console.error("[search] インデックス登録に失敗。再試行します:", (err as Error).message);
    queue.unshift(...batch);
    retryDelay = Math.min(retryDelay * 2, 60_000);
    timer = setTimeout(() => void flush(), retryDelay);
  }
}

export async function flushSearchQueue(): Promise<void> {
  await flush();
}

/** Meilisearch のフィルタ式に入れる値を安全にする（UUID以外は弾く） */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function quoteId(id: string): string {
  if (!UUID_RE.test(id)) throw new Error("invalid id");
  return `"${id}"`;
}

export interface SearchParams {
  q: string;
  allowedServerIds: string[];
  channelId?: string | undefined;
  authorId?: string | undefined;
  hasFile?: boolean | undefined;
  limit: number;
  offset: number;
}

export async function searchMessages(p: SearchParams) {
  if (p.allowedServerIds.length === 0) return { hits: [] as SearchHitDTO[], estimatedTotal: 0, processingTimeMs: 0 };

  // 自分が参加しているサーバーだけを検索対象にする（権限の要）
  const filters: string[] = [`serverId IN [${p.allowedServerIds.map(quoteId).join(", ")}]`];
  if (p.channelId) filters.push(`channelId = ${quoteId(p.channelId)}`);
  if (p.authorId) filters.push(`authorId = ${quoteId(p.authorId)}`);
  if (p.hasFile !== undefined) filters.push(`hasAttachment = ${p.hasFile ? "true" : "false"}`);

  const res = await messageIndex.search(p.q, {
    filter: filters.join(" AND "),
    limit: p.limit,
    offset: p.offset,
    sort: p.q.trim() ? undefined : ["createdAt:desc"],
    attributesToHighlight: ["content"],
    attributesToCrop: ["content"],
    cropLength: 40,
    highlightPreTag: HIGHLIGHT_PRE,
    highlightPostTag: HIGHLIGHT_POST,
  });

  const hits: SearchHitDTO[] = res.hits.map((h) => {
    const formatted = (h._formatted as Partial<Record<keyof MessageDoc, unknown>> | undefined)?.content;
    return {
      id: h.id,
      channelId: h.channelId,
      channelName: h.channelName,
      serverId: h.serverId,
      authorId: h.authorId,
      authorName: h.authorName,
      parentId: h.parentId ?? null,
      highlighted: typeof formatted === "string" ? formatted : h.content,
      hasAttachment: h.hasAttachment,
      filenames: h.filenames,
      createdAt: new Date(h.createdAt).toISOString(),
    };
  });

  return {
    hits,
    estimatedTotal: res.estimatedTotalHits ?? hits.length,
    processingTimeMs: res.processingTimeMs,
  };
}
