/**
 * Test bootstrap.
 *
 * Points every test at a dedicated PostgreSQL database and applies migrations
 * once per run. Set TEST_DATABASE_URL to use a different database.
 */
import { execSync } from "node:child_process";
import path from "node:path";
import dotenv from "dotenv";

// Load the service .env first so the test database can be derived from the
// developer's real DATABASE_URL (same host, user and password, different name).
dotenv.config({ path: path.resolve(__dirname, "../../.env") });
dotenv.config({ path: path.resolve(__dirname, "../../../../.env") });

const DEFAULT_TEST_DB =
  process.env.TEST_DATABASE_URL ??
  (process.env.DATABASE_URL
    ? process.env.DATABASE_URL.replace(/\/([^/?]+)(\?|$)/, "/smritisetu_test$2")
    : "postgresql://postgres:postgres@localhost:5432/smritisetu_test?schema=public");

process.env.DATABASE_URL = DEFAULT_TEST_DB;
process.env.NODE_ENV = "test";
process.env.JWT_ACCESS_SECRET = "test_access_secret_0123456789abcdef";
process.env.JWT_REFRESH_SECRET = "test_refresh_secret_0123456789abcdef";
process.env.MEDIA_SIGNING_SECRET = "test_media_signing_secret";
process.env.LOG_LEVEL = "silent";
// The ML service is exercised separately; the backend must work without it,
// and individual tests opt back in with a stub.
process.env.ML_SERVICE_ENABLED = "false";
process.env.BCRYPT_ROUNDS = "4";

const serviceRoot = path.resolve(__dirname, "../..");

try {
  execSync("npx prisma migrate deploy", {
    cwd: serviceRoot,
    stdio: "pipe",
    env: { ...process.env, DATABASE_URL: DEFAULT_TEST_DB },
  });
} catch (error) {
  const detail = error instanceof Error ? error.message : String(error);
  throw new Error(
    `Could not prepare the test database at ${DEFAULT_TEST_DB}.\n` +
      "Create it first (createdb smritisetu_test) or set TEST_DATABASE_URL.\n" +
      detail,
  );
}
