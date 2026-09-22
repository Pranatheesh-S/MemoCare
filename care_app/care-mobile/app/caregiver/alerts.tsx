import { useCallback, useState } from "react";
import { Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { useAuth } from "@/auth";
import { Screen } from "@/Screen";
import { Button, Card, EmptyState, Pill, Row } from "@/ui";
import { palette, space } from "@/theme";
import { listPatients } from "@/patients";
import { listAlertsForPatients, setAlertStatus } from "@/health";
import { ALERT_DISCLAIMER, alertCounts, visibleAlerts, type CareAlertDoc } from "@/healthModel";

const SEV_TONE = { urgent: "danger", attention: "warn", info: "info" } as const;

export default function Alerts() {
  const { user } = useAuth();
  const [items, setItems] = useState<CareAlertDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const patients = await listPatients();
      const ids = patients.map((p) => p.id);
      const all = await listAlertsForPatients(ids);
      setItems(visibleAlerts(all, { role: "caregiver", uid: user?.id ?? "", patientIds: ids }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load alerts");
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const act = async (id: string, status: "acknowledged" | "resolved") => {
    await setAlertStatus(id, status);
    void load();
  };

  const { open } = alertCounts(items);

  return (
    <Screen
      eyebrow="Review with care"
      title="Alerts"
      subtitle={loading ? undefined : `${open} need your attention · includes alerts from the health worker`}
    >
      {error ? (
        <Card>
          <Text style={{ color: palette.danger, fontSize: 13.5 }}>{error}</Text>
        </Card>
      ) : null}

      {!loading && items.length === 0 && !error ? (
        <EmptyState icon="bell-off" title="Nothing to review" body="Alerts about your patients — including ones the health worker raises — appear here." />
      ) : (
        items.map((a) => (
          <Card key={a.id}>
            <Row>
              <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
                <Pill label={a.severity.toUpperCase()} tone={SEV_TONE[a.severity] ?? "info"} />
                <Text style={{ color: palette.ink, fontSize: 13.5, fontWeight: "800" }}>{a.patientName}</Text>
              </View>
              <Text style={{ color: palette.faint, fontSize: 12, fontWeight: "700" }}>{a.status}</Text>
            </Row>
            <Text style={{ color: palette.ink, fontSize: 15, lineHeight: 22, marginTop: space.sm }}>{a.message}</Text>
            <Text style={{ color: palette.faint, fontSize: 12, marginTop: 6 }}>
              {a.raisedByRole === "healthcare_worker" ? `${a.raisedByName} (health worker)` : a.raisedByName} ·{" "}
              {new Date(a.createdAt).toLocaleDateString()}
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
      <Text style={{ color: palette.faint, fontSize: 12, textAlign: "center", marginTop: space.lg, lineHeight: 18 }}>
        {ALERT_DISCLAIMER}
      </Text>
    </Screen>
  );
}
