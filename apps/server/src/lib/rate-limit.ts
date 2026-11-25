import { redis } from "./redis.js";
import { tooMany } from "./errors.js";

/**
 * 固定ウィンドウ方式の回数制限。
 * 例: rateLimit("login:ip", 10, 60) → 60秒に10回まで
 */
export async function rateLimit(key: string, limit: number, windowSec: number): Promise<void> {
  const k = `rl:${key}`;
  const results = await redis.multi().incr(k).expire(k, windowSec, "NX").exec();
  const count = Number(results?.[0]?.[1] ?? 0);
  if (count > limit) throw tooMany();
}

/** 例外を投げずに true/false で返す版（Socket.io 用） */
export async function allow(key: string, limit: number, windowSec: number): Promise<boolean> {
  try {
    await rateLimit(key, limit, windowSec);
    return true;
  } catch {
    return false;
  }
}
