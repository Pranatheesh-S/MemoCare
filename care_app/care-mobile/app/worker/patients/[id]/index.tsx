import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams, type Href } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { Screen } from "@/Screen";
import { Button, Card, EmptyState, LinkButton, Pill, Row, SectionHeader } from "@/ui";
import { LineChart } from "@/charts";
import { palette, space, stateAccent } from "@/theme";
import { getPatient } from "@/patients";
import { listAlertsForPatients, listHealthChecks, setAlertStatus } from "@/health";
import { stateById, type PatientDoc } from "@/model";
import {
  summariseHealthCheck,
  type CareAlertDoc,
  type HealthCheckDoc,
  type VitalKey,
} from "@/healthModel";

const TREND_METRICS: readonly { key: VitalKey; label: string; unit: string; color: string }[] = [
  { key: "systolic", label: "Blood pressure (systolic)", unit: "mmHg", color: palette.danger },
  { key: "pulse", label: "Pulse", unit: "bpm", color: palette.primary },
  { key: "spo2", label: "Oxygen (SpO₂)", unit: "%", color: palette.warn },
  { key: "weightKg", label: "Weight", unit: "kg", color: palette.sand },
];

function shortDay(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

const SEV_TONE = { urgent: "danger", attention: "warn", info: "info" } as const;

export default function WorkerPatientHub() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [patient, setPatient] = useState<PatientDoc | null>(null);
  const [checks, setChecks] = useState<HealthCheckDoc[]>([]);
  const [alerts, setAlerts] = useState<CareAlertDoc[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [p, c, a] = await Promise.all([
        getPatient(id),
        listHealthChecks(id),
        listAlertsForPatients([id]),
      ]);
      setPatient(p);
      setChecks(c);
      setAlerts(a);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const latest = checks[0];
  const name = patient?.preferredName || patient?.displayName || "Patient";

  const trends = useMemo(() => {
    const ordered = [...checks].reverse().slice(-12); // oldest -> newest
    return TREND_METRICS.map((m) => ({
      ...m,
      points: ordered
        .filter((c) => typeof c[m.key] === "number")
        .map((c) => ({ label: shortDay(c.recordedAt), value: c[m.key] as number })),
    })).filter((t) => t.points.length >= 2);
  }, [checks]);

  const act = async (alertId: string, status: "acknowledged" | "resolved") => {
    await setAlertStatus(alertId, status);
    void load();
  };

  if (loading) {
    return (
      <Screen title="Patient">
        <ActivityIndicator color={palette.primary} style={{ marginTop: space.xl }} />
      </Screen>
    );
  }
  if (!patient) {
    return (
      <Screen title="Patient">
        <Text style={{ color: palette.inkSoft }}>This patient could not be found.</Text>
      </Screen>
    );
  }

  const accent = stateAccent(patient.stateId);
  const openAlerts = alerts.filter((a) => a.status !== "resolved");

  return (
    <Screen eyebrow="Health monitoring" title={name}>
      <Card accent={accent}>
        <Text style={{ color: palette.ink, fontSize: 16, fontWeight: "800" }}>{patient.displayName}</Text>
        <Text style={{ color: palette.inkSoft, fontSize: 13, marginTop: 3 }}>
          {stateById(patient.stateId).name}
          {patient.village ? ` · ${patient.village}` : ""} · age {patient.age}
        </Text>
        <View style={{ flexDirection: "row", gap: space.sm, marginTop: space.md }}>
          {patient.createdByRole === "healthcare_worker" ? (
            <Pill label="You added" tone="info" icon="user-plus" />
          ) : (
            <Pill label="Linked by code" tone="success" icon="link" />
          )}
          {openAlerts.length > 0 ? (
            <Pill label={`${openAlerts.length} open alert${openAlerts.length === 1 ? "" : "s"}`} tone="warn" icon="bell" />
          ) : null}
        </View>
      </Card>

      <View style={{ gap: space.sm, marginTop: space.sm }}>
        <Button
          label="Record a health check"
          icon="plus-circle"
          onPress={() =>
            router.push({ pathname: "/worker/patients/[id]/health-check", params: { id } } as unknown as Href)
          }
        />
        <Button
          label="Weekly & monthly report"
          icon="bar-chart-2"
          variant="secondary"
          onPress={() =>
            router.push({ pathname: "/worker/patients/[id]/report", params: { id } } as unknown as Href)
          }
        />
        <Button
          label="Raise an alert for the caregiver"
          icon="bell"
          variant="ghost"
          onPress={() =>
            router.push({ pathname: "/worker/patients/[id]/raise-alert", params: { id } } as unknown as Href)
          }
        />
      </View>

      <SectionHeader title="Latest check" />
      {latest ? (
        <Card>
          <Row>
            <Text style={{ color: palette.inkSoft, fontSize: 12, fontWeight: "800", letterSpacing: 0.4 }}>
              {new Date(latest.recordedAt).toLocaleString()}
            </Text>
            {latest.concern ? <Pill label="Flagged" tone="danger" icon="alert-triangle" /> : null}
          </Row>
          <Text style={{ color: palette.ink, fontSize: 15, fontWeight: "700", marginTop: 6, lineHeight: 22 }}>
            {summariseHealthCheck(latest)}
          </Text>
          {latest.mood ? (
            <Text style={{ color: palette.inkSoft, fontSize: 13.5, marginTop: 4 }}>Mood: {latest.mood}</Text>
          ) : null}
          {latest.notes ? (
            <Text style={{ color: palette.ink, fontSize: 14, marginTop: 6, lineHeight: 21 }}>{latest.notes}</Text>
          ) : null}
          <Text style={{ color: palette.faint, fontSize: 12, marginTop: 8 }}>Recorded by {latest.recordedByName}</Text>
        </Card>
      ) : (
        <EmptyState
          icon="activity"
          title="No health checks yet"
          body="Record the patient's vitals and how they seem. Readings build a trend over time."
        />
      )}

      {trends.length > 0 ? (
        <>
          <SectionHeader title="Trends" hint={`Last ${checks.length} check${checks.length === 1 ? "" : "s"}.`} />
          {trends.map((t) => (
            <Card key={t.key}>
              <Text style={{ color: palette.ink, fontSize: 14, fontWeight: "800", marginBottom: 6 }}>{t.label}</Text>
              <LineChart data={t.points} unit={t.unit} color={t.color} width={300} height={140} />
            </Card>
          ))}
        </>
      ) : null}

      <SectionHeader
        title={`Alerts (${alerts.length})`}
        action={
          <LinkButton
            label="Raise"
            icon="plus"
            onPress={() =>
              router.push({ pathname: "/worker/patients/[id]/raise-alert", params: { id } } as unknown as Href)
            }
          />
        }
      />
      {alerts.length === 0 ? (
        <Text style={{ color: palette.inkSoft }}>No alerts for this patient.</Text>
      ) : (
        alerts.map((a) => (
          <Card key={a.id}>
            <Row>
              <Pill label={a.severity.toUpperCase()} tone={SEV_TONE[a.severity] ?? "info"} />
              <Text style={{ color: palette.faint, fontSize: 12, fontWeight: "700" }}>{a.status}</Text>
            </Row>
            <Text style={{ color: palette.ink, fontSize: 14.5, lineHeight: 21, marginTop: space.sm }}>{a.message}</Text>
            <Text style={{ color: palette.faint, fontSize: 12, marginTop: 6 }}>
              {a.raisedByRole === "healthcare_worker" ? "You" : a.raisedByName} · {new Date(a.createdAt).toLocaleDateString()}
              {a.audience === "caregiver" ? " · to caregiver" : a.audience === "care_team" ? " · to care team" : ""}
            </Text>
            {a.status !== "resolved" ? (
              <View style={{ flexDirection: "row", gap: space.sm, marginTop: space.md }}>
                <Button
                  label={a.status === "open" ? "Acknowledge" : "Resolve"}
                  variant="secondary"
                  full={false}
                  icon={a.status === "open" ? "eye" : "check"}
                  onPress={() => act(a.id, a.status === "open" ? "acknowledged" : "resolved")}
                />
                {a.status === "acknowledged" ? (
                  <Button label="Resolve" variant="ghost" full={false} icon="check" onPress={() => act(a.id, "resolved")} />
                ) : null}
              </View>
            ) : null}
          </Card>
        ))
      )}

      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: space.lg }}>
        <Feather name="shield" size={13} color={palette.faint} />
        <Text style={{ color: palette.faint, fontSize: 12, flex: 1, lineHeight: 18 }}>
          Health checks and alerts support care coordination. They are not a diagnosis or an emergency service.
        </Text>
      </View>
    </Screen>
  );
}
