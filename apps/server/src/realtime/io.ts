import type { Server as HttpServer } from "node:http";
import { createAdapter } from "@socket.io/redis-adapter";
import { Server, type Socket } from "socket.io";
import {
  markReadSchema,
  typingSchema,
  type ClientToServerEvents,
  type ServerToClientEvents,
  type SocketData,
} from "@nexus/shared";
import { gt, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { channelReads } from "../db/schema.js";
import { env } from "../env.js";
import { getUserServerIds, requireChannelAccess } from "../lib/access.js";
import { HttpError } from "../lib/errors.js";
import { verifyToken } from "../lib/jwt.js";
import { allow } from "../lib/rate-limit.js";
import { redisPub, redisSub } from "../lib/redis.js";
import { createMessage } from "../services/messages.js";
import { addConnection, refreshConnection, removeConnection } from "../services/presence.js";

export type IO = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

export const rooms = {
  user: (id: string) => `user:${id}`,
  server: (id: string) => `server:${id}`,
};

let io: IO | null = null;

/** ルート（REST API）側からイベントを送るために使う */
export function getIO(): IO {
  if (!io) throw new Error("Socket.io が初期化されていません");
  return io;
}

function errorMessage(err: unknown): string {
  if (err instanceof HttpError) return err.message;
  console.error("[socket]", err);
  return "サーバーでエラーが発生しました";
}

export function setupRealtime(httpServer: HttpServer): IO {
  io = new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(httpServer, {
    path: "/socket.io",
    cors: { origin: env.CORS_ORIGINS, credentials: false },
    maxHttpBufferSize: 64 * 1024, // 1回のイベントは64KBまで（巨大データ攻撃の防止）
    pingInterval: 20_000,
    pingTimeout: 20_000,
    connectionStateRecovery: { maxDisconnectionDuration: 2 * 60 * 1000 },
  });

  // 複数台のサーバーで動かしても、Redis 経由で全員にイベントが届くようにする
  io.adapter(createAdapter(redisPub, redisSub));

  // 接続時の認証（トークンが無い・不正なら接続自体を拒否）
  io.use(async (socket, next) => {
    const token: unknown = socket.handshake.auth?.token;
    if (typeof token !== "string") return next(new Error("UNAUTHORIZED"));
    const payload = await verifyToken(token);
    if (!payload) return next(new Error("UNAUTHORIZED"));
    socket.data = { userId: payload.sub, username: payload.username, displayName: payload.displayName };
    next();
  });

  io.on("connection", (socket) => {
    void onConnection(socket).catch((err) => {
      console.error("[socket] 接続処理に失敗:", err);
      socket.disconnect(true);
    });
  });

  return io;
}

async function onConnection(socket: AppSocket): Promise<void> {
  const { userId } = socket.data;
  const serverIds = await getUserServerIds(userId);
  await socket.join([rooms.user(userId), ...serverIds.map(rooms.server)]);

  if (await addConnection(userId, socket.id)) {
    for (const sid of serverIds) socket.to(rooms.server(sid)).emit("presence", { userId, status: "online" });
  }

  /* ---------- メッセージ送信 ---------- */
  socket.on("message:send", async (payload, ack) => {
    if (typeof ack !== "function") return;
    try {
      const result = await createMessage(
        { id: userId, username: socket.data.username, displayName: socket.data.displayName },
        payload,
      );
      if (!result.duplicate) {
        getIO().to(rooms.server(result.message.serverId)).emit("message:new", result.message);
        if (result.thread) {
          getIO()
            .to(rooms.server(result.message.serverId))
            .emit("thread:updated", { channelId: result.message.channelId, ...result.thread });
        }
      }
      ack({ ok: true, data: result.message });
    } catch (err) {
      ack({ ok: false, error: errorMessage(err) });
    }
  });

  /* ---------- 入力中インジケーター ---------- */
  socket.on("typing:start", async (payload) => {
    const parsed = typingSchema.safeParse(payload);
    if (!parsed.success) return;
    if (!(await allow(`typing:${userId}`, 10, 5))) return;
    try {
      const { channel } = await requireChannelAccess(parsed.data.channelId, userId);
      socket.to(rooms.server(channel.serverId)).emit("typing", {
        channelId: channel.id,
        userId,
        displayName: socket.data.displayName,
      });
    } catch {
      // 権限が無いチャンネルへの typing は黙って無視
    }
  });

  /* ---------- 既読位置の更新 ---------- */
  socket.on("channel:read", async (payload) => {
    const parsed = markReadSchema.safeParse(payload);
    if (!parsed.success) return;
    try {
      await requireChannelAccess(parsed.data.channelId, userId);
      await db
        .insert(channelReads)
        .values({ userId, channelId: parsed.data.channelId, lastReadMessageId: parsed.data.messageId })
        .onConflictDoUpdate({
          target: [channelReads.userId, channelReads.channelId],
          set: { lastReadMessageId: parsed.data.messageId, updatedAt: sql`now()` },
          // 既読位置は「進む」方向にだけ更新する（UUID v7 は時刻順に並ぶ）
          setWhere: gt(sql`excluded.last_read_message_id`, channelReads.lastReadMessageId),
        });
    } catch {
      // 無効なチャンネルは無視
    }
  });

  socket.on("presence:heartbeat", () => {
    void refreshConnection(userId, socket.id).catch(() => undefined);
  });

  socket.on("disconnect", () => {
    void (async () => {
      if (await removeConnection(userId, socket.id)) {
        const ids = await getUserServerIds(userId);
        for (const sid of ids) getIO().to(rooms.server(sid)).emit("presence", { userId, status: "offline" });
      }
    })().catch((err) => console.error("[socket] 切断処理に失敗:", err));
  });
}
