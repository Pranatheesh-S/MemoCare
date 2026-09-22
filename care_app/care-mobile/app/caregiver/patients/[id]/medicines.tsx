import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useLocalSearchParams } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { Button, Card, Note, Pill, Row } from "@/ui";
import { useT } from "@/i18n";
import { palette, radius, space } from "@/theme";
import { useAuth } from "@/auth";
import { getPatient } from "@/patients";
import { getRoutineDay } from "@/routines";
import { listMedicineLog, logMedicine } from "@/medicines";
import { addDays, todayISO } from "@/routineModel";
import {
  adherence,
  groupByDay,
  todaysDoses,
  type MedicineLogEntry,
  type MedicineStatus,
  type PlannedDose,
} from "@/medicineModel";
import type { RoutineItem } from "@/routineModel";

const WINDOW_DAYS = 14;

const STATUS_TONE: Record<MedicineStatus | "pending", "success" | "danger" | "warn" | "neutral"> = {
  taken: "success",
  missed: "danger",
  skipped: "warn",
  pending: "neutral",
};

export default function Medicines() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const t = useT();
  const today = todayISO();

  const [name, setName] = useState("the patient");
  const [scheduled, setScheduled] = useState<RoutineItem[]>([]);
  const [log, setLog] = useState<MedicineLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [manualName, setManualName] = useState("");

  const load = useCallback(async () => {
    setError(null);
    try {
      const [p, day, entries] = await Promise.all([
        getPatient(id),
        getRoutineDay(id, today),
        listMedicineLog(id, addDays(today, -WINDOW_DAYS)),
      ]);
      if (p) setName(p.preferredName || p.displayName || "the patient");
      setScheduled(day?.items ?? []);
      setLog(entries);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the medicine log");
    } finally {
      setLoading(false);
    }
  }, [id, today]);

  useEffect(() => {
    void load();
  }, [load]);

  const todaysLog = useMemo(() => log.filter((e) => e.date === today), [log, today]);
  const doses = useMemo(() => todaysDoses(scheduled, todaysLog), [scheduled, todaysLog]);
  const history = useMemo(() => groupByDay(log), [log]);
  const window = useMemo(() => adherence(log), [log]);

  const record = async (
    key: string,
    entry: Omit<MedicineLogEntry, "id" | "loggedAt" | "loggedByRole" | "loggedByName">,
  ) => {
    setSavingKey(key);
    try {
      await logMedicine(id, {
        ...entry,
        loggedByRole: user?.role === "healthcare_worker" ? "healthcare_worker" : "caregiver",
        loggedByName: user?.name,
      });
      await load();
    } catch (e) {
      Alert.alert("Could not save", e instanceof Error ? e.message : "Try again.");
    } finally {
      setSavingKey(null);
    }
  };

  const logManual = async (status: MedicineStatus) => {
    const nm = manualName.trim();
    if (!nm) {
      Alert.alert("Name the medicine", "Type what was given first.");
      return;
    }
    await record(`manual-${status}`, { date: today, name: nm, status });
    setManualName("");
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.paper }} edges={["bottom"]}>
      <Stack.Screen options={{ title: "" }} />
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl }} keyboardShouldPersistTaps="handled">
        <Text style={{ color: palette.primary, fontSize: 11.5, fontWeight: "800", letterSpacing: 1.6 }}>
          {t("med.eyebrow")}
        </Text>
        <Text style={{ color: palette.ink, fontSize: 26, fontWeight: "800", letterSpacing: -0.5, marginTop: 6 }}>
          {t("med.title", { name })}
        </Text>

        {loading ? (
          <ActivityIndicator color={palette.primary} style={{ marginTop: space.xxl }} />
        ) : error ? (
          <Note tone="warn">{error}</Note>
        ) : (
          <>
            {/* Window adherence */}
            <Card style={{ marginTop: space.md }}>
              <Row>
                <View>
                  <Text style={{ color: palette.ink, fontSize: 15.5, fontWeight: "800" }}>
                    {t("med.lastNDays", { n: WINDOW_DAYS })}
                  </Text>
                  <Text style={{ color: palette.inkSoft, fontSize: 12.5, marginTop: 2 }}>
                    {window.taken} {t("med.taken").toLowerCase()} · {window.considered - window.taken} {t("med.missed").toLowerCase()}
                  </Text>
                </View>
                <Text style={{ color: palette.primary, fontSize: 30, fontWeight: "900" }}>
                  {window.pct === null ? "—" : `${window.pct}%`}
                </Text>
              </Row>
            </Card>

            {/* Today */}
            <Text style={sec}>{t("med.today")}</Text>
            {doses.length === 0 ? (
              <Note>
                No medicines in today&rsquo;s routine. Add them in Daily routine, or log one below.
              </Note>
            ) : (
              doses.map((d) => (
                <DoseRow
                  key={`${d.time}-${d.name}`}
                  dose={d}
                  saving={savingKey === `${d.time}-${d.name}`}
                  onMark={(status) =>
                    record(`${d.time}-${d.name}`, { date: today, time: d.time, name: d.name, status })
                  }
                />
              ))
            )}

            {/* Manual log */}
            <Card style={{ marginTop: space.sm }}>
              <Text style={{ color: palette.inkSoft, fontSize: 11, fontWeight: "800", letterSpacing: 0.6 }}>
                {t("med.logAnother")}
              </Text>
              <TextInput
                value={manualName}
                onChangeText={setManualName}
                placeholder={t("med.name")}
                placeholderTextColor={palette.faint}
                style={{
                  backgroundColor: palette.card,
                  borderColor: palette.lineStrong,
                  borderWidth: 1.5,
                  borderRadius: radius.md,
                  paddingHorizontal: space.md,
                  paddingVertical: 11,
                  fontSize: 15,
                  color: palette.ink,
                  marginTop: 8,
                }}
              />
              <View style={{ flexDirection: "row", gap: space.sm, marginTop: space.sm }}>
                <Button
                  label={t("med.taken")}
                  icon="check"
                  full={false}
                  loading={savingKey === "manual-taken"}
                  onPress={() => void logManual("taken")}
                />
                <Button
                  label={t("med.missed")}
                  icon="x"
                  variant="ghost"
                  full={false}
                  loading={savingKey === "manual-missed"}
                  onPress={() => void logManual("missed")}
                />
              </View>
            </Card>

            {/* History */}
            <Text style={sec}>{t("med.history")}</Text>
            {history.length === 0 ? (
              <Text style={{ color: palette.inkSoft, fontSize: 13.5 }}>{t("med.nothingLogged")}</Text>
            ) : (
              history.map((day) => (
                <Card key={day.date}>
                  <Row>
                    <Text style={{ color: palette.ink, fontSize: 14, fontWeight: "800" }}>{day.date}</Text>
                    <Text style={{ color: palette.inkSoft, fontSize: 12.5 }}>
                      {day.taken} {t("med.taken").toLowerCase()}
                      {day.missed ? ` · ${day.missed} ${t("med.missed").toLowerCase()}` : ""}
                    </Text>
                  </Row>
                  <View style={{ marginTop: space.sm, gap: 6 }}>
                    {day.entries.map((e) => (
                      <View key={e.id} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <Text style={{ color: palette.inkSoft, fontSize: 12, width: 42 }}>{e.time ?? "—"}</Text>
                        <Text style={{ color: palette.ink, fontSize: 13.5, flex: 1 }}>{e.name}</Text>
                        <Pill label={t(`med.${e.status}`)} tone={STATUS_TONE[e.status]} />
                      </View>
                    ))}
                  </View>
                </Card>
              ))
            )}

            <Text style={{ color: palette.faint, fontSize: 11.5, textAlign: "center", marginTop: space.md, lineHeight: 16 }}>
              A record of what was given, for care coordination. It is not medical advice and does not change any
              prescription.
            </Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function DoseRow({
  dose,
  saving,
  onMark,
}: {
  dose: PlannedDose;
  saving: boolean;
  onMark: (status: MedicineStatus) => void;
}) {
  const t = useT();
  const settled = dose.status !== "pending";
  return (
    <Card>
      <Row>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
          <Text style={{ color: palette.inkSoft, fontSize: 13, fontWeight: "700", width: 46 }}>{dose.time}</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ color: palette.ink, fontSize: 15, fontWeight: "800" }}>
              {dose.name}
              {dose.critical ? `  ·  ${t("med.important")}` : ""}
            </Text>
          </View>
        </View>
        <Pill label={t(`med.${dose.status}`)} tone={STATUS_TONE[dose.status]} />
      </Row>
      {!settled ? (
        <View style={{ flexDirection: "row", gap: space.sm, marginTop: space.sm }}>
          <Button label={t("med.taken")} icon="check" full={false} loading={saving} onPress={() => onMark("taken")} />
          <Button label={t("med.missed")} icon="x" variant="ghost" full={false} onPress={() => onMark("missed")} />
        </View>
      ) : null}
    </Card>
  );
}

const sec = {
  color: palette.inkSoft,
  fontSize: 12,
  fontWeight: "800" as const,
  letterSpacing: 0.6,
  marginTop: space.lg,
  marginBottom: space.sm,
};
