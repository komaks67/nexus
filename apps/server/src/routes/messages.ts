import { zValidator } from "@hono/zod-validator";
import { and, desc, eq, isNull, lt, asc, gt } from "drizzle-orm";
import { Hono } from "hono";
import { LIMITS, sendMessageSchema, type MessageDTO, type MessagePage } from "@nexus/shared";
import { z } from "zod";
import { db } from "../db/client.js";
import { messages } from "../db/schema.js";
import { requireChannelAccess } from "../lib/access.js";
import { requireAuth } from "../lib/auth-middleware.js";
import { toMessageDTO } from "../lib/dto.js";
import { notFound } from "../lib/errors.js";
import { validationHook } from "../lib/validation.js";
import { getIO, rooms } from "../realtime/io.js";
import { createMessage } from "../services/messages.js";
import type { AppEnv } from "../types.js";

const channelParam = z.object({ channelId: z.uuid() });
const historyQuery = z.object({
  before: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(LIMITS.messagePageSize),
});

export const messageRoutes = new Hono<AppEnv>()
  .use(requireAuth)

  /* チャンネルの履歴（新しい順に取得して、古い順に並べて返す） */
  .get(
    "/channels/:channelId/messages",
    zValidator("param", channelParam, validationHook),
    zValidator("query", historyQuery, validationHook),
    async (c) => {
      const { channelId } = c.req.valid("param");
      const { before, limit } = c.req.valid("query");
      const { channel } = await requireChannelAccess(channelId, c.get("user").id);

      const rows = await db.query.messages.findMany({
        where: and(
          eq(messages.channelId, channelId),
          isNull(messages.parentId),
          before ? lt(messages.id, before) : undefined,
        ),
        orderBy: [desc(messages.id)],
        limit: limit + 1,
        with: { author: true, attachments: true },
      });
      const hasMore = rows.length > limit;
      const page = rows.slice(0, limit).reverse();
      return c.json<MessagePage>({ messages: page.map((m) => toMessageDTO(m, channel.serverId)), hasMore });
    },
  )

  /* スレッド（親メッセージ＋返信を古い順） */
  .get(
    "/channels/:channelId/threads/:rootId",
    zValidator("param", z.object({ channelId: z.uuid(), rootId: z.uuid() }), validationHook),
    zValidator("query", z.object({ after: z.uuid().optional() }), validationHook),
    async (c) => {
      const { channelId, rootId } = c.req.valid("param");
      const { after } = c.req.valid("query");
      const { channel } = await requireChannelAccess(channelId, c.get("user").id);

      const root = await db.query.messages.findFirst({
        where: and(eq(messages.id, rootId), eq(messages.channelId, channelId), isNull(messages.parentId)),
        with: { author: true, attachments: true },
      });
      if (!root) throw notFound("スレッドが見つかりません");

      const replies = await db.query.messages.findMany({
        where: and(eq(messages.parentId, rootId), after ? gt(messages.id, after) : undefined),
        orderBy: [asc(messages.id)],
        limit: 500,
        with: { author: true, attachments: true },
      });
      return c.json<{ root: MessageDTO; replies: MessageDTO[] }>({
        root: toMessageDTO(root, channel.serverId),
        replies: replies.map((m) => toMessageDTO(m, channel.serverId)),
      });
    },
  )

  /* WebSocket が使えない環境向けの送信口（中身は Socket.io と同じ処理） */
  .post("/messages", zValidator("json", sendMessageSchema, validationHook), async (c) => {
    const result = await createMessage(c.get("user"), c.req.valid("json"));
    if (!result.duplicate) {
      const io = getIO();
      io.to(rooms.server(result.message.serverId)).emit("message:new", result.message);
      if (result.thread) {
        io.to(rooms.server(result.message.serverId)).emit("thread:updated", {
          channelId: result.message.channelId,
          ...result.thread,
        });
      }
    }
    return c.json<{ message: MessageDTO }>({ message: result.message }, result.duplicate ? 200 : 201);
  });
