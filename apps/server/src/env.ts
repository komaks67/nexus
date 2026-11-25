import { z } from "zod";

/**
 * 環境変数を起動時にまとめてチェックする。
 * 足りない・おかしい値があれば、その場でエラーにして起動を止める（本番で気づくより安全）。
 */
const boolString = z
  .enum(["true", "false"])
  .default("false")
  .transform((v) => v === "true");

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().default(3001),
  CORS_ORIGINS: z
    .string()
    .default("http://localhost:5173")
    .transform((s) =>
      s
        .split(",")
        .map((o) => o.trim())
        .filter(Boolean),
    ),
  JWT_SECRET: z.string().min(32, "JWT_SECRET は32文字以上にしてください"),
  JWT_EXPIRES_IN_SECONDS: z.coerce.number().int().positive().default(60 * 60 * 24 * 7),

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),

  S3_ENDPOINT: z.string().url(),
  S3_REGION: z.string().default("auto"),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  S3_FORCE_PATH_STYLE: boolString,
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(50 * 1024 ** 3),

  MEILI_HOST: z.string().url(),
  MEILI_MASTER_KEY: z.string().default(""),

  ANTHROPIC_API_KEY: z.string().default(""),
  AI_SUMMARY_MODEL: z.string().default("claude-opus-5-5"),
  AI_TRANSLATE_MODEL: z.string().default("claude-opus-5-5"),

  LIVEKIT_URL: z.string().min(1),
  LIVEKIT_API_KEY: z.string().min(1),
  LIVEKIT_API_SECRET: z.string().min(1),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("❌ 環境変数が正しくありません:");
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === "production";
