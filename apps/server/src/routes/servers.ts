import { zValidator } from "@hono/zod-validator";
import { and, asc, eq, max } from "drizzle-orm";
import { Hono } from "hono";
import {
  createChannelSchema,
  createServerSchema,
  joinServerSchema,
  type ChannelDTO,
  type MemberDTO,
  type ServerDTO,
} from "@nexus/shared";
import { z } from "zod";
import { db } from "../db/client.js";
import { channelReads, channels, serverMembers, servers, users } from "../db/schema.js";
import { requireAdmin, requireMember } from "../lib/access.js";
import { requireAuth } from "../lib/auth-middleware.js";
import { toChannelDTO, toServerDTO, toUserDTO } from "../lib/dto.js";
import { notFound } from "../lib/errors.js";
import { inviteCode, uuidv7 } from "../lib/ids.js";
import { rateLimit } from "../lib/rate-limit.js";
import { validationHook } from "../lib/validation.js";
import { getIO, rooms } from "../realtime/io.js";
import { getStatuses } from "../services/presence.js";
import type { AppEnv } from "../types.js";

const serverIdParam = z.object({ serverId: z.uuid() });

export const serverRoutes = new Hono<AppEnv>()
  .use(requireAuth)

  /* 参加しているサーバー一覧 */
  .get("/", async (c) => {
    const rows = await db
      .select({ server: servers, role: serverMembers.role })
      .from(serverMembers)
      .innerJoin(servers, eq(servers.id, serverMembers.serverId))
      .where(eq(serverMembers.userId, c.get("user").id))
      .orderBy(asc(serverMembers.joinedAt));
    return c.json<{ servers: ServerDTO[] }>({ servers: rows.map((r) => toServerDTO(r.server, r.role)) });
  })

  /* サーバー作成（最初のチャンネルも一緒に作る） */
  .post("/", zValidator("json", createServerSchema, validationHook), async (c) => {
    const user = c.get("user");
    await rateLimit(`server:create:${user.id}`, 10, 60 * 60);
    const { name } = c.req.valid("json");

    const server = await db.transaction(async (tx) => {
      const [s] = await tx
        .insert(servers)
        .values({ id: uuidv7(), name, ownerId: user.id, inviteCode: inviteCode() })
        .returning();
      if (!s) throw new Error("サーバー作成に失敗しました");
      await tx.insert(serverMembers).values({ serverId: s.id, userId: user.id, role: "OWNER" });
      await tx.insert(channels).values([
        { id: uuidv7(), serverId: s.id, name: "general", type: "TEXT", position: 0, topic: "雑談・連絡" },
        { id: uuidv7(), serverId: s.id, name: "knowledge", type: "KNOWLEDGE", position: 1, topic: "大事な情報のまとめ" },
        { id: uuidv7(), serverId: s.id, name: "voice", type: "VOICE", position: 2, topic: null },
      ]);
      return s;
    });

    const dto = toServerDTO(server, "OWNER");
    // 作成者の全接続をこのサーバーの部屋に参加させる
    getIO().in(rooms.user(user.id)).socketsJoin(rooms.server(server.id));
    return c.json<{ server: ServerDTO }>({ server: dto }, 201);
  })

  /* 招待コードで参加 */
  .post("/join", zValidator("json", joinServerSchema, validationHook), async (c) => {
    const user = c.get("user");
    await rateLimit(`server:join:${user.id}`, 20, 60 * 10);
    const { inviteCode: code } = c.req.valid("json");

    const server = await db.query.servers.findFirst({ where: eq(servers.inviteCode, code) });
    if (!server) throw notFound("招待コードが無効です");

    const inserted = await db
      .insert(serverMembers)
      .values({ serverId: server.id, userId: user.id, role: "MEMBER" })
      .onConflictDoNothing()
      .returning();

    const membership = inserted[0] ?? (await requireMember(server.id, user.id));
    const dto = toServerDTO(server, membership.role);

    const io = getIO();
    io.in(rooms.user(user.id)).socketsJoin(rooms.server(server.id));
    if (inserted[0]) {
      const me = await db.query.users.findFirst({ where: eq(users.id, user.id) });
      if (me) {
        const member: MemberDTO = {
          user: toUserDTO(me),
          role: inserted[0].role,
          status: "online",
          joinedAt: inserted[0].joinedAt.toISOString(),
        };
        io.to(rooms.server(server.id)).emit("member:joined", { serverId: server.id, member });
      }
      io.to(rooms.user(user.id)).emit("server:joined", dto);
    }
    return c.json<{ server: ServerDTO }>({ server: dto });
  })

  /* チャンネル一覧（自分の既読位置つき） */
  .get("/:serverId/channels", zValidator("param", serverIdParam, validationHook), async (c) => {
    const user = c.get("user");
    const { serverId } = c.req.valid("param");
    await requireMember(serverId, user.id);

    const rows = await db
      .select({ channel: channels, lastRead: channelReads.lastReadMessageId })
      .from(channels)
      .leftJoin(channelReads, and(eq(channelReads.channelId, channels.id), eq(channelReads.userId, user.id)))
      .where(eq(channels.serverId, serverId))
      .orderBy(asc(channels.position), asc(channels.id));
    return c.json<{ channels: ChannelDTO[] }>({
      channels: rows.map((r) => toChannelDTO(r.channel, r.lastRead ?? null)),
    });
  })

  /* チャンネル作成（管理者のみ） */
  .post(
    "/:serverId/channels",
    zValidator("param", serverIdParam, validationHook),
    zValidator("json", createChannelSchema, validationHook),
    async (c) => {
      const user = c.get("user");
      const { serverId } = c.req.valid("param");
      await requireAdmin(serverId, user.id);
      const input = c.req.valid("json");

      const [pos] = await db
        .select({ value: max(channels.position) })
        .from(channels)
        .where(eq(channels.serverId, serverId));
      const [channel] = await db
        .insert(channels)
        .values({
          id: uuidv7(),
          serverId,
          name: input.name,
          type: input.type,
          topic: input.topic ?? null,
          position: (pos?.value ?? -1) + 1,
        })
        .returning();
      if (!channel) throw new Error("チャンネル作成に失敗しました");

      const dto = toChannelDTO(channel);
      getIO().to(rooms.server(serverId)).emit("channel:created", dto);
      return c.json<{ channel: ChannelDTO }>({ channel: dto }, 201);
    },
  )

  /* メンバー一覧（オンライン状態つき） */
  .get("/:serverId/members", zValidator("param", serverIdParam, validationHook), async (c) => {
    const { serverId } = c.req.valid("param");
    await requireMember(serverId, c.get("user").id);

    const rows = await db
      .select({ user: users, role: serverMembers.role, joinedAt: serverMembers.joinedAt })
      .from(serverMembers)
      .innerJoin(users, eq(users.id, serverMembers.userId))
      .where(eq(serverMembers.serverId, serverId))
      .orderBy(asc(users.displayName))
      .limit(1000);
    const statuses = await getStatuses(rows.map((r) => r.user.id));
    return c.json<{ members: MemberDTO[] }>({
      members: rows.map((r) => ({
        user: toUserDTO(r.user),
        role: r.role,
        status: statuses.get(r.user.id) ?? "offline",
        joinedAt: r.joinedAt.toISOString(),
      })),
    });
  });
