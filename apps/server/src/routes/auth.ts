import { zValidator } from "@hono/zod-validator";
import { eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { loginSchema, registerSchema, type AuthResponse } from "@nexus/shared";
import { db } from "../db/client.js";
import { users } from "../db/schema.js";
import { requireAuth } from "../lib/auth-middleware.js";
import { clientIp } from "../lib/client-ip.js";
import { toUserDTO } from "../lib/dto.js";
import { conflict, notFound, unauthorized } from "../lib/errors.js";
import { randomAvatarColor, uuidv7 } from "../lib/ids.js";
import { issueToken } from "../lib/jwt.js";
import { DUMMY_HASH, hashPassword, verifyPassword } from "../lib/password.js";
import { rateLimit } from "../lib/rate-limit.js";
import { validationHook } from "../lib/validation.js";
import type { AppEnv } from "../types.js";

export const authRoutes = new Hono<AppEnv>()
  /* ユーザー登録 */
  .post("/register", zValidator("json", registerSchema, validationHook), async (c) => {
    await rateLimit(`register:${clientIp(c)}`, 5, 60 * 10);
    const input = c.req.valid("json");

    const exists = await db.query.users.findFirst({
      where: eq(sql`lower(${users.username})`, input.username.toLowerCase()),
      columns: { id: true },
    });
    if (exists) throw conflict("このユーザー名は既に使われています");

    const [user] = await db
      .insert(users)
      .values({
        id: uuidv7(),
        username: input.username,
        displayName: input.displayName,
        passwordHash: await hashPassword(input.password),
        avatarColor: randomAvatarColor(),
      })
      .returning();
    if (!user) throw new Error("ユーザー作成に失敗しました");

    const token = await issueToken({ sub: user.id, username: user.username, displayName: user.displayName });
    return c.json<AuthResponse>({ token, user: toUserDTO(user) }, 201);
  })

  /* ログイン */
  .post("/login", zValidator("json", loginSchema, validationHook), async (c) => {
    const input = c.req.valid("json");
    await rateLimit(`login:ip:${clientIp(c)}`, 20, 60);
    await rateLimit(`login:user:${input.username.toLowerCase()}`, 10, 60 * 5);

    const user = await db.query.users.findFirst({
      where: eq(sql`lower(${users.username})`, input.username.toLowerCase()),
    });
    // ユーザーが居なくても同じ時間をかけて、「存在するか」を推測されないようにする
    const ok = await verifyPassword(input.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok) throw unauthorized("ユーザー名またはパスワードが違います");

    const token = await issueToken({ sub: user.id, username: user.username, displayName: user.displayName });
    return c.json<AuthResponse>({ token, user: toUserDTO(user) });
  })

  /* 自分の情報 */
  .get("/me", requireAuth, async (c) => {
    const me = await db.query.users.findFirst({ where: eq(users.id, c.get("user").id) });
    if (!me) throw notFound("ユーザーが見つかりません");
    return c.json({ user: toUserDTO(me) });
  });
