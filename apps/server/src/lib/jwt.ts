import { sign, verify } from "hono/jwt";
import { env } from "../env.js";

export interface TokenPayload {
  sub: string;
  username: string;
  displayName: string;
}

export async function issueToken(p: TokenPayload): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return sign({ ...p, iat: now, exp: now + env.JWT_EXPIRES_IN_SECONDS }, env.JWT_SECRET, "HS256");
}

/** 署名・有効期限を確認して中身を返す。不正なら null */
export async function verifyToken(token: string): Promise<TokenPayload | null> {
  try {
    const payload = await verify(token, env.JWT_SECRET, "HS256");
    if (
      typeof payload.sub !== "string" ||
      typeof payload.username !== "string" ||
      typeof payload.displayName !== "string"
    ) {
      return null;
    }
    return { sub: payload.sub, username: payload.username, displayName: payload.displayName };
  } catch {
    return null;
  }
}
