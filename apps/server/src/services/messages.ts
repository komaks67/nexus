import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { sendMessageSchema, type MessageDTO, type SendMessageInput } from "@nexus/shared";
import { db } from "../db/client.js";
import { attachments, channelReads, channels, messages } from "../db/schema.js";
import { requireChannelAccess } from "../lib/access.js";
import { toMessageDTO } from "../lib/dto.js";
import { badRequest, notFound } from "../lib/errors.js";
import { uuidv7 } from "../lib/ids.js";
import { rateLimit } from "../lib/rate-limit.js";
import type { AuthUser } from "../types.js";
import { enqueueMessageIndex } from "./search.js";

export async function loadMessageDTO(messageId: string, serverId: string): Promise<MessageDTO | null> {
  const row = await db.query.messages.findFirst({
    where: eq(messages.id, messageId),
    with: { author: true, attachments: true },
  });
  return row ? toMessageDTO(row, serverId) : null;
}

export interface CreateMessageResult {
  message: MessageDTO;
  /** 同じ nonce の再送だった場合 true（通知を再送しない） */
  duplicate: boolean;
  thread: { rootId: string; replyCount: number; lastReplyAt: string } | null;
  channelName: string;
}

/**
 * メッセージを保存する（Socket.io からも REST からも呼べる共通処理）
 */
export async function createMessage(user: AuthUser, raw: SendMessageInput): Promise<CreateMessageResult> {
  const parsed = sendMessageSchema.safeParse(raw);
  if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? "入力が正しくありません");
  const input = parsed.data;

  // 1ユーザー 10秒に20通まで（スパム対策）
  await rateLimit(`msg:${user.id}`, 20, 10);

  const { channel } = await requireChannelAccess(input.channelId, user.id);
  if (channel.type === "VOICE") throw badRequest("ボイスチャンネルにはメッセージを送れません");

  // 二重送信なら既存のメッセージを返す
  const existing = await db.query.messages.findFirst({
    where: and(eq(messages.authorId, user.id), eq(messages.nonce, input.nonce)),
    columns: { id: true },
  });
  if (existing) {
    const dto = await loadMessageDTO(existing.id, channel.serverId);
    if (!dto) throw notFound();
    return { message: dto, duplicate: true, thread: null, channelName: channel.name };
  }

  const id = uuidv7();
  const now = new Date();

  const thread = await db.transaction(async (tx) => {
    let threadInfo: CreateMessageResult["thread"] = null;

    if (input.parentId) {
      const parent = await tx.query.messages.findFirst({
        where: and(eq(messages.id, input.parentId), eq(messages.channelId, channel.id)),
        columns: { id: true, parentId: true },
      });
      if (!parent) throw notFound("返信先のメッセージが見つかりません");
      if (parent.parentId) throw badRequest("スレッド内のメッセージにさらにスレッドは作れません");
    }

    await tx.insert(messages).values({
      id,
      channelId: channel.id,
      authorId: user.id,
      content: input.content.trim(),
      parentId: input.parentId ?? null,
      nonce: input.nonce,
      createdAt: now,
    });

    if (input.attachmentIds.length > 0) {
      // 自分がこのチャンネル用にアップロード済みで、まだ使っていないファイルだけ紐づける
      const updated = await tx
        .update(attachments)
        .set({ messageId: id })
        .where(
          and(
            inArray(attachments.id, input.attachmentIds),
            eq(attachments.uploaderId, user.id),
            eq(attachments.channelId, channel.id),
            eq(attachments.status, "UPLOADED"),
            isNull(attachments.messageId),
          ),
        )
        .returning({ id: attachments.id });
      if (updated.length !== input.attachmentIds.length) {
        throw badRequest("添付ファイルが無効です（アップロード未完了か、既に使用済み）");
      }
    }

    if (input.parentId) {
      const [root] = await tx
        .update(messages)
        .set({ replyCount: sql`${messages.replyCount} + 1`, lastReplyAt: now })
        .where(eq(messages.id, input.parentId))
        .returning({ replyCount: messages.replyCount });
      threadInfo = {
        rootId: input.parentId,
        replyCount: root?.replyCount ?? 1,
        lastReplyAt: now.toISOString(),
      };
    } else {
      await tx.update(channels).set({ lastMessageId: id }).where(eq(channels.id, channel.id));
      // 自分の投稿は既読扱いにする（再ログイン後に自分の発言が未読表示されないように）
      await tx
        .insert(channelReads)
        .values({ userId: user.id, channelId: channel.id, lastReadMessageId: id })
        .onConflictDoUpdate({
          target: [channelReads.userId, channelReads.channelId],
          set: { lastReadMessageId: id, updatedAt: now },
        });
    }
    return threadInfo;
  });

  const dto = await loadMessageDTO(id, channel.serverId);
  if (!dto) throw notFound();

  // 検索インデックスへの登録は「後で」行う（送信の速さに影響させない）
  enqueueMessageIndex(dto, channel.name);

  return { message: dto, duplicate: false, thread, channelName: channel.name };
}
