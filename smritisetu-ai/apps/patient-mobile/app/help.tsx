import React, { useCallback, useEffect, useState } from "react";
import { StyleSheet, View, Image } from "react-native";
import { useRouter } from "expo-router";
import { Screen } from "../src/components/Screen";
import { Text } from "../src/components/Text";
import { Button } from "../src/components/Button";
import { Card } from "../src/components/Card";
import { Avatar } from "../src/components/Avatar";
import { Illustration } from "../src/games/illustrationMap";
import { colors, role } from "../src/theme/colors";
import { radius, spacing } from "../src/theme/tokens";
import { useTranslation } from "../src/i18n/useTranslation";
import { useVoiceGuidance } from "../src/audio/useVoiceGuidance";
import { useAppStore } from "../src/store/appStore";
import { ContactRepository } from "../src/db/repositories";
import { eventQueue } from "../src/sync/eventQueue";
import { syncNow } from "../src/sync/syncNow";
import { callNumber } from "../src/utils/calling";
import type { FamilyContact } from "@smritisetu/shared-types";
import { glossyMintCallAndHeartIcon, glossyRedSosEmergencyButton } from "../src/assets/embeddedAssets";

type Stage = "CONFIRM" | "SENT";

/**
 * I Need Help.
 *
 * Confirm, record a high-priority event locally, try to send it immediately,
 * then show the family contacts so the patient can also call. The event is kept
 * and retried if there is no connection, and the screen always states plainly
 * that this is not an emergency service.
 */
export default function HelpScreen(): React.ReactElement {
  const router = useRouter();
  const { t, language } = useTranslation();
  const { speak, repeat } = useVoiceGuidance("help.confirm");
  const patientId = useAppStore((state) => state.patientId);
  const deviceId = useAppStore((state) => state.deviceId);
  const isOnline = useAppStore((state) => state.isOnline);

  const [stage, setStage] = useState<Stage>("CONFIRM");
  const [delivered, setDelivered] = useState(false);
  const [contacts, setContacts] = useState<FamilyContact[]>([]);

  useEffect(() => {
    if (!patientId) return;
    void (async () => setContacts(await new ContactRepository().listPrimary(patientId)))();
    void speak("help.confirm");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId]);

  const confirm = useCallback(async () => {
    if (!patientId || !deviceId) return;

    // Recorded locally first, so the request survives with no connection.
    await eventQueue.recordHelpRequest({ patientId, deviceId, context: "help_screen" });
    setStage("SENT");
    void speak("help.sent");

    // Then attempt delivery straight away.
    const outcome = await syncNow();
    setDelivered(outcome.accepted > 0 || outcome.duplicates > 0);
  }, [deviceId, patientId, speak]);

  if (stage === "CONFIRM") {
    return (
      <Screen title={t("help.title")} onRepeat={repeat} showBack>
        <View style={styles.confirmBlock}>
          <Image source={glossyRedSosEmergencyButton} style={{ width: 140, height: 140, resizeMode: 'contain' }} />
          <Text variant="heading" weight="bold" color="#1D3A31" center>
            {t("help.confirm")}
          </Text>
        </View>

        <View style={styles.actions}>
          <Button label={t("help.confirmYes")} tone="help" onPress={() => void confirm()} />
          <Button label={t("help.confirmNo")} tone="quiet" onPress={() => router.back()} />
        </View>

        <Text variant="caption" color={role.mutedText} center>
          {t("app.notEmergencyService")}
        </Text>
      </Screen>
    );
  }

  return (
    <Screen title={t("help.title")} onRepeat={repeat} showBack scrollable>
      <View style={styles.sentBanner}>
        <Text variant="subheading" weight="bold" color={colors.mint} center>
          {delivered ? t("help.sent") : isOnline ? t("help.sent") : t("help.pending")}
        </Text>
      </View>

      <Text variant="bodyLarge" weight="medium" center>
        {t("help.callNow")}
      </Text>

      {contacts.map((contact) => (
        <Card key={contact.contactId} tone="surface" style={styles.card}>
          <View style={styles.row}>
            <Avatar uri={contact.photoUrl} name={contact.name} size={72} />
            <View style={styles.details}>
              <Text variant="subheading" weight="bold">
                {contact.name}
              </Text>
              <Text variant="body" color={role.mutedText}>
                {(language === "as" ? contact.relationshipAs : contact.relationshipEn) ??
                  contact.relationshipEn}
              </Text>
            </View>
          </View>
          <Button
            label={t("callFamily.call", { name: contact.name })}
            onPress={() => void callNumber(contact.phoneNumber)}
            icon={<Image source={glossyMintCallAndHeartIcon} style={{ width: 28, height: 28, resizeMode: 'contain' }} />}
          />
        </Card>
      ))}

      <Text variant="caption" color={role.mutedText} center>
        {t("app.notEmergencyService")}
      </Text>

      <Button label={t("common.goHome")} tone="secondary" onPress={() => router.replace("/home")} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  confirmBlock: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xl,
  },
  actions: {
    gap: spacing.md,
  },
  sentBanner: {
    backgroundColor: colors.mediumGreen,
    borderRadius: radius.xl,
    padding: spacing.xl,
  },
  card: {
    gap: spacing.md,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  details: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xs,
  },
});
