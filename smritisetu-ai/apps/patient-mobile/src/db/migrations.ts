/**
 * Local database schema.
 *
 * Migrations are append-only and numbered. `runMigrations` is safe to call on
 * every launch: it applies only what is missing and records what it applied, so
 * an app that is killed mid-migration recovers on the next start.
 */
import type { SqliteDatabase } from "./adapter";

export type Migration = {
  version: number;
  name: string;
  statements: string[];
  /**
   * Optional imperative step, run after `statements` in the same transaction.
   * Use it when a statement cannot be made idempotent in plain SQL (SQLite has
   * no `ADD COLUMN IF NOT EXISTS`) — the "recovers when interrupted" contract
   * requires every migration to be safe to re-run.
   */
  run?: (db: SqliteDatabase) => Promise<void>;
};

/** True if `table` already has a column called `column`. */
async function hasColumn(db: SqliteDatabase, table: string, column: string): Promise<boolean> {
  const cols = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
  return cols.some((c) => c.name === column);
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: "initial_schema",
    statements: [
      `CREATE TABLE IF NOT EXISTS patient_profile (
        patient_id TEXT PRIMARY KEY NOT NULL,
        display_name TEXT NOT NULL,
        preferred_name TEXT NOT NULL,
        age INTEGER NOT NULL,
        location TEXT NOT NULL,
        preferred_language TEXT NOT NULL DEFAULT 'en',
        photo_url TEXT,
        reduced_motion INTEGER NOT NULL DEFAULT 0,
        large_text INTEGER NOT NULL DEFAULT 1,
        audio_guidance_enabled INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL
      )`,

      `CREATE TABLE IF NOT EXISTS device_config (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        device_id TEXT,
        device_identifier TEXT NOT NULL,
        patient_id TEXT,
        paired_at TEXT,
        token_expires_at TEXT,
        package_version INTEGER NOT NULL DEFAULT 0,
        last_sync_at TEXT,
        last_sync_error TEXT
      )`,

      `CREATE TABLE IF NOT EXISTS schedules (
        schedule_id TEXT PRIMARY KEY NOT NULL,
        patient_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        title_en TEXT NOT NULL,
        title_as TEXT,
        detail TEXT,
        critical INTEGER NOT NULL DEFAULT 0,
        occurrences TEXT NOT NULL,
        missed_after_minutes INTEGER NOT NULL DEFAULT 45,
        snooze_minutes INTEGER NOT NULL DEFAULT 10,
        version INTEGER NOT NULL DEFAULT 1,
        active INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_schedules_patient ON schedules (patient_id, active)`,

      `CREATE TABLE IF NOT EXISTS reminder_events (
        event_id TEXT PRIMARY KEY NOT NULL,
        patient_id TEXT NOT NULL,
        device_id TEXT NOT NULL,
        schedule_id TEXT NOT NULL,
        schedule_version INTEGER NOT NULL DEFAULT 1,
        kind TEXT NOT NULL,
        critical INTEGER NOT NULL DEFAULT 0,
        due_at TEXT NOT NULL,
        state TEXT NOT NULL,
        state_changed_at TEXT NOT NULL,
        snooze_count INTEGER NOT NULL DEFAULT 0,
        help_requested INTEGER NOT NULL DEFAULT 0,
        notification_id TEXT,
        sync_status TEXT NOT NULL DEFAULT 'PENDING'
      )`,
      `CREATE INDEX IF NOT EXISTS idx_reminder_due ON reminder_events (patient_id, due_at)`,
      `CREATE INDEX IF NOT EXISTS idx_reminder_schedule_due ON reminder_events (schedule_id, due_at)`,

      `CREATE TABLE IF NOT EXISTS game_sessions (
        event_id TEXT PRIMARY KEY NOT NULL,
        patient_id TEXT NOT NULL,
        device_id TEXT NOT NULL,
        game_type TEXT NOT NULL,
        difficulty INTEGER NOT NULL,
        accuracy REAL,
        response_time_seconds REAL NOT NULL DEFAULT 0,
        hints_used INTEGER NOT NULL DEFAULT 0,
        attempts INTEGER NOT NULL DEFAULT 0,
        completed INTEGER NOT NULL DEFAULT 0,
        abandoned INTEGER NOT NULL DEFAULT 0,
        engagement_duration_seconds INTEGER NOT NULL DEFAULT 0,
        played_at TEXT NOT NULL,
        detail TEXT,
        sync_status TEXT NOT NULL DEFAULT 'PENDING'
      )`,
      `CREATE INDEX IF NOT EXISTS idx_game_played ON game_sessions (patient_id, played_at)`,

      `CREATE TABLE IF NOT EXISTS memory_assets (
        memory_id TEXT PRIMARY KEY NOT NULL,
        patient_id TEXT NOT NULL,
        category TEXT NOT NULL,
        asset_type TEXT NOT NULL,
        title_en TEXT NOT NULL,
        title_as TEXT,
        caption_en TEXT,
        caption_as TEXT,
        story_en TEXT,
        story_as TEXT,
        media_url TEXT,
        local_path TEXT,
        voice_url TEXT,
        voice_local_path TEXT,
        checksum TEXT,
        mime_type TEXT,
        person_name TEXT,
        relationship_en TEXT,
        relationship_as TEXT,
        consent_id TEXT NOT NULL,
        favourite INTEGER NOT NULL DEFAULT 0,
        available INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_memory_category ON memory_assets (patient_id, category)`,

      `CREATE TABLE IF NOT EXISTS family_contacts (
        contact_id TEXT PRIMARY KEY NOT NULL,
        patient_id TEXT NOT NULL,
        name TEXT NOT NULL,
        relationship_en TEXT NOT NULL,
        relationship_as TEXT,
        phone_number TEXT NOT NULL,
        photo_url TEXT,
        local_path TEXT,
        is_primary INTEGER NOT NULL DEFAULT 0,
        display_order INTEGER NOT NULL DEFAULT 0
      )`,
      `CREATE INDEX IF NOT EXISTS idx_contacts_order ON family_contacts (patient_id, display_order)`,

      `CREATE TABLE IF NOT EXISTS difficulty_profiles (
        patient_id TEXT NOT NULL,
        game_type TEXT NOT NULL,
        current_difficulty INTEGER NOT NULL DEFAULT 1,
        hint_level INTEGER NOT NULL DEFAULT 1,
        preview_seconds INTEGER,
        reason_code TEXT,
        explanation TEXT,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (patient_id, game_type)
      )`,

      `CREATE TABLE IF NOT EXISTS sync_queue (
        event_id TEXT PRIMARY KEY NOT NULL,
        event_type TEXT NOT NULL,
        payload TEXT NOT NULL,
        patient_id TEXT NOT NULL,
        device_id TEXT NOT NULL,
        local_created_at TEXT NOT NULL,
        retry_count INTEGER NOT NULL DEFAULT 0,
        last_attempt_at TEXT,
        last_error TEXT,
        status TEXT NOT NULL DEFAULT 'PENDING'
      )`,
      `CREATE INDEX IF NOT EXISTS idx_queue_status ON sync_queue (status, local_created_at)`,

      `CREATE TABLE IF NOT EXISTS language_packages (
        language TEXT PRIMARY KEY NOT NULL,
        version INTEGER NOT NULL,
        translations TEXT NOT NULL,
        audio_prompts TEXT NOT NULL DEFAULT '[]',
        downloaded_at TEXT NOT NULL
      )`,

      `CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
    ],
  },
  {
    version: 2,
    name: "regional_content_pack",
    statements: [],
    // Which regional content pack the patient app loads. Null keeps a device
    // paired before this migration valid — the app falls back to the Assam pack.
    // The actual work is in reconcileSchema(), which also runs unconditionally
    // on every launch so a device whose bookkeeping is out of step still heals.
    run: reconcileSchema,
  },
  {
    version: 3,
    name: "ai_session_plans",
    statements: [
      // One AI personalisation plan per activity: which game to offer, how many
      // items and questions, preview time, hint level and modality, whether to
      // shorten the session or end with a calm activity, and which content to
      // prefer. Written by the on-device planner after each session and refreshed
      // from the server plan when one syncs.
      `CREATE TABLE IF NOT EXISTS session_plans (
        patient_id TEXT NOT NULL,
        game_type TEXT NOT NULL,
        recommended_game_type TEXT NOT NULL,
        difficulty INTEGER NOT NULL DEFAULT 1,
        item_count INTEGER NOT NULL DEFAULT 0,
        question_count INTEGER NOT NULL DEFAULT 1,
        preview_seconds INTEGER NOT NULL DEFAULT 0,
        hint_level INTEGER NOT NULL DEFAULT 1,
        hint_modality TEXT NOT NULL DEFAULT 'VISUAL',
        session_length TEXT NOT NULL DEFAULT 'STANDARD',
        end_with_calm_activity INTEGER NOT NULL DEFAULT 0,
        content_preference TEXT NOT NULL DEFAULT 'STANDARD',
        best_time_of_day TEXT NOT NULL DEFAULT 'UNKNOWN',
        comfort_first INTEGER NOT NULL DEFAULT 0,
        reason_code TEXT NOT NULL DEFAULT 'INITIAL',
        explanation TEXT NOT NULL DEFAULT '',
        confidence REAL NOT NULL DEFAULT 0,
        source TEXT NOT NULL DEFAULT 'baseline',
        model_version TEXT NOT NULL DEFAULT 'personalisation-rules-1.0.0',
        updated_at TEXT NOT NULL,
        PRIMARY KEY (patient_id, game_type)
      )`,
    ],
  },
];

/**
 * Additive columns that must exist regardless of what `schema_migrations` says.
 * `ALTER TABLE ADD COLUMN` is not expressible as `IF NOT EXISTS` in SQLite and,
 * on some expo-sqlite versions, does not behave predictably inside
 * `withTransactionAsync`; running it here, guarded by a `PRAGMA table_info`
 * check and outside any transaction, is both idempotent and self-healing.
 */
const REQUIRED_COLUMNS: Array<{ table: string; column: string; ddl: string }> = [
  { table: "patient_profile", column: "state_id", ddl: "ALTER TABLE patient_profile ADD COLUMN state_id TEXT" },
  { table: "patient_profile", column: "community_id", ddl: "ALTER TABLE patient_profile ADD COLUMN community_id TEXT" },
];

export async function reconcileSchema(db: SqliteDatabase): Promise<void> {
  for (const { table, column, ddl } of REQUIRED_COLUMNS) {
    if (await hasColumn(db, table, column)) continue;
    try {
      await db.execAsync(ddl);
    } catch (error) {
      // A racing launch may have added it between the check and the ALTER.
      if (!(await hasColumn(db, table, column))) throw error;
    }
  }
}

export const LATEST_SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;

export async function runMigrations(db: SqliteDatabase): Promise<number> {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  const applied = await db.getAllAsync<{ version: number }>(
    "SELECT version FROM schema_migrations",
  );
  const appliedVersions = new Set(applied.map((row) => row.version));

  for (const migration of MIGRATIONS) {
    if (appliedVersions.has(migration.version)) continue;
    // Each migration is atomic: a crash halfway leaves it unapplied, and the
    // next launch retries it from the start.
    await db.withTransactionAsync(async () => {
      for (const statement of migration.statements) {
        await db.execAsync(statement);
      }
      await migration.run?.(db);
      await db.runAsync(
        "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)",
        [migration.version, migration.name, new Date().toISOString()],
      );
    });
  }

  // Self-heal: additive columns are reconciled every launch, independent of the
  // migration-version gate, so a device that recorded a migration without its
  // effect landing (an interrupted or misbehaving transaction) still recovers.
  await reconcileSchema(db);

  const current = await db.getFirstAsync<{ version: number }>(
    "SELECT MAX(version) as version FROM schema_migrations",
  );
  return current?.version ?? 0;
}
