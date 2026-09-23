import React, { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, Switch, View, Image } from "react-native";
import { useRouter } from "expo-router";
import { Screen } from "../src/components/Screen";
import { Text } from "../src/components/Text";
import { Button } from "../src/components/Button";
import { Card } from "../src/components/Card";
import { ConfirmDialog } from "../src/components/ConfirmDialog";
import { colors, role } from "../src/theme/colors";
import { MIN_TOUCH_TARGET, spacing, shadow } from "../src/theme/tokens";
import { useTranslation } from "../src/i18n/useTranslation";
import { useVoiceGuidance } from "../src/audio/useVoiceGuidance";
import { saveAutoNarration, saveVoiceSpeed } from "../src/audio/voicePreferences";
import { useAppStore } from "../src/store/appStore";
import { LanguagePackRepository, PatientRepository } from "../src/db/repositories";
import { apiClient } from "../src/api/client";
import { refreshOfflinePackage, unpairDevice } from "../src/session/pairingService";
import { applyUiLanguage } from "../src/i18n/uiLanguage";
import { resolveContentPack } from "../src/content";
import type { SupportedLanguage } from "@smritisetu/shared-types";

/**
 * Settings.
 *
 * Caregiver-facing preferences, kept deliberately short: language, text size,
 * reduced motion, voice guidance. Every change is written to SQLite first so it
 * applies immediately and offline; the server is told opportunistically.
 */
