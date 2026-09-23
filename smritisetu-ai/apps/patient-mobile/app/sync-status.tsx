import React, { useCallback, useEffect, useState } from "react";
import { StyleSheet, View, Image } from "react-native";
import { Screen } from "../src/components/Screen";
import { Text } from "../src/components/Text";
import { Button } from "../src/components/Button";
import { Card } from "../src/components/Card";
import { StatusPill } from "../src/components/StatusPill";
import { colors, role } from "../src/theme/colors";
import { spacing } from "../src/theme/tokens";
import { useTranslation } from "../src/i18n/useTranslation";
import { useVoiceGuidance } from "../src/audio/useVoiceGuidance";
import { useAppStore } from "../src/store/appStore";
import { SyncQueueRepository } from "../src/db/repositories";
import { syncNow } from "../src/sync/syncNow";
import { formatRelative } from "../src/utils/datetime";
import type { SyncStatus } from "@smritisetu/shared-types";

/**
 * Saving status.
 *
 * Framed as "saved to your family" rather than in technical terms. Being
 * offline is presented as normal and safe, because it is: everything is on the
 * device and nothing is lost.
 */
export default function SyncStatusScreen(): React.ReactElement {
  const { t } = useTranslation();
  const { repeat } = useVoiceGuidance("sync.title");

  const isOnline = useAppStore((state) => state.isOnline);
  const lastSyncAt = useAppStore((state) => state.lastSyncAt);
  const syncing = useAppStore((state) => state.syncing);
  const setSyncState = useAppStore((state) => state.setSyncState);

  const [counts, setCounts] = useState<Record<SyncStatus, number> | null>(null);
  const [pending, setPending] = useState(0);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const queue = new SyncQueueRepository();
    setCounts(await queue.countByStatus());
    setPending(await queue.countPending());
  }, []);

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const retry = useCallback(async () => {
    setBusy(true);
    const outcome = await syncNow();
    setSyncState({
      pendingSyncCount: outcome.remaining,
      syncError: outcome.error ?? null,
      lastSyncAt: outcome.error ? lastSyncAt : new Date().toISOString(),
    });
    await refresh();
    setBusy(false);
  }, [lastSyncAt, refresh, setSyncState]);

  const lastSync = formatRelative(lastSyncAt);

  return (
    <Screen title={t("sync.title")} onRepeat={repeat} showBack scrollable>
      <View style={styles.statusRow}>
        <StatusPill
          label={isOnline ? t("home.online") : t("home.offline")}
          tone={isOnline ? "online" : "offline"}
        />
      </View>

      <Card tone="surface" style={styles.card}>
        <View style={{ alignItems: 'center', marginBottom: 12 }}>
          <Image source={{uri: 'file:///Users/muthuraj/.gemini/antigravity-ide/brain/81ea073e-69b4-44be-96a1-0e8ab05c17ea/glossy_3d_sync_cloud_1787863509402.jpg'}} style={{ width: 120, height: 120, borderRadius: 60 }} />
        </View>
        <Text variant="subheading" weight="bold" color="#1D3A31" center>
          {pending === 0 ? t("sync.allSaved") : t("sync.pending", { count: pending })}
        </Text>
        <Text variant="body" color="#5C766C" center>
          {lastSync ? t("sync.lastSuccess", { time: lastSync }) : t("sync.never")}
        </Text>
        {!isOnline ? (
          <Text variant="body" color="#5C766C" center>
            {t("errors.noInternet")}
          </Text>
        ) : null}
      </Card>

      {counts && counts.CONFLICT > 0 ? (
        <Card tone="soft" style={styles.card}>
          <Text variant="body" weight="medium" center>
            {t("sync.failed")}
          </Text>
          <Text variant="caption" color={role.mutedText} center>
            {counts.CONFLICT}
          </Text>
        </Card>
      ) : null}

      <View style={{ marginTop: 24 }}>
        <Button
          label={busy || syncing ? t("sync.syncing") : t("sync.retry")}
          onPress={() => void retry()}
          loading={busy || syncing}
          disabled={!isOnline}
        />
      </View>

      <Text variant="caption" color={colors.mediumGreen} center>
        {t("errors.syncFailed")}
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  statusRow: {
    alignItems: "center",
  },
  card: {
    gap: spacing.sm,
  },
});
