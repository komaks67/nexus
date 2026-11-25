import { zValidator } from "@hono/zod-validator";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import {
  LIMITS,
  completeUploadSchema,
  initUploadSchema,
  type AttachmentDTO,
  type InitUploadResponse,
} from "@nexus/shared";
import { z } from "zod";
import { db } from "../db/client.js";
import { attachments } from "../db/schema.js";
import { env } from "../env.js";
import { requireChannelAccess } from "../lib/access.js";
import { requireAuth } from "../lib/auth-middleware.js";
import { toAttachmentDTO } from "../lib/dto.js";
import { badRequest, notFound } from "../lib/errors.js";
import { uuidv7 } from "../lib/ids.js";
import { rateLimit } from "../lib/rate-limit.js";
import { validationHook } from "../lib/validation.js";
import {
  abortMultipartUpload,
  completeMultipartUpload,
  createMultipartUpload,
  presignDownloadUrl,
  presignPartUrls,
} from "../services/storage.js";
import type { AppEnv } from "../types.js";

/**
 * ブラウザ内でそのまま表示しても安全な形式だけ「インライン表示」を許可する。
 * HTML や SVG はスクリプトを含められるため、必ずダウンロード扱いにする（XSS対策）。
 */
const INLINE_SAFE = /^(image\/(png|jpeg|gif|webp|avif)|video\/(mp4|webm|ogg|quicktime)|audio\/[a-z0-9.+-]+|application\/pdf|text\/plain)$/i;

/** ファイル名から危険な文字を取り除く */
function sanitizeFilename(name: string): string {
  const cleaned = name.replace(/[\u0000-\u001f\u007f/\\]/g, "_").replace(/^\.+/, "_").trim();
  return cleaned.slice(0, 255) || "file";
}

const idParam = z.object({ attachmentId: z.uuid() });

export const uploadRoutes = new Hono<AppEnv>()
  .use(requireAuth)

  /* ① アップロード開始: パートごとの署名付きURLを発行 */
  .post("/uploads", zValidator("json", initUploadSchema, validationHook), async (c) => {
    const user = c.get("user");
    await rateLimit(`upload:${user.id}`, 60, 60 * 10);
    const input = c.req.valid("json");
    if (input.size > env.MAX_UPLOAD_BYTES) {
      throw badRequest(`ファイルが大きすぎます（上限 ${Math.floor(env.MAX_UPLOAD_BYTES / 1024 ** 3)}GB）`);
    }
    const { channel } = await requireChannelAccess(input.channelId, user.id);
    if (channel.type === "VOICE") throw badRequest("ボイスチャンネルにはファイルを送れません");

    const id = uuidv7();
    const filename = sanitizeFilename(input.filename);
    const contentType = /^[\w.+-]+\/[\w.+-]+$/.test(input.contentType) ? input.contentType : "application/octet-stream";
    // 保存先のキーにはユーザー入力のファイル名を使わない（パス操作の防止）
    const storageKey = `attachments/${channel.serverId}/${channel.id}/${id}`;
    const partCount = Math.max(1, Math.ceil(input.size / LIMITS.uploadPartSize));
    if (partCount > 10000) throw badRequest("ファイルが大きすぎます");

    const uploadId = await createMultipartUpload(storageKey, contentType);
    await db.insert(attachments).values({
      id,
      uploaderId: user.id,
      channelId: channel.id,
      filename,
      contentType,
      size: input.size,
      storageKey,
      uploadId,
      status: "PENDING",
    });
    const parts = await presignPartUrls(storageKey, uploadId, partCount);
    return c.json<InitUploadResponse>({ attachmentId: id, uploadId, partSize: LIMITS.uploadPartSize, parts }, 201);
  })

  /* ② アップロード完了: パートを結合して確定 */
  .post(
    "/uploads/:attachmentId/complete",
    zValidator("param", idParam, validationHook),
    zValidator("json", completeUploadSchema, validationHook),
    async (c) => {
      const user = c.get("user");
      const { attachmentId } = c.req.valid("param");
      const { parts } = c.req.valid("json");
      const att = await db.query.attachments.findFirst({
        where: and(eq(attachments.id, attachmentId), eq(attachments.uploaderId, user.id)),
      });
      if (!att || !att.uploadId) throw notFound("アップロードが見つかりません");
      if (att.status === "UPLOADED") return c.json<{ attachment: AttachmentDTO }>({ attachment: toAttachmentDTO(att) });

      try {
        await completeMultipartUpload(att.storageKey, att.uploadId, parts);
      } catch (err) {
        console.error("[upload] complete 失敗:", err);
        throw badRequest("アップロードの確定に失敗しました。もう一度お試しください");
      }
      const [updated] = await db
        .update(attachments)
        .set({ status: "UPLOADED", uploadId: null })
        .where(eq(attachments.id, att.id))
        .returning();
      if (!updated) throw notFound();
      return c.json<{ attachment: AttachmentDTO }>({ attachment: toAttachmentDTO(updated) });
    },
  )

  /* アップロード中止（ストレージ上の途中データも削除） */
  .delete("/uploads/:attachmentId", zValidator("param", idParam, validationHook), async (c) => {
    const user = c.get("user");
    const { attachmentId } = c.req.valid("param");
    const att = await db.query.attachments.findFirst({
      where: and(eq(attachments.id, attachmentId), eq(attachments.uploaderId, user.id)),
    });
    if (!att) throw notFound("アップロードが見つかりません");
    if (att.status === "PENDING" && att.uploadId) {
      await abortMultipartUpload(att.storageKey, att.uploadId).catch((e: unknown) =>
        console.error("[upload] abort 失敗:", e),
      );
      await db.delete(attachments).where(eq(attachments.id, att.id));
    }
    return c.body(null, 204);
  })

  /* プレビュー/ダウンロード用URL（チャンネルのメンバーだけが取得できる） */
  .get(
    "/attachments/:attachmentId/url",
    zValidator("param", idParam, validationHook),
    zValidator("query", z.object({ download: z.enum(["1", "0"]).optional() }), validationHook),
    async (c) => {
      const user = c.get("user");
      const { attachmentId } = c.req.valid("param");
      const att = await db.query.attachments.findFirst({ where: eq(attachments.id, attachmentId) });
      if (!att || att.status !== "UPLOADED") throw notFound("ファイルが見つかりません");
      await requireChannelAccess(att.channelId, user.id);
      // メッセージに付く前のファイルはアップロードした本人だけが見られる
      if (!att.messageId && att.uploaderId !== user.id) throw notFound("ファイルが見つかりません");

      const inline = c.req.valid("query").download !== "1" && INLINE_SAFE.test(att.contentType);
      const url = await presignDownloadUrl(att.storageKey, att.filename, att.contentType, inline);
      return c.json({ url, inline, expiresInSec: 600 });
    },
  );
