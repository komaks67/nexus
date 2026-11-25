import type { Server as HttpServer } from "node:http";
import { serve } from "@hono/node-server";
import { app } from "./app.js";
import { sqlClient } from "./db/client.js";
import { env } from "./env.js";
import { redis, redisPub, redisSub } from "./lib/redis.js";
import { setupRealtime } from "./realtime/io.js";
import { ensureSearchIndex, flushSearchQueue } from "./services/search.js";

const httpServer = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`🚀 API + WebSocket サーバー起動: http://localhost:${info.port}`);
}) as HttpServer;

const io = setupRealtime(httpServer);

// 検索エンジンが落ちていてもチャット自体は動くよう、失敗しても起動は続ける
ensureSearchIndex()
  .then(() => console.log("🔎 検索インデックス準備完了"))
  .catch((err: unknown) => console.warn("⚠️ 検索インデックスの準備に失敗（検索は一時的に使えません）:", (err as Error).message));

/* 停止時に、処理中のデータを捨てずにきれいに終了する */
let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n${signal} を受信。終了処理中...`);
  const force = setTimeout(() => process.exit(1), 10_000);
  try {
    await new Promise<void>((resolve) => io.close(() => resolve()));
    await flushSearchQueue();
    await Promise.allSettled([sqlClient.end({ timeout: 5 }), redis.quit(), redisPub.quit(), redisSub.quit()]);
  } finally {
    clearTimeout(force);
    process.exit(0);
  }
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
