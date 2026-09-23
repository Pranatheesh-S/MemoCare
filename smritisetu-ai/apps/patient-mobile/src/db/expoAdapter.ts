import * as SQLite from "expo-sqlite";
import type { SqliteDatabase, SqlValue } from "./adapter";

export const DATABASE_NAME = "smritisetu.db";

/** Wraps expo-sqlite in the shared SqliteDatabase interface. */
export function wrapExpoDatabase(database: SQLite.SQLiteDatabase): SqliteDatabase {
  return {
    async execAsync(sql: string) {
      await database.execAsync(sql);
    },
    async runAsync(sql: string, params: SqlValue[] = []) {
      const result = await database.runAsync(sql, params);
      return { changes: result.changes };
    },
    async getAllAsync<T>(sql: string, params: SqlValue[] = []) {
      return (await database.getAllAsync(sql, params)) as T[];
    },
    async getFirstAsync<T>(sql: string, params: SqlValue[] = []) {
      return (await database.getFirstAsync(sql, params)) as T | null;
    },
    async withTransactionAsync(work: () => Promise<void>) {
      await database.withTransactionAsync(work);
    },
    async closeAsync() {
      await database.closeAsync();
    },
  };
}

export async function openExpoDatabase(): Promise<SqliteDatabase> {
  const database = await SQLite.openDatabaseAsync(DATABASE_NAME);
  return wrapExpoDatabase(database);
}
