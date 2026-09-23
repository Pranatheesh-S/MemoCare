import { useCallback, useEffect, useState } from "react";
import { useAppStore } from "../store/appStore";
import { initialiseDatabase } from "../db";
import {
  ContactRepository,
  DeviceRepository,
  PatientRepository,
  MemoryRepository,
} from "../db/repositories";
import { secureStorage } from "../api/secureStorage";
import { applyUiLanguage, loadSavedUiLanguage } from "../i18n/uiLanguage";
import { loadVoicePreferences } from "../audio/voicePreferences";
import { buildLocalDemoPackage } from "./localDemoPackage";
/**
 * Restores the patient session from local storage.
 *
 * Everything needed to run comes from SQLite and the keystore, so the app opens
 * fully usable with no network at all.
 */
export function useSessionBootstrap() {
  const [status, setStatus] = useState<"LOADING" | "READY">("LOADING");
  const [databaseMessageKey, setDatabaseMessageKey] = useState("splash.databasePreparing");
  const setDatabaseReady = useAppStore((state) => state.setDatabaseReady);
  const setPhase = useAppStore((state) => state.setPhase);
  const setSession = useAppStore((state) => state.setSession);
  const setContacts = useAppStore((state) => state.setContacts);
  const setSyncState = useAppStore((state) => state.setSyncState);

  const bootstrap = useCallback(async () => {
    const init = await initialiseDatabase();
    setDatabaseReady(init.ready, init.error ?? null);

    if (!init.ready) {
      setDatabaseMessageKey("errors.generic");
      setPhase("UNPAIRED");
      setStatus("READY");
      return;
    }
    setDatabaseMessageKey("splash.databaseReady");

    await applyUiLanguage(await loadSavedUiLanguage());
    await loadVoicePreferences();

    const [device, patient, token] = await Promise.all([
      new DeviceRepository().get(),
      new PatientRepository().get(),
      secureStorage.getDeviceToken(),
    ]);

    // All three must be present: a profile without a credential cannot sync,
    // and a credential without a profile cannot render a home screen.
    if (!device?.deviceId || !patient || !token) {
      setPhase("UNPAIRED");
      setStatus("READY");
      return;
    }

    setSession({ patient, deviceId: device.deviceId, packageVersion: device.packageVersion });
    setSyncState({ lastSyncAt: device.lastSyncAt ?? null });
    
    // Force re-seed contacts and memories to ensure all categories and songs are present
    const demoPackage = buildLocalDemoPackage();
    await new ContactRepository().replaceAll(patient.patientId, demoPackage.contacts);
    await new MemoryRepository().replaceAll(
      patient.patientId,
      demoPackage.memories.map((m) => ({
        ...m,
        patientId: patient.patientId,
      })),
    );
    
    setContacts(await new ContactRepository().list(patient.patientId));

    setStatus("READY");
  }, [setContacts, setDatabaseReady, setPhase, setSession, setSyncState]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  return { status, databaseMessageKey, reload: bootstrap };
}
