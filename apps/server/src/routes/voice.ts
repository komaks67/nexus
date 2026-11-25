import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { voiceTokenSchema, type VoiceParticipantDTO, type VoiceTokenResponse } from "@nexus/shared";
import { z } from "zod";
import { requireChannelAccess } from "../lib/access.js";
import { requireAuth } from "../lib/auth-middleware.js";
import { badRequest, unavailable } from "../lib/errors.js";
import { rateLimit } from "../lib/rate-limit.js";
import { validationHook } from "../lib/validation.js";
import { getIO, rooms } from "../realtime/io.js";
import { createVoiceToken, listVoiceParticipants, livekitPublicUrl, voiceRoomName } from "../services/livekit.js";
import type { AppEnv } from "../types.js";

export const voiceRoutes = new Hono<AppEnv>()
  .use(requireAuth)

  /* ボイスチャンネルの入場券（LiveKit トークン）を発行 */
  .post("/voice/token", zValidator("json", voiceTokenSchema, validationHook), async (c) => {
    const user = c.get("user");
    await rateLimit(`voice:token:${user.id}`, 30, 60);
    const { channelId } = c.req.valid("json");
    const { channel } = await requireChannelAccess(channelId, user.id);
    if (channel.type !== "VOICE") throw badRequest("ボイスチャンネルではありません");

    const token = await createVoiceToken({ channelId, userId: user.id, displayName: user.displayName });
    // 参加者一覧を更新するよう、同じサーバーのメンバーに知らせる
    getIO().to(rooms.server(channel.serverId)).emit("voice:updated", { channelId });
    return c.json<VoiceTokenResponse>({ token, url: livekitPublicUrl, roomName: voiceRoomName(channelId) });
  })

  /* 通話中の参加者一覧 */
  .get(
    "/voice/:channelId/participants",
    zValidator("param", z.object({ channelId: z.uuid() }), validationHook),
    async (c) => {
      const { channelId } = c.req.valid("param");
      const { channel } = await requireChannelAccess(channelId, c.get("user").id);
      if (channel.type !== "VOICE") throw badRequest("ボイスチャンネルではありません");
      try {
        return c.json<{ participants: VoiceParticipantDTO[] }>({
          participants: await listVoiceParticipants(channelId),
        });
      } catch (err) {
        console.error("[voice]", err);
        throw unavailable("音声サーバーに接続できません");
      }
    },
  )

  /* 退出したことを知らせる（参加者一覧の更新用） */
  .post("/voice/:channelId/left", zValidator("param", z.object({ channelId: z.uuid() }), validationHook), async (c) => {
    const { channelId } = c.req.valid("param");
    const { channel } = await requireChannelAccess(channelId, c.get("user").id);
    getIO().to(rooms.server(channel.serverId)).emit("voice:updated", { channelId });
    return c.body(null, 204);
  });
