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
  CORS_ORIGINS: z.string().default("http://localhost:5173,http://localhost:3000"),
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
});

export const env = envSchema.parse(process.env);
export type Env = z.infer<typeof envSchema>;
