/**
 * Minimal database interface.
 *
 * The application runs on expo-sqlite; the test suite runs the *same* SQL
 * against node:sqlite. Repositories depend only on this interface, so the SQL
 * and the migrations are genuinely exercised by the tests rather than mocked.
 */
export type SqlValue = string | number | null;

export interface SqliteDatabase {
  /** Runs one or more statements with no parameters (DDL, PRAGMA). */
  execAsync(sql: string): Promise<void>;
  /** Runs a single parameterised statement. */
  runAsync(sql: string, params?: SqlValue[]): Promise<{ changes: number }>;
  /** Returns every row. */
  getAllAsync<T = Record<string, unknown>>(sql: string, params?: SqlValue[]): Promise<T[]>;
  /** Returns the first row, or null. */
  getFirstAsync<T = Record<string, unknown>>(sql: string, params?: SqlValue[]): Promise<T | null>;
  /** Runs `work` inside a transaction, rolling back if it throws. */
  withTransactionAsync(work: () => Promise<void>): Promise<void>;
  closeAsync(): Promise<void>;
}
