import type { SqliteDatabase } from "../adapter";
import { getDatabase } from "../index";

/**
 * All SQL lives in repositories. Screens and the sync engine talk to these
 * classes, never to the database directly.
 */
export abstract class BaseRepository {
  protected readonly db: SqliteDatabase;

  constructor(db?: SqliteDatabase) {
    this.db = db ?? getDatabase();
  }

  protected bool(value: unknown): boolean {
    return value === 1 || value === true || value === "1";
  }

  protected toInt(value: boolean): number {
    return value ? 1 : 0;
  }

  protected json<T>(value: unknown, fallback: T): T {
    if (typeof value !== "string" || value.length === 0) return fallback;
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
}
