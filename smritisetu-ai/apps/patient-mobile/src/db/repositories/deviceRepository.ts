import { BaseRepository } from "./base";

export type DeviceConfig = {
  deviceId: string | null;
  deviceIdentifier: string;
  patientId: string | null;
  pairedAt: string | null;
  tokenExpiresAt: string | null;
  packageVersion: number;
  lastSyncAt: string | null;
  lastSyncError: string | null;
};

type Row = {
  device_id: string | null;
  device_identifier: string;
  patient_id: string | null;
  paired_at: string | null;
  token_expires_at: string | null;
  package_version: number;
  last_sync_at: string | null;
  last_sync_error: string | null;
};

/**
 * Device configuration is a single row (id = 1). The device *token* is never
 * stored here — it lives in Expo Secure Store.
 */
export class DeviceRepository extends BaseRepository {
  async save(config: Partial<DeviceConfig> & { deviceIdentifier: string }): Promise<void> {
    const existing = await this.get();
    const merged: DeviceConfig = {
      deviceId: config.deviceId ?? existing?.deviceId ?? null,
      deviceIdentifier: config.deviceIdentifier,
      patientId: config.patientId ?? existing?.patientId ?? null,
      pairedAt: config.pairedAt ?? existing?.pairedAt ?? null,
      tokenExpiresAt: config.tokenExpiresAt ?? existing?.tokenExpiresAt ?? null,
      packageVersion: config.packageVersion ?? existing?.packageVersion ?? 0,
      lastSyncAt: config.lastSyncAt ?? existing?.lastSyncAt ?? null,
      lastSyncError: config.lastSyncError !== undefined ? config.lastSyncError : (existing?.lastSyncError ?? null),
    };

    await this.db.runAsync(
      `INSERT INTO device_config (
         id, device_id, device_identifier, patient_id, paired_at,
         token_expires_at, package_version, last_sync_at, last_sync_error
       ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         device_id = excluded.device_id,
         device_identifier = excluded.device_identifier,
         patient_id = excluded.patient_id,
         paired_at = excluded.paired_at,
         token_expires_at = excluded.token_expires_at,
         package_version = excluded.package_version,
         last_sync_at = excluded.last_sync_at,
         last_sync_error = excluded.last_sync_error`,
      [
        merged.deviceId,
        merged.deviceIdentifier,
        merged.patientId,
        merged.pairedAt,
        merged.tokenExpiresAt,
        merged.packageVersion,
        merged.lastSyncAt,
        merged.lastSyncError,
      ],
    );
  }

  async get(): Promise<DeviceConfig | null> {
    const row = await this.db.getFirstAsync<Row>("SELECT * FROM device_config WHERE id = 1");
    if (!row) return null;
    return {
      deviceId: row.device_id,
      deviceIdentifier: row.device_identifier,
      patientId: row.patient_id,
      pairedAt: row.paired_at,
      tokenExpiresAt: row.token_expires_at,
      packageVersion: row.package_version,
      lastSyncAt: row.last_sync_at,
      lastSyncError: row.last_sync_error,
    };
  }

  async markSynced(at: string): Promise<void> {
    await this.db.runAsync(
      "UPDATE device_config SET last_sync_at = ?, last_sync_error = NULL WHERE id = 1",
      [at],
    );
  }

  async markSyncFailed(error: string): Promise<void> {
    await this.db.runAsync("UPDATE device_config SET last_sync_error = ? WHERE id = 1", [
      error.slice(0, 400),
    ]);
  }

  async setPackageVersion(version: number): Promise<void> {
    await this.db.runAsync("UPDATE device_config SET package_version = ? WHERE id = 1", [version]);
  }

  async clear(): Promise<void> {
    await this.db.runAsync("DELETE FROM device_config");
  }
}
