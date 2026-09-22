import { useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { Screen } from "./Screen";
import { Button, Card, Field, Note } from "./ui";
import { palette, radius, space } from "./theme";
import { raiseAlert } from "./health";
import {
  ALERT_DISCLAIMER,
  ALERT_SEVERITY_LABEL,
  type AlertAudience,
  type AlertKind,
  type AlertSeverity,
  type CareRole,
} from "./healthModel";

const SEVERITIES: readonly { key: AlertSeverity; icon: React.ComponentProps<typeof Feather>["name"] }[] = [
  { key: "info", icon: "info" },
  { key: "attention", icon: "alert-triangle" },
  { key: "urgent", icon: "alert-octagon" },
];

const SEVERITY_COLOR: Record<AlertSeverity, string> = {
  info: palette.primary,
  attention: palette.warn,
  urgent: palette.danger,
};

/**
 * Raise a care-team alert. The audience is implied by who is raising it — a
 * health worker alerts the family caregiver, a caregiver alerts the health
 * worker — so there is no picker, only a plain statement of who will see it.
 */
export function AlertForm({
  patient,
  role,
  audience,
  presetSeverity = "attention",
  presetMessage = "",
  kind = "note",
  healthCheckId,
  onDone,
}: {
  patient: { id: string; name: string };
  role: CareRole;
  audience: AlertAudience;
  presetSeverity?: AlertSeverity;
  presetMessage?: string;
  kind?: AlertKind;
  healthCheckId?: string;
  onDone: () => void;
}) {
  const [severity, setSeverity] = useState<AlertSeverity>(presetSeverity);
  const [message, setMessage] = useState(presetMessage);
  const [busy, setBusy] = useState(false);

  const audienceLine =
    audience === "care_team"
      ? "Everyone on this patient's care team will see this."
      : audience === "caregiver"
        ? `${patient.name}'s family caregiver will see this in their Alerts.`
        : `${patient.name}'s health worker will see this in their Alerts.`;

  const submit = async () => {
    if (message.trim().length < 4) {
      Alert.alert("Add a short note", "Say what you observed so the other person knows what to do.");
      return;
    }
    setBusy(true);
    try {
      await raiseAlert(patient, { severity, message, audience, kind, healthCheckId }, role);
      onDone();
    } catch (e) {
      Alert.alert("Could not send the alert", e instanceof Error ? e.message : "Try again");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen eyebrow="Raise an alert" title={patient.name} subtitle={audienceLine}>
      <Card>
        <Text style={{ color: palette.inkSoft, fontSize: 11, fontWeight: "800", letterSpacing: 0.7 }}>HOW URGENT</Text>
        <View style={{ flexDirection: "row", gap: space.sm, marginTop: space.sm }}>
          {SEVERITIES.map((s) => {
            const active = severity === s.key;
            const color = SEVERITY_COLOR[s.key];
            return (
              <Pressable
                key={s.key}
                onPress={() => setSeverity(s.key)}
                style={{
                  flex: 1,
                  alignItems: "center",
                  gap: 4,
                  paddingVertical: 12,
                  borderRadius: radius.md,
                  borderWidth: 1.5,
                  borderColor: active ? color : palette.lineStrong,
                  backgroundColor: active ? `${color}14` : palette.card,
                }}
              >
                <Feather name={s.icon} size={16} color={active ? color : palette.inkSoft} />
                <Text style={{ fontSize: 11.5, fontWeight: "800", color: active ? color : palette.inkSoft, textAlign: "center" }}>
                  {ALERT_SEVERITY_LABEL[s.key]}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Field
          label="What did you observe?"
          value={message}
          onChangeText={setMessage}
          placeholder="Blood pressure was 168/98 at the 10am visit, higher than last week. Patient felt dizzy standing up."
          multiline
        />
        <Note>Keep this factual — what you saw and measured. {ALERT_DISCLAIMER}</Note>

        <View style={{ marginTop: space.md }}>
          <Button label="Send alert" icon="send" onPress={submit} loading={busy} />
        </View>
      </Card>
    </Screen>
  );
}
