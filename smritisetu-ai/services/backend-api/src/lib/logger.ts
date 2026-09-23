import { env } from "../config/env";

type Level = "debug" | "info" | "warn" | "error";

const ORDER: Record<Level | "silent", number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
};

function emit(level: Level, message: string, context?: Record<string, unknown>): void {
  if (ORDER[level] < ORDER[env.LOG_LEVEL]) return;
  const line = {
    level,
    time: new Date().toISOString(),
    msg: message,
    ...(context ?? {}),
  };
  const serialised = JSON.stringify(line);
  if (level === "error") process.stderr.write(`${serialised}\n`);
  else process.stdout.write(`${serialised}\n`);
}

export const logger = {
  debug: (message: string, context?: Record<string, unknown>) => emit("debug", message, context),
  info: (message: string, context?: Record<string, unknown>) => emit("info", message, context),
  warn: (message: string, context?: Record<string, unknown>) => emit("warn", message, context),
  error: (message: string, context?: Record<string, unknown>) => emit("error", message, context),
};
