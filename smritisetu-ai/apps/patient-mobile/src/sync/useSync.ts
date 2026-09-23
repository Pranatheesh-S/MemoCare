import { useCallback, useEffect, useRef } from "react";
import NetInfo from "@react-native-community/netinfo";
import { AppState, type AppStateStatus } from "react-native";
import { useAppStore } from "../store/appStore";
import { DeviceRepository, SyncQueueRepository } from "../db/repositories";
import { syncNow } from "./syncNow";

const PERIODIC_INTERVAL_MS = 2 * 60 * 1000;

/**
 * Drives synchronisation from three triggers: the network coming back, the app
 * returning to the foreground, and a slow periodic tick. All of them are
 * background work — the patient is never made to wait.
 */
export function useSyncEngine(enabled: boolean) {
  const setOnline = useAppStore((state) => state.setOnline);
  const setSyncState = useAppStore((state) => state.setSyncState);
  const running = useRef(false);
  const wasOffline = useRef(false);

  const refreshCounts = useCallback(async () => {
    try {
      const [pending, device] = await Promise.all([
        new SyncQueueRepository().countPending(),
        new DeviceRepository().get(),
      ]);
      setSyncState({ pendingSyncCount: pending, lastSyncAt: device?.lastSyncAt ?? null });
    } catch {
      // The database is not ready yet; the next tick will pick it up.
    }
  }, [setSyncState]);

  const trigger = useCallback(async () => {
    if (!enabled || running.current) return;
    running.current = true;
    setSyncState({ syncing: true });
    try {
      const outcome = await syncNow();
      setSyncState({
        syncing: false,
        pendingSyncCount: outcome.remaining,
        syncError: outcome.error ?? null,
      });
      await refreshCounts();
    } catch (error) {
      setSyncState({
        syncing: false,
        syncError: error instanceof Error ? error.message : String(error),
      });
    } finally {
      running.current = false;
    }
  }, [enabled, refreshCounts, setSyncState]);

  // Network changes.
  useEffect(() => {
    if (!enabled) return;
    const unsubscribe = NetInfo.addEventListener((state) => {
      const online = Boolean(state.isConnected && state.isInternetReachable !== false);
      setOnline(online);
      // Sync on the transition back to online, not on every event.
      if (online && wasOffline.current) void trigger();
      wasOffline.current = !online;
    });
    return () => unsubscribe();
  }, [enabled, setOnline, trigger]);

  // Foreground.
  useEffect(() => {
    if (!enabled) return;
    const subscription = AppState.addEventListener("change", (status: AppStateStatus) => {
      if (status === "active") void trigger();
    });
    return () => subscription.remove();
  }, [enabled, trigger]);

  // Periodic catch-up.
  useEffect(() => {
    if (!enabled) return;
    void refreshCounts();
    void trigger();
    const interval = setInterval(() => void trigger(), PERIODIC_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [enabled, refreshCounts, trigger]);

  return { syncNow: trigger, refreshCounts };
}
