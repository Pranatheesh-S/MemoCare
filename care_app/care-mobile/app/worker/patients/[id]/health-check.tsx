import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, Switch, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { Screen } from "@/Screen";
import { Button, Card, Field, Note, Row } from "@/ui";
import { palette, radius, space } from "@/theme";
import { getPatientName, raiseAlert, recordHealthCheck } from "@/health";
import {
  APPETITE_OPTIONS,
  VITAL_FIELDS,
  concernHints,
  emptyHealthCheckDraft,
  healthCheckHasContent,
  parseVital,
  summariseHealthCheck,
  type Appetite,
  type HealthCheckDraft,
  type VitalKey,
} from "@/healthModel";

export default function RecordHealthCheck() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [name, setName] = useState("Patient");
  const [raw, setRaw] = useState<Partial<Record<VitalKey, string>>>({});
  const [appetite, setAppetite] = useState<Appetite | undefined>();
  const [mood, setMood] = useState("");
  const [notes, setNotes] = useState("");
  const [concern, setConcern] = useState(false);
  const [alertCaregiver, setAlertCaregiver] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void getPatientName(id).then(setName);
  }, [id]);

  const draft: HealthCheckDraft = useMemo(() => {
    const d = { ...emptyHealthCheckDraft(), appetite, mood, notes, concern };
    for (const f of VITAL_FIELDS) {
      const n = parseVital(raw[f.key] ?? "");
      if (n !== undefined) d[f.key] = n;
    }
    return d;
  }, [raw, appetite, mood, notes, concern]);

  const hints = useMemo(() => concernHints(draft), [draft]);
  const ready = healthCheckHasContent(draft);

  // If a reading looks unusual, default to flagging + alerting.
  useEffect(() => {
    if (hints.length > 0) {
      setConcern(true);
      setAlertCaregiver(true);
    }
  }, [hints.length]);

  const save = async () => {
    if (!ready) {
      Alert.alert("Nothing to save", "Enter at least one reading or a note.");
      return;
    }
    setBusy(true);
    try {
      await recordHealthCheck(id, draft);
      if (alertCaregiver) {
        await raiseAlert(
          { id, name },
          {
            severity: concern ? "attention" : "info",
            message: notes.trim() ? `${notes.trim()} — ${summariseHealthCheck(draft)}` : summariseHealthCheck(draft),
            audience: "caregiver",
            kind: "health_risk",
          },
          "healthcare_worker",
        );
      }
      router.back();
    } catch (e) {
      Alert.alert("Could not save the check", e instanceof Error ? e.message : "Try again");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen eyebrow="Health monitoring" title="Record a health check" subtitle={`For ${name}. Fill in what you measured — leave the rest blank.`}>
      <Card>
        {VITAL_FIELDS.map((f) => (
          <Field
            key={f.key}
            label={`${f.label} (${f.unit})`}
            value={raw[f.key] ?? ""}
            onChangeText={(v) => setRaw((r) => ({ ...r, [f.key]: v }))}
            placeholder={`${f.min}–${f.max}`}
            keyboardType="decimal-pad"
          />
        ))}
      </Card>

      <Card>
        <Text style={{ color: palette.inkSoft, fontSize: 11, fontWeight: "800", letterSpacing: 0.7 }}>APPETITE</Text>
        <View style={{ flexDirection: "row", gap: space.sm, marginTop: space.sm }}>
          {APPETITE_OPTIONS.map((opt) => {
            const active = appetite === opt;
            return (
              <Pressable
                key={opt}
                onPress={() => setAppetite(active ? undefined : opt)}
                style={{
                  flex: 1,
                  alignItems: "center",
                  paddingVertical: 10,
                  borderRadius: radius.md,
                  borderWidth: 1.5,
                  borderColor: active ? palette.primary : palette.lineStrong,
                  backgroundColor: active ? palette.primaryTint : palette.card,
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: "800", color: active ? palette.primaryDark : palette.inkSoft }}>
                  {opt[0].toUpperCase() + opt.slice(1)}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Field label="Mood / how they seem" value={mood} onChangeText={setMood} placeholder="Calm, chatty" />
        <Field
          label="Notes"
          value={notes}
          onChangeText={setNotes}
          placeholder="Walked to the courtyard unaided. Ate lunch well. Slight cough."
          multiline
        />
      </Card>

      {hints.map((h) => (
        <Note key={h} tone="warn">
          {h}
        </Note>
      ))}

      <Card>
        <Row style={{ paddingVertical: 6 }}>
          <View style={{ flex: 1, paddingRight: space.md }}>
            <Text style={{ color: palette.ink, fontSize: 14.5, fontWeight: "700" }}>Flag this check for attention</Text>
            <Text style={{ color: palette.inkSoft, fontSize: 12.5, marginTop: 2 }}>Marks it clearly in the patient's history.</Text>
          </View>
          <Switch value={concern} onValueChange={setConcern} trackColor={{ true: palette.warn }} />
        </Row>
        <View style={{ height: 1, backgroundColor: palette.line, marginVertical: space.sm }} />
        <Row style={{ paddingVertical: 6 }}>
          <View style={{ flex: 1, paddingRight: space.md }}>
            <Text style={{ color: palette.ink, fontSize: 14.5, fontWeight: "700" }}>Alert the caregiver now</Text>
            <Text style={{ color: palette.inkSoft, fontSize: 12.5, marginTop: 2 }}>Sends this reading to the family caregiver's Alerts.</Text>
          </View>
          <Switch value={alertCaregiver} onValueChange={setAlertCaregiver} trackColor={{ true: palette.primary }} />
        </Row>
      </Card>

      <View style={{ marginTop: space.md }}>
        <Button
          label={alertCaregiver ? "Save & alert caregiver" : "Save health check"}
          icon="check-circle"
          onPress={save}
          loading={busy}
          disabled={!ready}
        />
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: space.md }}>
        <Feather name="shield" size={13} color={palette.faint} />
        <Text style={{ color: palette.faint, fontSize: 12, flex: 1, lineHeight: 18 }}>
          A recorded observation for care coordination. Not a diagnosis.
        </Text>
      </View>
    </Screen>
  );
}
