/**
 * node:sqlite adapter, used by the test suite.
 *
 * It exists so the repositories' real SQL and the real migrations run under
 * test rather than being mocked out. Not bundled into the app.
 */
import type { SqliteDatabase, SqlValue } from "./adapter";

export async function openNodeDatabase(path = ":memory:"): Promise<SqliteDatabase> {
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(path);

  return {
    async execAsync(sql: string) {
      db.exec(sql);
    },
    async runAsync(sql: string, params: SqlValue[] = []) {
      const statement = db.prepare(sql);
      const result = statement.run(...(params as never[]));
      return { changes: Number(result.changes ?? 0) };
    },
    async getAllAsync<T>(sql: string, params: SqlValue[] = []) {
      const statement = db.prepare(sql);
      return statement.all(...(params as never[])) as T[];
    },
    async getFirstAsync<T>(sql: string, params: SqlValue[] = []) {
      const statement = db.prepare(sql);
      const row = statement.get(...(params as never[]));
      return (row ?? null) as T | null;
    },
    async withTransactionAsync(work: () => Promise<void>) {
      db.exec("BEGIN");
      try {
        await work();
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
    async closeAsync() {
      db.close();
    },
  };
}
