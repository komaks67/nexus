import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { csrf } from "hono/csrf";
import { secureHeaders } from "hono/secure-headers";
import type { ApiErrorBody } from "@nexus/shared";
import { env, isProd } from "./env.js";
import { HttpError } from "./lib/errors.js";
import { aiRoutes } from "./routes/ai.js";
import { authRoutes } from "./routes/auth.js";
import { messageRoutes } from "./routes/messages.js";
import { searchRoutes } from "./routes/search.js";
import { serverRoutes } from "./routes/servers.js";
import { uploadRoutes } from "./routes/uploads.js";
import { voiceRoutes } from "./routes/voice.js";
import type { AppEnv } from "./types.js";

export const app = new Hono<AppEnv>();

/* ---------- セキュリティ系の共通設定 ---------- */
app.use(
  "*",
  secureHeaders({
    // API は JSON しか返さないので、ページとして読み込まれても何も実行させない
    contentSecurityPolicy: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
    crossOriginResourcePolicy: "same-site",
    strictTransportSecurity: isProd ? "max-age=63072000; includeSubDomains" : false,
  }),
);
app.use(
  "/api/*",
  cors({
    origin: env.CORS_ORIGINS,
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    exposeHeaders: ["X-Message-Count"],
    maxAge: 600,
  }),
);
// Cookie 認証は使っていないが、念のためフォーム送信型の CSRF も Origin で弾く（多層防御）
app.use("/api/*", csrf({ origin: env.CORS_ORIGINS }));
app.use("/api/*", bodyLimit({ maxSize: 1024 * 1024, onError: (c) => c.json(errBody("PAYLOAD_TOO_LARGE", "リクエストが大きすぎます"), 413) }));

/* ---------- ルート ---------- */
app.get("/health", (c) => c.json({ ok: true }));
app.route("/api/auth", authRoutes);
app.route("/api/servers", serverRoutes);
app.route("/api", messageRoutes);
app.route("/api", uploadRoutes);
app.route("/api", searchRoutes);
app.route("/api", aiRoutes);
app.route("/api", voiceRoutes);

/* ---------- エラー処理 ---------- */
function errBody(code: string, message: string, details?: unknown): ApiErrorBody {
  return { error: { code, message, ...(details !== undefined && !isProd ? { details } : {}) } };
}

app.notFound((c) => c.json(errBody("NOT_FOUND", "APIが見つかりません"), 404));

app.onError((err, c) => {
  if (err instanceof HttpError) {
    return c.json(errBody(err.code, err.message, err.details), err.status);
  }
  // 想定外のエラーは中身を隠して記録だけする（内部情報の漏えい防止）
  console.error("[unhandled]", err);
  return c.json(errBody("INTERNAL", "サーバーでエラーが発生しました"), 500);
});
