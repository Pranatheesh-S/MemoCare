import { PrismaClient } from "@prisma/client";
import { env } from "../config/env";

declare global {
  // eslint-disable-next-line no-var
  var __smritisetuPrisma: PrismaClient | undefined;
}

export const prisma =
  global.__smritisetuPrisma ??
  new PrismaClient({
    // Expected constraint violations (alert deduplication, event replay) are
    // caught and handled, so Prisma's own error logging is noise in tests.
    log: env.isTest ? [] : env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (!env.isProduction) {
  global.__smritisetuPrisma = prisma;
}

export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
}
