import { createApp } from "./app";
import { env } from "./config/env";
import { logger } from "./lib/logger";
import { disconnectPrisma, prisma } from "./lib/prisma";

async function main(): Promise<void> {
  // Fail fast and loudly if the database is unreachable at boot.
  await prisma.$queryRaw`SELECT 1`;

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info("SmritiSetu AI backend started", {
      port: env.PORT,
      env: env.NODE_ENV,
      basePath: env.API_BASE_PATH,
      docs: `http://localhost:${env.PORT}/docs`,
      mlService: env.ML_SERVICE_ENABLED ? env.ML_SERVICE_URL : "disabled",
    });
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info("Shutting down", { signal });
    server.close(async () => {
      await disconnectPrisma();
      process.exit(0);
    });
    // Do not hang forever on a stuck connection.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((error) => {
  logger.error("Failed to start backend", {
    reason: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
