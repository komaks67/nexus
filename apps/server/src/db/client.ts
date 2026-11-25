import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../env.js";
import * as schema from "./schema.js";

/** PostgreSQL への接続（コネクションプール） */
export const sqlClient = postgres(env.DATABASE_URL, { max: 20, idle_timeout: 30 });
export const db = drizzle(sqlClient, { schema });
export type DB = typeof db;
