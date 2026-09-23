import path from "node:path";
import dotenv from "dotenv";
import { z } from "zod";

// Load service-local .env first, then fall back to the repository-root .env so
// a single file can drive docker-compose and local development alike.
dotenv.config({ path: path.resolve(__dirname, "../../.env") });
dotenv.config({ path: path.resolve(__dirname, "../../../../.env") });

const booleanish = z
  .union([z.boolean(), z.string()])
  .transform((value) =>
    typeof value === "boolean" ? value : ["1", "true", "yes", "on"].includes(value.toLowerCase()),
  );

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  API_BASE_PATH: z.string().default("/api/v1"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  JWT_ACCESS_SECRET: z.string().min(16, "JWT_ACCESS_SECRET must be at least 16 characters"),
  JWT_REFRESH_SECRET: z.string().min(16, "JWT_REFRESH_SECRET must be at least 16 characters"),
  JWT_ACCESS_TTL: z.string().default("15m"),
  JWT_REFRESH_TTL: z.string().default("30d"),
  DEVICE_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).default(180),

  CORS_ORIGINS: z.string().default("http://localhost:8081,http://localhost:19006"),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().default(15 * 60 * 1000),
  RATE_LIMIT_MAX: z.coerce.number().int().default(300),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().default(20),
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(10),

  MEDIA_DRIVER: z.enum(["local", "s3"]).default("local"),
  MEDIA_LOCAL_DIR: z.string().default("./storage/media"),
  MEDIA_SIGNING_SECRET: z.string().min(8).default("dev_media_signing_secret_change_me"),
  MEDIA_URL_TTL_SECONDS: z.coerce.number().int().default(3600),
  MEDIA_MAX_UPLOAD_BYTES: z.coerce.number().int().default(10 * 1024 * 1024),

  FCM_ENABLED: booleanish.default(false),
  FCM_PROJECT_ID: z.string().optional(),
  FCM_CLIENT_EMAIL: z.string().optional(),
  FCM_PRIVATE_KEY: z.string().optional(),

  ML_SERVICE_URL: z.string().default("http://localhost:8000"),
  ML_SERVICE_TIMEOUT_MS: z.coerce.number().int().default(4000),
  // The session-plan endpoint may call Gemini, so it gets a longer budget.
  ML_SESSION_PLAN_TIMEOUT_MS: z.coerce.number().int().default(15000),
  ML_SERVICE_ENABLED: booleanish.default(true),

  ALERT_MISSED_CRITICAL_THRESHOLD: z.coerce.number().int().min(1).default(2),
  ALERT_INACTIVITY_HOURS: z.coerce.number().int().min(1).default(48),
  ALERT_NO_SYNC_HOURS: z.coerce.number().int().min(1).default(72),
  ALERT_ABANDON_THRESHOLD: z.coerce.number().int().min(1).default(3),

  LOG_LEVEL: z.enum(["debug", "info", "warn", "error", "silent"]).default("info"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
  throw new Error(`Invalid environment configuration:\n${issues}`);
}

export const env = {
  ...parsed.data,
  corsOrigins: parsed.data.CORS_ORIGINS.split(",")
    .map((o) => o.trim())
    .filter(Boolean),
  isProduction: parsed.data.NODE_ENV === "production",
  isTest: parsed.data.NODE_ENV === "test",
};

export type Env = typeof env;