export default function SettingsScreen(): React.ReactElement {
  const router = useRouter();
  const { t } = useTranslation();
  const { repeat } = useVoiceGuidance("settings.title");

  const patientId = useAppStore((state) => state.patientId);
  const language = useAppStore((state) => state.language);
  const stateId = useAppStore((state) => state.stateId);
  const communityId = useAppStore((state) => state.communityId);
  const largeText = useAppStore((state) => state.largeText);
  const reducedMotion = useAppStore((state) => state.reducedMotion);
  const audioGuidanceEnabled = useAppStore((state) => state.audioGuidanceEnabled);
  const autoNarrationEnabled = useAppStore((state) => state.autoNarrationEnabled);
  const voiceSpeed = useAppStore((state) => state.voiceSpeed);
  const isOnline = useAppStore((state) => state.isOnline);
  const setAccessibility = useAppStore((state) => state.setAccessibility);
  const setDownloadedTranslations = useAppStore((state) => state.setDownloadedTranslations);
  const reset = useAppStore((state) => state.reset);

  const pack = useMemo(() => resolveContentPack(stateId, communityId), [stateId, communityId]);
  // English first, then each language the patient's regional pack offers.
  const languageChoices = useMemo(() => {
    const seen = new Set<string>(["en"]);
    const choices: { code: SupportedLanguage; label: string }[] = [
      { code: "en", label: t("settings.english") },
    ];
    for (const lang of pack.languages) {
      if (seen.has(lang.code)) continue;
      seen.add(lang.code);
      choices.push({ code: lang.code, label: `${lang.labelNative} (${lang.labelEn})` });
    }
    return choices;
  }, [pack, t]);

  const [confirmUnpair, setConfirmUnpair] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadedLanguages, setDownloadedLanguages] = useState<SupportedLanguage[]>([]);

  useEffect(() => {
    void (async () => setDownloadedLanguages(await new LanguagePackRepository().listDownloaded()))();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persist = useCallback(
    async (changes: Record<string, unknown>) => {
      await new PatientRepository().updatePreferences(changes);
      if (!patientId || !isOnline) return;
      // Best effort: the local value is already authoritative for the device.
      await apiClient.updatePreferences(patientId, changes).catch(() => undefined);
    },
    [isOnline, patientId],
  );

  const changeLanguage = useCallback(
    async (next: SupportedLanguage) => {
      await applyUiLanguage(next);
      await persist({ preferredLanguage: next });
    },
    [persist],
  );

  const downloadLanguage = useCallback(async () => {
    if (!patientId) return;
    setDownloading(true);
    const ok = await refreshOfflinePackage(patientId, language);
    if (ok) {
      const pack = await new LanguagePackRepository().get(language);
      if (pack) setDownloadedTranslations(pack.translations, pack.audioPrompts);
      setDownloadedLanguages(await new LanguagePackRepository().listDownloaded());
    }
    setDownloading(false);
  }, [language, patientId, setDownloadedTranslations]);

  return (
    <Screen title={t("settings.title")} onRepeat={repeat} showBack scrollable>
      <Card tone="surface" style={[styles.card, shadow.card]}>
        <Text variant="subheading" weight="bold" color="#1D3A31">
          {t("settings.language")}
        </Text>
        <View style={styles.languageRow}>
          {languageChoices.map((choice) => (
            <Button
              key={choice.code}
              label={choice.label}
              tone={language === choice.code ? "primary" : "quiet"}
              onPress={() => void changeLanguage(choice.code)}
              style={styles.languageButton}
            />
          ))}
        </View>
        <Button
          label={t("settings.downloadLanguage")}
          tone="secondary"
          loading={downloading}
          disabled={!isOnline}
          onPress={() => void downloadLanguage()}
        />
        <Text variant="caption" color={role.mutedText}>
          {downloadedLanguages.includes(language) ? t("sync.allSaved") : t("errors.noInternet")}
        </Text>
      </Card>

      <Card tone="surface" style={[styles.card, shadow.card]}>
        <SettingRow
          label={t("settings.largeText")}
          value={largeText}
          onChange={(value) => {
            setAccessibility({ largeText: value });
            void persist({ largeText: value });
          }}
        />
        <SettingRow
          label={t("settings.reducedMotion")}
          value={reducedMotion}
          onChange={(value) => {
            setAccessibility({ reducedMotion: value });
            void persist({ reducedMotion: value });
          }}
        />
        <SettingRow
          label={t("settings.audioGuidance")}
          value={audioGuidanceEnabled}
          onChange={(value) => {
            setAccessibility({ audioGuidanceEnabled: value });
            void persist({ audioGuidanceEnabled: value });
          }}
        />
        {audioGuidanceEnabled ? (
          <>
            <SettingRow
              label={t("settings.autoNarration")}
              value={autoNarrationEnabled}
              onChange={(value) => void saveAutoNarration(value)}
            />
            <View style={styles.settingRow}>
              <Text variant="bodyLarge" weight="medium" style={styles.settingLabel}>
                {t("settings.voiceSpeed")}
              </Text>
              <View style={styles.speedRow}>
                {(["normal", "slow"] as const).map((speed) => (
                  <Button
                    key={speed}
                    label={t(speed === "slow" ? "settings.voiceSpeedSlow" : "settings.voiceSpeedNormal")}
                    tone={voiceSpeed === speed ? "primary" : "quiet"}
                    onPress={() => void saveVoiceSpeed(speed)}
                    style={styles.speedButton}
                  />
                ))}
              </View>
            </View>
          </>
        ) : null}
      </Card>

      <Button
        label={t("settings.syncStatus")}
        tone="secondary"
        onPress={() => router.push("/sync-status")}
      />

      <Button label={t("settings.unpair")} tone="quiet" onPress={() => setConfirmUnpair(true)} />

      <ConfirmDialog
        visible={confirmUnpair}
        title={t("settings.unpair")}
        message={t("settings.unpairConfirm")}
        confirmLabel={t("common.yes")}
        cancelLabel={t("common.cancel")}
        confirmTone="help"
        onConfirm={() => {
          setConfirmUnpair(false);
          void (async () => {
            await unpairDevice();
            reset();
            router.replace("/device-pairing");
          })();
        }}
        onCancel={() => setConfirmUnpair(false)}
      />
    </Screen>
  );
}

function SettingRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}): React.ReactElement {
  return (
    <View style={styles.settingRow}>
      <Text variant="bodyLarge" weight="medium" style={styles.settingLabel}>
        {label}
      </Text>
      <Switch
        value={value}
        onValueChange={onChange}
        accessibilityLabel={label}
        trackColor={{ false: colors.surfaceSoft, true: colors.sage }}
        thumbColor={value ? colors.forest : colors.mediumGreen}
        // A larger switch is easier to hit and easier to see.
        style={styles.switch}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.md,
  },
  languageRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  languageButton: {
    flexGrow: 1,
    flexBasis: "40%",
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: MIN_TOUCH_TARGET,
    gap: spacing.md,
  },
  settingLabel: {
    flex: 1,
  },
  speedRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  speedButton: {
    minWidth: 104,
  },
  switch: {
    transform: [{ scaleX: 1.3 }, { scaleY: 1.3 }],
  },
});
