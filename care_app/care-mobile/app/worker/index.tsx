import { useCallback, useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { router, useFocusEffect, type Href } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { listWorkerPatients } from "@/patients";
import { stateById, type PatientDoc } from "@/model";
import { Avatar, Button, Card, EmptyState, Pill, Row } from "@/ui";
import { palette, space, stateAccent } from "@/theme";

export default function WorkerPatients() {
  const [patients, setPatients] = useState<PatientDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setPatients(await listWorkerPatients());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load patients");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.paper }} edges={["top", "left", "right"]}>
      <ScrollView
        contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={palette.primary} />}
      >
        <Text style={{ color: palette.primary, fontSize: 11.5, fontWeight: "800", letterSpacing: 1.6 }}>
          HEALTHCARE WORKER
        </Text>
        <Text style={{ color: palette.ink, fontSize: 30, fontWeight: "800", letterSpacing: -0.6, marginTop: 6 }}>
          Patients
        </Text>
        <Text style={{ color: palette.inkSoft, fontSize: 14.5, marginTop: 6 }}>
          {patients.length === 0
            ? "No one in your care yet."
            : `${patients.length} ${patients.length === 1 ? "patient" : "patients"} in your care`}
        </Text>

        <View style={{ marginTop: space.lg, gap: space.sm }}>
          <Button label="Add a patient" icon="plus" onPress={() => router.push("/worker/patients/new" as Href)} />
          <Button
            label="Link with a caregiver's code"
            icon="link"
            variant="secondary"
            onPress={() => router.push("/worker/patients/link" as Href)}
          />
        </View>

        {error ? (
          <Card style={{ marginTop: space.md }}>
            <Row>
              <Feather name="wifi-off" size={16} color={palette.danger} />
              <Text style={{ color: palette.danger, marginLeft: 8, flex: 1, fontSize: 13.5 }}>{error}</Text>
            </Row>
          </Card>
        ) : null}

        {!loading && patients.length === 0 && !error ? (
          <EmptyState
            icon="user-plus"
            title="No patients yet"
            body="Add a new patient, or link to one a caregiver already set up using their 6-character code."
          />
        ) : (
          patients.map((p) => {
            const st = stateById(p.stateId);
            const accent = stateAccent(p.stateId);
            return (
              <Card
                key={p.id}
                accent={accent}
                onPress={() =>
                  router.push({ pathname: "/worker/patients/[id]", params: { id: p.id } } as unknown as Href)
                }
              >
                <Row style={{ alignItems: "flex-start" }}>
                  <View style={{ flexDirection: "row", gap: space.md, flex: 1 }}>
                    <Avatar name={p.preferredName || p.displayName} accent={accent} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: palette.ink, fontSize: 18, fontWeight: "800", letterSpacing: -0.3 }}>
                        {p.preferredName || p.displayName}
                      </Text>
                      <Text style={{ color: palette.inkSoft, fontSize: 13, marginTop: 3 }}>
                        {st.name}
                        {p.village ? ` · ${p.village}` : ""} · age {p.age}
                      </Text>
                    </View>
                  </View>
                  <Feather name="chevron-right" size={20} color={palette.faint} />
                </Row>
                <View
                  style={{
                    flexDirection: "row",
                    gap: space.sm,
                    marginTop: space.md,
                    paddingTop: space.md,
                    borderTopWidth: 1,
                    borderTopColor: palette.line,
                  }}
                >
                  {p.createdByRole === "healthcare_worker" ? (
                    <Pill label="You added" tone="info" icon="user-plus" />
                  ) : (
                    <Pill label="Linked" tone="success" icon="link" />
                  )}
                  {p.pairedAt ? (
                    <Pill label="App paired" tone="success" icon="check" />
                  ) : (
                    <Pill label="App not paired" tone="neutral" icon="clock" />
                  )}
                </View>
              </Card>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
