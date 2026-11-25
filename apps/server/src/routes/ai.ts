import { zValidator } from "@hono/zod-validator";
import { generateText, streamText } from "ai";
import { and, asc, desc, eq, gt, isNull, or } from "drizzle-orm";
import { Hono } from "hono";
import { summarizeSchema, translateSchema, type TranslateResponse } from "@nexus/shared";
import { db } from "../db/client.js";
import { messages } from "../db/schema.js";
import { requireChannelAccess } from "../lib/access.js";
import { requireAuth } from "../lib/auth-middleware.js";
import { HttpError, notFound } from "../lib/errors.js";
import { rateLimit } from "../lib/rate-limit.js";
import { redis } from "../lib/redis.js";
import { validationHook } from "../lib/validation.js";
import {
  SUMMARY_INSTRUCTIONS,
  TRANSLATE_INSTRUCTIONS,
  isAiEnabled,
  summaryModel,
  translateModel,
} from "../services/ai.js";
import type { AppEnv } from "../types.js";

/** 会話ログを AI に渡す形にする（タグ記号は無害化） */
function formatLog(rows: { createdAt: Date; content: string; author: { displayName: string }; attachments: { filename: string }[] }[]): string {
  const esc = (s: string) => s.replace(/</g, "‹").replace(/>/g, "›");
  return rows
    .map((m) => {
      const time = m.createdAt.toISOString().slice(0, 16).replace("T", " ");
      const files = m.attachments.length ? ` [添付: ${m.attachments.map((a) => esc(a.filename)).join(", ")}]` : "";
      return `[${time}] ${esc(m.author.displayName)}: ${esc(m.content)}${files}`;
    })
    .join("\n");
}

function aiError(err: unknown): HttpError {
  if (err instanceof HttpError) return err;
  console.error("[ai]", err);
  return new HttpError(502, "AI_ERROR", "AIの応答に失敗しました。しばらくしてからお試しください");
}

export const aiRoutes = new Hono<AppEnv>()
  .use(requireAuth)

  .get("/ai/status", (c) => c.json({ enabled: isAiEnabled() }))

  /* 要約（文字を少しずつ返すストリーミング） */
  .post("/ai/summarize", zValidator("json", summarizeSchema, validationHook), async (c) => {
    const user = c.get("user");
    const input = c.req.valid("json");
    const model = summaryModel(); // 未設定ならここで 503
    await rateLimit(`ai:summary:${user.id}`, 10, 60);
    const { channel } = await requireChannelAccess(input.channelId, user.id);

    let rows;
    if (input.threadId) {
      rows = await db.query.messages.findMany({
        where: and(
          eq(messages.channelId, channel.id),
          or(eq(messages.id, input.threadId), eq(messages.parentId, input.threadId)),
        ),
        orderBy: [asc(messages.id)],
        limit: input.limit,
        with: { author: true, attachments: true },
      });
    } else {
      const latest = await db.query.messages.findMany({
        where: and(
          eq(messages.channelId, channel.id),
          isNull(messages.parentId),
          input.afterMessageId ? gt(messages.id, input.afterMessageId) : undefined,
        ),
        orderBy: [desc(messages.id)],
        limit: input.limit,
        with: { author: true, attachments: true },
      });
      rows = latest.reverse();
    }

    const meaningful = rows.filter((r) => r.content.trim() || r.attachments.length);
    if (meaningful.length === 0) {
      return c.text("要約できる新しいメッセージはありません。", 200, { "X-Message-Count": "0" });
    }

    try {
      const result = streamText({
        model,
        instructions: SUMMARY_INSTRUCTIONS,
        prompt: `チャンネル「#${channel.name}」の会話（${meaningful.length}件）を要約してください。\n\n<conversation>\n${formatLog(meaningful)}\n</conversation>`,
        maxOutputTokens: 4000,
        abortSignal: c.req.raw.signal, // 画面を閉じたら AI の生成も止める（料金の無駄を防ぐ）
        onError: ({ error }) => console.error("[ai:summarize] stream error:", error),
      });
      return result.toTextStreamResponse({
        headers: {
          "X-Message-Count": String(meaningful.length),
          "Cache-Control": "no-store",
        },
      });
    } catch (err) {
      throw aiError(err);
    }
  })

  /* 翻訳（同じメッセージ・同じ言語は Redis にキャッシュ） */
  .post("/ai/translate", zValidator("json", translateSchema, validationHook), async (c) => {
    const user = c.get("user");
    const { messageId, target } = c.req.valid("json");
    const model = translateModel();
    await rateLimit(`ai:translate:${user.id}`, 60, 60);

    const msg = await db.query.messages.findFirst({ where: eq(messages.id, messageId) });
    if (!msg) throw notFound("メッセージが見つかりません");
    await requireChannelAccess(msg.channelId, user.id);
    if (!msg.content.trim()) throw notFound("翻訳する本文がありません");

    const cacheKey = `ai:tr:${messageId}:${target}`;
    const cached = await redis.get(cacheKey);
    if (cached !== null) {
      return c.json<TranslateResponse>({ messageId, target, text: cached, cached: true });
    }

    try {
      const { text } = await generateText({
        model,
        instructions: TRANSLATE_INSTRUCTIONS(target),
        prompt: `<text>\n${msg.content}\n</text>`,
        maxOutputTokens: 4000,
        abortSignal: c.req.raw.signal,
      });
      const out = text.trim();
      await redis.set(cacheKey, out, "EX", 60 * 60 * 24 * 7);
      return c.json<TranslateResponse>({ messageId, target, text: out, cached: false });
    } catch (err) {
      throw aiError(err);
    }
  });
