import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../types.js";
import { unauthorized } from "./errors.js";
import { verifyToken } from "./jwt.js";

/**
 * Authorization: Bearer <token> を確認するミドルウェア。
 * Cookie を使わずヘッダーで送るため、他サイトからの「なりすまし送信（CSRF）」は構造的に起きない。
 */
export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const header = c.req.header("Authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7).trim() : null;
  if (!token) throw unauthorized();
  const payload = await verifyToken(token);
  if (!payload) throw unauthorized("ログインの有効期限が切れました。再度ログインしてください");
  c.set("user", { id: payload.sub, username: payload.username, displayName: payload.displayName });
  await next();
});
