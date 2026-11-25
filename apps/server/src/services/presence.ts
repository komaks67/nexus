import type { PresenceStatus } from "@nexus/shared";
import { redis } from "../lib/redis.js";

/**
 * オンライン状態の管理（Redis）。
 * ユーザーごとに「接続中のソケットID → 有効期限」を持つ。
 * 定期的な heartbeat で期限を延ばし、期限切れ＝オフライン扱い。
 * → サーバーが突然落ちても、しばらくすれば自然にオフラインになる。
 */
const TTL_MS = 90_000;
const key = (userId: string) => `presence:${userId}`;

/** 接続を登録。オフライン→オンラインに変わったら true */
export async function addConnection(userId: string, socketId: string): Promise<boolean> {
  const now = Date.now();
  const results = await redis
    .multi()
    .zremrangebyscore(key(userId), "-inf", now)
    .zcard(key(userId))
    .zadd(key(userId), now + TTL_MS, socketId)
    .pexpire(key(userId), TTL_MS * 2)
    .exec();
  const before = Number(results?.[1]?.[1] ?? 0);
  return before === 0;
}

export async function refreshConnection(userId: string, socketId: string): Promise<void> {
  await redis
    .multi()
    .zadd(key(userId), Date.now() + TTL_MS, socketId)
    .pexpire(key(userId), TTL_MS * 2)
    .exec();
}

/** 接続を削除。オンライン→オフラインに変わったら true */
export async function removeConnection(userId: string, socketId: string): Promise<boolean> {
  const now = Date.now();
  const results = await redis
    .multi()
    .zrem(key(userId), socketId)
    .zremrangebyscore(key(userId), "-inf", now)
    .zcard(key(userId))
    .exec();
  return Number(results?.[2]?.[1] ?? 0) === 0;
}

export async function getStatuses(userIds: string[]): Promise<Map<string, PresenceStatus>> {
  const map = new Map<string, PresenceStatus>();
  if (userIds.length === 0) return map;
  const now = Date.now();
  const pipeline = redis.pipeline();
  for (const id of userIds) pipeline.zcount(key(id), now, "+inf");
  const results = await pipeline.exec();
  userIds.forEach((id, i) => {
    map.set(id, Number(results?.[i]?.[1] ?? 0) > 0 ? "online" : "offline");
  });
  return map;
}
