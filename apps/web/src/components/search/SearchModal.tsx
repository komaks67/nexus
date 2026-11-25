import type { SearchHitDTO, SearchResponse } from "@nexus/shared";
import { Hash, MessageSquareReply, Paperclip, Search, X } from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { api, errorMessage } from "../../lib/api";
import { formatTime } from "../../lib/format";
import { useChat } from "../../stores/chat";
import { useLayout } from "../../stores/layout";
import { Spinner } from "../common/ui";

/** 一致箇所（\u0001…\u0002 で囲まれた部分）を <mark> で強調。HTML を使わないので安全 */
function Highlighted({ text }: { text: string }) {
  const parts = text.split(/(\u0001[^\u0002]*\u0002)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("\u0001") ? (
          <mark key={i} className="rounded bg-warning/30 px-0.5 text-fg">
            {p.slice(1, -1)}
          </mark>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </>
  );
}

const selectClass = "rounded-md border border-border bg-surface-1 px-2 py-1 text-xs outline-none focus:border-accent";

/** Cmd/Ctrl + K で開く全文検索 */
export function SearchModal({ onClose }: { onClose: () => void }) {
  const activeServerId = useChat((s) => s.activeServerId);
  const channels = useChat((s) => (s.activeServerId ? s.channelsByServer[s.activeServerId] : undefined));
  const members = useChat((s) => (s.activeServerId ? s.membersByServer[s.activeServerId] : undefined));
  const [q, setQ] = useState("");
  const [scope, setScope] = useState<"server" | "all">("server");
  const [channelId, setChannelId] = useState("");
  const [authorId, setAuthorId] = useState("");
  const [hasFile, setHasFile] = useState<"" | "true" | "false">("");
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtersActive = !!(channelId || authorId || hasFile);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: globalThis.KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // 入力のたびに検索（150ms 待ってから。前の検索は中止して最新だけ表示）
  useEffect(() => {
    if (!q.trim() && !filtersActive) {
      setResult(null);
      setError(null);
      return;
    }
    const controller = new AbortController();
    const t = setTimeout(() => {
      setLoading(true);
      api<SearchResponse>("/api/search", {
        query: {
          q: q.trim(),
          serverId: scope === "server" ? activeServerId : undefined,
          channelId: scope === "server" ? channelId : undefined,
          authorId: scope === "server" ? authorId : undefined,
          hasFile: hasFile || undefined,
          limit: 30,
        },
        signal: controller.signal,
      })
        .then((r) => {
          setResult(r);
          setError(null);
          setSelected(0);
        })
        .catch((err: unknown) => {
          if ((err as Error).name !== "AbortError") setError(errorMessage(err));
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 150);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [q, scope, channelId, authorId, hasFile, activeServerId, filtersActive]);

  const textChannels = useMemo(() => channels?.filter((c) => c.type !== "VOICE") ?? [], [channels]);

  const openHit = async (hit: SearchHitDTO) => {
    const chat = useChat.getState();
    if (chat.activeServerId !== hit.serverId) await chat.selectServer(hit.serverId);
    const layout = useLayout.getState();
    layout.setHighlight({ channelId: hit.channelId, messageId: hit.id });
    if (hit.parentId) {
      layout.open("main", { kind: "channel", channelId: hit.channelId });
      layout.open("side", { kind: "thread", channelId: hit.channelId, rootId: hit.parentId });
    } else {
      layout.open("main", { kind: "channel", channelId: hit.channelId });
    }
    onClose();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const hits = result?.hits ?? [];
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((s) => Math.min(s + 1, hits.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((s) => Math.max(s - 1, 0));
    } else if (e.key === "Enter" && hits[selected]) {
      e.preventDefault();
      void openHit(hits[selected]);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-[10vh]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="メッセージ検索" className="flex max-h-[75vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border bg-surface-2 shadow-2xl">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Search className="size-5 text-fg-muted" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="メッセージ・ファイル名を検索…"
            maxLength={200}
            className="flex-1 bg-transparent text-base outline-none placeholder:text-fg-subtle"
            aria-label="検索キーワード"
          />
          {loading && <Spinner />}
          <kbd className="rounded border border-border px-1.5 text-[10px] text-fg-subtle">ESC</kbd>
          <button onClick={onClose} aria-label="閉じる" className="text-fg-muted hover:text-fg">
            <X className="size-4" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2">
          <select className={selectClass} value={scope} onChange={(e) => setScope(e.target.value as "server" | "all")} aria-label="検索範囲">
            <option value="server">このサーバー</option>
            <option value="all">すべてのサーバー</option>
          </select>
          {scope === "server" && (
            <>
              <select className={selectClass} value={channelId} onChange={(e) => setChannelId(e.target.value)} aria-label="チャンネル">
                <option value="">すべてのチャンネル</option>
                {textChannels.map((c) => (
                  <option key={c.id} value={c.id}>
                    #{c.name}
                  </option>
                ))}
              </select>
              <select className={selectClass} value={authorId} onChange={(e) => setAuthorId(e.target.value)} aria-label="送信者">
                <option value="">すべての送信者</option>
                {members?.map((m) => (
                  <option key={m.user.id} value={m.user.id}>
                    {m.user.displayName}
                  </option>
                ))}
              </select>
            </>
          )}
          <select className={selectClass} value={hasFile} onChange={(e) => setHasFile(e.target.value as "" | "true" | "false")} aria-label="ファイル">
            <option value="">ファイル: 指定なし</option>
            <option value="true">ファイルあり</option>
            <option value="false">ファイルなし</option>
          </select>
          {result && (
            <span className="ml-auto text-xs text-fg-subtle">
              約{result.estimatedTotal}件・{result.processingTimeMs}ms
            </span>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {error && <p className="p-4 text-sm text-red-300">{error}</p>}
          {!result && !error && (
            <p className="p-6 text-center text-sm text-fg-subtle">キーワードを入力するか、絞り込み条件を選んでください</p>
          )}
          {result && result.hits.length === 0 && <p className="p-6 text-center text-sm text-fg-subtle">見つかりませんでした</p>}
          <ul>
            {result?.hits.map((hit, i) => (
              <li key={hit.id}>
                <button
                  onClick={() => void openHit(hit)}
                  onMouseEnter={() => setSelected(i)}
                  className={`block w-full px-4 py-2.5 text-left ${i === selected ? "bg-surface-3" : ""}`}
                >
                  <div className="flex items-center gap-2 text-xs text-fg-muted">
                    <span className="font-semibold text-fg">{hit.authorName}</span>
                    <span className="flex items-center">
                      <Hash className="size-3" />
                      {hit.channelName}
                    </span>
                    {hit.parentId && (
                      <span className="flex items-center gap-0.5">
                        <MessageSquareReply className="size-3" />
                        スレッド
                      </span>
                    )}
                    <span className="ml-auto">{formatTime(hit.createdAt)}</span>
                  </div>
                  <div className="mt-0.5 line-clamp-2 text-sm">
                    <Highlighted text={hit.highlighted} />
                  </div>
                  {hit.filenames.length > 0 && (
                    <div className="mt-1 flex items-center gap-1 text-xs text-fg-muted">
                      <Paperclip className="size-3" />
                      {hit.filenames.join(", ")}
                    </div>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
