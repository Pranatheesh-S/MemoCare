/**
 * Database singleton and initialisation.
 *
 * `initialiseDatabase` is called once from the splash screen. It opens the file,
 * runs migrations and reports progress so the splash can show a real status
 * rather than a spinner that means nothing.
 */
import type { SqliteDatabase } from "./adapter";
import { LATEST_SCHEMA_VERSION, runMigrations } from "./migrations";

export type InitResult = {
  ready: boolean;
  schemaVersion: number;
  error?: string;
};

let database: SqliteDatabase | null = null;
let initPromise: Promise<InitResult> | null = null;

/** Overrides the opener; used by tests to run against node:sqlite. */
let opener: (() => Promise<SqliteDatabase>) | null = null;

export function setDatabaseOpener(open: () => Promise<SqliteDatabase>): void {
  opener = open;
  database = null;
  initPromise = null;
}

async function defaultOpener(): Promise<SqliteDatabase> {
  const { openExpoDatabase } = await import("./expoAdapter");
  return openExpoDatabase();
}

export function initialiseDatabase(): Promise<InitResult> {
  // Concurrent callers share one initialisation, so a fast re-render cannot
  // start migrations twice.
  if (!initPromise) {
    initPromise = (async (): Promise<InitResult> => {
      try {
        database = await (opener ?? defaultOpener)();
        const schemaVersion = await runMigrations(database);
        return { ready: true, schemaVersion };
      } catch (error) {
        initPromise = null;
        database = null;
        return {
          ready: false,
          schemaVersion: 0,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    })();
  }
  return initPromise;
}

export function getDatabase(): SqliteDatabase {
  if (!database) {
    throw new Error("The local database is not ready yet. Call initialiseDatabase() first.");
  }
  return database;
}

export function isDatabaseReady(): boolean {
  return database !== null;
}

export async function resetDatabaseHandle(): Promise<void> {
  if (database) await database.closeAsync().catch(() => undefined);
  database = null;
  initPromise = null;
}

export { LATEST_SCHEMA_VERSION };
export type { SqliteDatabase } from "./adapter";
