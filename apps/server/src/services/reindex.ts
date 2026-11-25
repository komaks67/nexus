import { asc, gt } from "drizzle-orm";
import { db, sqlClient } from "../db/client.js";
import { channels, messages } from "../db/schema.js";
import { toMessageDTO } from "../lib/dto.js";
import { redis, redisPub, redisSub } from "../lib/redis.js";
import { ensureSearchIndex, messageIndex, toMessageDoc } from "./search.js";

/**
 * 既存の全メッセージを検索エンジンに登録し直す（検索サーバーを作り直した時などに使う）
 * 実行: npm run search:reindex -w @nexus/server
 */
await ensureSearchIndex();
const channelRows = await db.select().from(channels);
const channelMap = new Map(channelRows.map((c) => [c.id, c]));

let cursor: string | undefined;
let total = 0;
for (;;) {
  const rows = await db.query.messages.findMany({
    where: cursor ? gt(messages.id, cursor) : undefined,
    orderBy: [asc(messages.id)],
    limit: 1000,
    with: { author: true, attachments: true },
  });
  if (rows.length === 0) break;
  const docs = rows.flatMap((m) => {
    const ch = channelMap.get(m.channelId);
    return ch ? [toMessageDoc(toMessageDTO(m, ch.serverId), ch.name)] : [];
  });
  await messageIndex.addDocuments(docs).waitTask({ timeout: 120_000 });
  total += docs.length;
  cursor = rows[rows.length - 1]!.id;
  console.log(`  ${total} 件 登録済み`);
}
console.log(`✅ 再インデックス完了: ${total} 件`);
await sqlClient.end();
await Promise.allSettled([redis.quit(), redisPub.quit(), redisSub.quit()]);
