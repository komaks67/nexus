import { AccessToken, RoomServiceClient, TrackSource } from "livekit-server-sdk";
import type { VoiceParticipantDTO } from "@nexus/shared";
import { env } from "../env.js";

/**
 * LiveKit（音声・映像の中継サーバー）との連携。
 * サーバーは「この部屋に入ってよい」という入場券（アクセストークン）を発行するだけで、
 * 音声・映像データそのものはブラウザ ⇔ LiveKit 間で直接やり取りされる。
 */
const httpUrl = env.LIVEKIT_URL.replace(/^ws(s?):\/\//, "http$1://");
const roomService = new RoomServiceClient(httpUrl, env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET);

export const voiceRoomName = (channelId: string) => `voice:${channelId}`;

export async function createVoiceToken(opts: {
  channelId: string;
  userId: string;
  displayName: string;
}): Promise<string> {
  const at = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, {
    identity: opts.userId,
    name: opts.displayName,
    ttl: "6h",
  });
  at.addGrant({
    room: voiceRoomName(opts.channelId),
    roomJoin: true,
    canSubscribe: true,
    canPublish: true,
    canPublishData: true,
    canPublishSources: [
      TrackSource.MICROPHONE,
      TrackSource.CAMERA,
      TrackSource.SCREEN_SHARE,
      TrackSource.SCREEN_SHARE_AUDIO,
    ],
  });
  return at.toJwt();
}

export async function listVoiceParticipants(channelId: string): Promise<VoiceParticipantDTO[]> {
  try {
    const participants = await roomService.listParticipants(voiceRoomName(channelId));
    return participants.map((p) => {
      const mic = p.tracks.find((t) => t.source === TrackSource.MICROPHONE);
      return {
        userId: p.identity,
        displayName: p.name || p.identity,
        isSpeaking: false,
        isMuted: !mic || mic.muted,
        isScreenSharing: p.tracks.some((t) => t.source === TrackSource.SCREEN_SHARE),
      };
    });
  } catch (err) {
    // 部屋がまだ無い（誰も入っていない）場合は 404 になるので空で返す
    const msg = (err as Error).message ?? "";
    if (/not.?found|does not exist|404/i.test(msg)) return [];
    throw err;
  }
}

export const livekitPublicUrl = env.LIVEKIT_URL;
