import { Redis } from "ioredis";
import { env } from "../env.js";

/** 通常のコマンド用 */
export const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 3, lazyConnect: false });
/** Socket.io の複数台連携（Pub/Sub）用。購読用の接続は他のコマンドに使えないので分ける */
export const redisPub = redis.duplicate();
export const redisSub = redis.duplicate();

for (const [name, client] of Object.entries({ redis, redisPub, redisSub })) {
  client.on("error", (err) => console.error(`[redis:${name}]`, err.message));
}
