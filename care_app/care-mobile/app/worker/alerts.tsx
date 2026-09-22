import { useCallback, useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/auth";
import { Button, Card, EmptyState, Pill, Row } from "@/ui";
import { palette, space } from "@/theme";
import { listWorkerPatients } from "@/patients";
import { listAlertsForPatients, setAlertStatus } from "@/health";
import { ALERT_DISCLAIMER, alertCounts, visibleAlerts, type CareAlertDoc } from "@/healthModel";

const SEV_TONE = { urgent: "danger", attention: "warn", info: "info" } as const;

export default function WorkerAlerts() {
  const { user } = useAuth();
  const [items, setItems] = useState<CareAlertDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const patients = await listWorkerPatients();
      const ids = patients.map((p) => p.id);
      const all = await listAlertsForPatients(ids);
      setItems(
        visibleAlerts(all, { role: "healthcare_worker", uid: user?.id ?? "", patientIds: ids }),
      );
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
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.paper }} edges={["top", "left", "right"]}>
      <ScrollView
        contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={palette.primary} />}
      >
        <Text style={{ color: palette.primary, fontSize: 11.5, fontWeight: "800", letterSpacing: 1.6 }}>CARE TEAM</Text>
        <Text style={{ color: palette.ink, fontSize: 30, fontWeight: "800", letterSpacing: -0.6, marginTop: 6 }}>Alerts</Text>
        <Text style={{ color: palette.inkSoft, fontSize: 14.5, marginTop: 6 }}>
          {loading ? " " : `${open} open · alerts you raised and alerts from caregivers`}
        </Text>

        {error ? (
          <Card style={{ marginTop: space.md }}>
            <Text style={{ color: palette.danger, fontSize: 13.5 }}>{error}</Text>
          </Card>
        ) : null}

        {!loading && items.length === 0 && !error ? (
          <EmptyState icon="bell-off" title="Nothing to review" body="Alerts about your patients show up here." />
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
              <Text style={{ color: palette.ink, fontSize: 14.5, lineHeight: 21, marginTop: space.sm }}>{a.message}</Text>
              <Text style={{ color: palette.faint, fontSize: 12, marginTop: 6 }}>
                {a.raisedByRole === "healthcare_worker" && a.raisedByUid === user?.id ? "You" : a.raisedByName}
                {a.raisedByRole === "caregiver" ? " (caregiver)" : ""} · {new Date(a.createdAt).toLocaleDateString()}
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
      </ScrollView>
    </SafeAreaView>
  );
}
