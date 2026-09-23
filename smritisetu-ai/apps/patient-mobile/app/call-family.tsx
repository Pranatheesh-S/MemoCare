import React, { useEffect, useState } from "react";
import { StyleSheet, View, Image } from "react-native";
import { useRouter } from "expo-router";
import { Screen } from "../src/components/Screen";
import { Text } from "../src/components/Text";
import { Button } from "../src/components/Button";
import { Card } from "../src/components/Card";
import { Avatar } from "../src/components/Avatar";
import { EmptyState } from "../src/components/EmptyState";
import { Illustration } from "../src/games/illustrationMap";
import { colors, role } from "../src/theme/colors";
import { spacing } from "../src/theme/tokens";
import { useTranslation } from "../src/i18n/useTranslation";
import { useVoiceGuidance } from "../src/audio/useVoiceGuidance";
import { useAppStore } from "../src/store/appStore";
import { useSpotlightTarget } from "../src/components/SpotlightTarget";
import { ContactRepository } from "../src/db/repositories";
import { callNumber } from "../src/utils/calling";
import type { FamilyContact } from "@smritisetu/shared-types";
import { glossyMintCallAndHeartIcon } from "../src/assets/embeddedAssets";

/**
 * Call Family.
 *
 * One large card per person: photograph, name, relationship, and a single call
 * button. No dial pad, no contact list to scroll, no numbers to remember.
 */
export default function CallFamilyScreen(): React.ReactElement {
  const router = useRouter();
  const { t, language } = useTranslation();
  const { speak, repeat } = useVoiceGuidance("callFamily.title");
  const patientId = useAppStore((state) => state.patientId);
  const storeContacts = useAppStore((state) => state.contacts);
  const setContacts = useAppStore((state) => state.setContacts);

  const [contacts, setLocalContacts] = useState<FamilyContact[]>(storeContacts);
  const [messageKey, setMessageKey] = useState<string | null>(null);

  useEffect(() => {
    if (!patientId) return;
    void (async () => {
      const list = await new ContactRepository().list(patientId);
      setLocalContacts(list);
      setContacts(list);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId]);

  const call = async (contact: FamilyContact) => {
    const result = await callNumber(contact.phoneNumber);
    if (!result.ok) {
      setMessageKey(result.reasonKey);
      void speak(result.reasonKey);
    }
  };

  return (
    <Screen title={t("callFamily.title")} onRepeat={repeat} showBack scrollable>
      {messageKey ? (
        <Text variant="body" color={colors.emergency} center>
          {t(messageKey)}
        </Text>
      ) : null}

      <View style={{ alignItems: 'center', marginBottom: 12 }}>
         <Image source={glossyMintCallAndHeartIcon} style={{ width: 120, height: 120, resizeMode: 'contain' }} />
      </View>

      {contacts.length === 0 ? (
        <EmptyState
          title={t("callFamily.empty")}
          illustration={<Illustration id="Phone" size={90} />}
          actionLabel={t("common.goHome")}
          onAction={() => router.replace("/home")}
        />
      ) : (
        contacts.map((contact) => (
          <Card 
            tone="surface" 
            style={styles.card} 
            key={contact.contactId}
            ref={useSpotlightTarget(`contact-${contact.name}`)}
          >
            <View style={styles.row}>
              <Avatar uri={contact.photoUrl} name={contact.name} relationship={contact.relationshipEn} size={82} />
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
              onPress={() => void call(contact)}
              icon={<Image source={glossyMintCallAndHeartIcon} style={{ width: 28, height: 28, resizeMode: 'contain' }} />}
            />
          </Card>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.lg,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
  },
  details: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xs,
  },
});
