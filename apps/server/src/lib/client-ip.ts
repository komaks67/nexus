import { getConnInfo } from "@hono/node-server/conninfo";
import type { Context } from "hono";

/**
 * 接続元IPを取得（回数制限に使う）。
 * X-Forwarded-For は偽装できるため、TRUST_PROXY=true（リバースプロキシ配下）の時だけ信用する。
 */
export function clientIp(c: Context): string {
  if (process.env.TRUST_PROXY === "true") {
    const fwd = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
    if (fwd) return fwd;
  }
  try {
    return getConnInfo(c).remote.address ?? "unknown";
  } catch {
    return "unknown";
  }
}
