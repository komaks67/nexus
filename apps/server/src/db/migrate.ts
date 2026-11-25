import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

/** drizzle/ フォルダのマイグレーション（テーブル作成SQL）を順番に実行する */
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL が設定されていません");
  process.exit(1);
}
const here = path.dirname(fileURLToPath(import.meta.url));
const client = postgres(url, { max: 1 });
try {
  await migrate(drizzle(client), { migrationsFolder: path.resolve(here, "../../drizzle") });
  console.log("✅ マイグレーション完了");
} catch (err) {
  console.error("❌ マイグレーション失敗:", err);
  process.exitCode = 1;
} finally {
  await client.end();
}
