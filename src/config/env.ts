import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  COOKIE_SECRET: z.string().min(8),
  JWT_SECRET: z.string().min(8),
  CORS_ORIGINS: z
    .string()
    .default(
      "http://127.0.0.1:5173,http://127.0.0.1:5174,http://127.0.0.1:5175,http://localhost:5173,http://localhost:5174,http://localhost:5175,http://127.0.0.1:3000,http://localhost:3000",
    ),
  R2_ENDPOINT: z.string().min(1),
  R2_BUCKET: z.string().min(1),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_PUBLIC_BASE_URL: z.string().min(1),
  R2_STRICT_HEAD_CHECK: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  OIDC_ISSUER: z.string().min(1).optional(),
  OIDC_CLIENT_ID: z.string().min(1).optional(),
  OIDC_CLIENT_SECRET: z.string().min(1).optional(),
  OIDC_REDIRECT_URI: z.string().min(1).optional(),
  OIDC_POST_LOGIN_REDIRECT: z.string().min(1).optional(),
  OIDC_SCOPE: z.string().default("openid profile"),
  CLOUDFLARE_TURNSTILE_SITE_KEY: z.string().optional(),
  CLOUDFLARE_TURNSTILE_SECRET: z.string().min(1).optional(),
  ANALYSIS_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  ANALYSIS_CLUSTERING_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  ANALYZER_URL: z.string().url().default("http://127.0.0.1:8088"),
  ANALYZER_INTERNAL_TOKEN: z.string().optional(),
  ANALYZER_TIMEOUT_MS: z.coerce.number().int().positive().default(20_000),
  ANALYSIS_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(60_000),
  ANALYSIS_LIGHT_BATCH_SIZE: z.coerce.number().int().positive().max(64).default(8),
  ANALYSIS_IDLE_FREE_MEM_BYTES: z.coerce.number().int().positive().default(6 * 1024 * 1024 * 1024),
  ANALYSIS_PUBLIC_RECLUSTER_INTERVAL_MINUTES: z.coerce.number().int().positive().default(360),
  ANALYSIS_PERSONAL_RECLUSTER_INTERVAL_MINUTES: z.coerce.number().int().positive().default(720),
});

export const env = envSchema.parse(process.env);
export type Env = z.infer<typeof envSchema>;
