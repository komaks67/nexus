import { and, eq } from "drizzle-orm";
import type { MemberRole } from "@nexus/shared";
import { db } from "../db/client.js";
import { channels, serverMembers, type Channel } from "../db/schema.js";
import { forbidden, notFound } from "./errors.js";

/**
 * 「この人はこのサーバー／チャンネルを見てよいか」を確認する関数群。
 * 認可（権限チェック）はすべてここを通すことで、チェック漏れを防ぐ。
 */
export async function getMembership(serverId: string, userId: string): Promise<{ role: MemberRole } | null> {
  const row = await db.query.serverMembers.findFirst({
    where: and(eq(serverMembers.serverId, serverId), eq(serverMembers.userId, userId)),
    columns: { role: true },
  });
  return row ?? null;
}

export async function requireMember(serverId: string, userId: string): Promise<{ role: MemberRole }> {
  const m = await getMembership(serverId, userId);
  // 他人のサーバーの存在自体を知られないよう 404 を返す
  if (!m) throw notFound("サーバーが見つかりません");
  return m;
}

export async function requireAdmin(serverId: string, userId: string): Promise<{ role: MemberRole }> {
  const m = await requireMember(serverId, userId);
  if (m.role === "MEMBER") throw forbidden("管理者のみ操作できます");
  return m;
}

export async function requireChannelAccess(
  channelId: string,
  userId: string,
): Promise<{ channel: Channel; role: MemberRole }> {
  const channel = await db.query.channels.findFirst({ where: eq(channels.id, channelId) });
  if (!channel) throw notFound("チャンネルが見つかりません");
  const m = await getMembership(channel.serverId, userId);
  if (!m) throw notFound("チャンネルが見つかりません");
  return { channel, role: m.role };
}

export async function getUserServerIds(userId: string): Promise<string[]> {
  const rows = await db
    .select({ serverId: serverMembers.serverId })
    .from(serverMembers)
    .where(eq(serverMembers.userId, userId));
  return rows.map((r) => r.serverId);
}
