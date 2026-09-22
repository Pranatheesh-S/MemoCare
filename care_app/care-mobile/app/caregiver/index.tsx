import { useCallback, useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { formatCode } from "@/codes";
import { listPatients } from "@/patients";
import { stateById, type PatientDoc } from "@/model";
import { Avatar, Button, Card, EmptyState, Pill, Row } from "@/ui";
import { useT } from "@/i18n";
import { palette, space, stateAccent } from "@/theme";

export default function Dashboard() {
  const t = useT();
  const [patients, setPatients] = useState<PatientDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setPatients(await listPatients());
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

  const pairedCount = patients.filter((p) => p.pairedAt).length;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.paper }} edges={["top", "left", "right"]}>
      <ScrollView
        contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={palette.primary} />}
      >
        <Text style={{ color: palette.primary, fontSize: 11.5, fontWeight: "800", letterSpacing: 1.6 }}>
          {t("dash.eyebrow")}
        </Text>
        <Text style={{ color: palette.ink, fontSize: 30, fontWeight: "800", letterSpacing: -0.6, marginTop: 6 }}>
          {t("dash.title")}
        </Text>
        <Text style={{ color: palette.inkSoft, fontSize: 14.5, marginTop: 6 }}>
          {patients.length === 0
            ? t("dash.none")
            : patients.length === 1
              ? t("dash.summaryOne", { paired: pairedCount })
              : t("dash.summary", { count: patients.length, paired: pairedCount })}
        </Text>

        <View style={{ marginTop: space.lg, marginBottom: space.sm }}>
          <Button label={t("dash.addPatient")} icon="plus" onPress={() => router.push("/caregiver/patients/new")} />
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
          <EmptyState icon="user-plus" title={t("dash.emptyTitle")} body={t("dash.emptyBody")} />
        ) : (
          patients.map((p) => {
            const st = stateById(p.stateId);
            const accent = stateAccent(p.stateId);
            return (
              <Card
                key={p.id}
                accent={accent}
                onPress={() => router.push({ pathname: "/caregiver/patients/[id]", params: { id: p.id } })}
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
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginTop: space.md,
                    paddingTop: space.md,
                    borderTopWidth: 1,
                    borderTopColor: palette.line,
                  }}
                >
                  <Text style={{ color: palette.primaryDark, fontSize: 18, fontWeight: "900", letterSpacing: 3 }}>
                    {formatCode(p.code)}
                  </Text>
                  {p.pairedAt ? (
                    <Pill label={t("dash.paired")} tone="success" icon="check" />
                  ) : (
                    <Pill label={t("dash.awaiting")} tone="info" icon="clock" />
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
