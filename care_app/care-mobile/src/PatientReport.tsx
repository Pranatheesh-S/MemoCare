import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { Card, Row } from "./ui";
import { palette, radius, space } from "./theme";
import { getPatient } from "./patients";
import { listSessions } from "./reportsApi";
import { listHealthChecks } from "./health";
import { summariseHealthCheck, type HealthCheckDoc, type VitalKey } from "./healthModel";
import {
  buildReport,
  MIN_SESSIONS_FOR_REAL_REPORT,
  mockSessions,
  reportTips,
  type CareTip,
  type Period,
  type ReportSession,
} from "./report";
import { BarChart, HBar, LineChart, RingProgress } from "./charts";

const HEALTH_METRICS: readonly { key: VitalKey; label: string; unit: string; color: string }[] = [
  { key: "systolic", label: "Blood pressure (systolic)", unit: "mmHg", color: palette.danger },
  { key: "diastolic", label: "Blood pressure (diastolic)", unit: "mmHg", color: palette.danger },
  { key: "pulse", label: "Pulse", unit: "bpm", color: palette.primary },
  { key: "spo2", label: "Oxygen (SpO₂)", unit: "%", color: palette.warn },
  { key: "temperatureC", label: "Temperature", unit: "°C", color: palette.sand },
  { key: "weightKg", label: "Weight", unit: "kg", color: palette.primaryDark },
];

function shortDay(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

/**
 * The weekly / monthly patient report. Shared by both portals.
 * `showHealth` adds the health-worker's vitals section (checks recorded in the
 * window, latest readings, and per-vital trend lines) above the engagement
 * report.
 */
export function PatientReport({ patientId, showHealth = false }: { patientId: string; showHealth?: boolean }) {
  const { width } = useWindowDimensions();
  const chartW = Math.min(width, 520) - space.lg * 2 - (space.lg + 2) * 2;

  const [period, setPeriod] = useState<Period>("week");
  const [sessions, setSessions] = useState<ReportSession[]>([]);
  const [checks, setChecks] = useState<HealthCheckDoc[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const since = new Date(Date.now() - 31 * 86_400_000).toISOString();
      const [p, s, c] = await Promise.all([
        getPatient(patientId),
        listSessions(patientId, since),
        showHealth ? listHealthChecks(patientId) : Promise.resolve<HealthCheckDoc[]>([]),
      ]);
      setName(p?.preferredName || p?.displayName || "Patient");
      setSessions(s);
      setChecks(c);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the report");
    } finally {
      setLoading(false);
    }
  }, [patientId, showHealth]);

  useEffect(() => {
    void load();
  }, [load]);

  const usingSample = !loading && !error && sessions.length < MIN_SESSIONS_FOR_REAL_REPORT;
  const report = useMemo(
    () => buildReport(usingSample ? mockSessions(period) : sessions, period),
    [sessions, period, usingSample],
  );

  const health = useMemo(() => {
    if (!showHealth) return null;
    const periodDays = period === "week" ? 7 : 30;
    const since = Date.now() - periodDays * 86_400_000;
    const inWindow = checks.filter((c) => Date.parse(c.recordedAt) >= since);
    const ordered = [...inWindow].reverse(); // oldest -> newest
    const trends = HEALTH_METRICS.map((m) => ({
      ...m,
      points: ordered
        .filter((c) => typeof c[m.key] === "number")
        .map((c) => ({ label: shortDay(c.recordedAt), value: c[m.key] as number })),
    })).filter((t) => t.points.length >= 2);
    return {
      count: inWindow.length,
      flagged: inWindow.filter((c) => c.concern).length,
      latest: inWindow[0] ?? checks[0] ?? null,
      trends,
    };
  }, [showHealth, checks, period]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.paper }} edges={["bottom"]}>
      <Stack.Screen options={{ title: "" }} />
      <ScrollView
        contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={palette.primary} />}
      >
        <Text style={{ color: palette.primary, fontSize: 11.5, fontWeight: "800", letterSpacing: 1.6 }}>
          {name.toUpperCase()} · REPORT
        </Text>
        <Text style={{ color: palette.ink, fontSize: 28, fontWeight: "800", letterSpacing: -0.5, marginTop: 6 }}>
          {period === "week" ? "This week" : "Last 30 days"}
        </Text>

        <View style={{ flexDirection: "row", backgroundColor: palette.paperDim, borderRadius: 12, padding: 4, marginTop: space.md }}>
          {(["week", "month"] as const).map((p) => (
            <Pressable
              key={p}
              onPress={() => setPeriod(p)}
              style={{ flex: 1, paddingVertical: 9, borderRadius: 9, alignItems: "center", backgroundColor: period === p ? palette.card : "transparent" }}
            >
              <Text style={{ fontWeight: "800", fontSize: 13.5, color: period === p ? palette.ink : palette.inkSoft }}>
                {p === "week" ? "Weekly" : "Monthly"}
              </Text>
            </Pressable>
          ))}
        </View>

        {loading ? (
          <ActivityIndicator color={palette.primary} style={{ marginTop: space.xxl }} />
        ) : error ? (
          <Card style={{ marginTop: space.lg }}>
            <Row>
              <Feather name="wifi-off" size={16} color={palette.danger} />
              <Text style={{ color: palette.danger, marginLeft: 8, flex: 1 }}>{error}</Text>
            </Row>
          </Card>
        ) : (
          <>
            {health ? (
              <>
                <Card style={{ marginTop: space.lg }}>
                  <Text style={{ color: palette.ink, fontSize: 15.5, fontWeight: "800" }}>Health checks</Text>
                  <Text style={{ color: palette.inkSoft, fontSize: 12.5, marginTop: 2, marginBottom: space.sm }}>
                    Recorded {period === "week" ? "this week" : "in the last 30 days"}
                  </Text>
                  <Row style={{ alignItems: "flex-start" }}>
                    <View style={{ flex: 1, gap: 12 }}>
                      <Metric icon="activity" label="Checks recorded" value={String(health.count)} />
                      <Metric icon="alert-triangle" label="Flagged for attention" value={String(health.flagged)} />
                      <Metric
                        icon="clock"
                        label="Most recent"
                        value={health.latest ? shortDay(health.latest.recordedAt) : "—"}
                      />
                    </View>
                  </Row>
                  {health.latest ? (
                    <View style={{ marginTop: space.md, paddingTop: space.md, borderTopWidth: 1, borderTopColor: palette.line }}>
                      <Text style={{ color: palette.inkSoft, fontSize: 12, fontWeight: "800", letterSpacing: 0.4 }}>
                        LATEST READING
                      </Text>
                      <Text style={{ color: palette.ink, fontSize: 14.5, fontWeight: "700", marginTop: 4, lineHeight: 21 }}>
                        {summariseHealthCheck(health.latest)}
                      </Text>
                      {health.latest.notes ? (
                        <Text style={{ color: palette.ink, fontSize: 13, marginTop: 4, lineHeight: 19 }}>
                          {health.latest.notes}
                        </Text>
                      ) : null}
                    </View>
                  ) : null}
                </Card>

                {health.count === 0 ? (
                  <ChartCard title="Vitals trend" subtitle="No health checks recorded in this window yet">
                    <Text style={{ color: palette.inkSoft, fontSize: 13 }}>
                      Record a health check from the patient's page to start a trend.
                    </Text>
                  </ChartCard>
                ) : health.trends.length === 0 ? (
                  <ChartCard title="Vitals trend" subtitle="Need at least two readings of a value to draw a line">
                    <Text style={{ color: palette.inkSoft, fontSize: 13 }}>
                      One check so far this window — the trend appears from the second reading on.
                    </Text>
                  </ChartCard>
                ) : (
                  health.trends.map((t) => (
                    <ChartCard key={t.key} title={t.label} subtitle="Each recorded reading in the window">
                      <LineChart data={t.points} width={chartW} unit={t.unit} color={t.color} />
                    </ChartCard>
                  ))
                )}
              </>
            ) : null}

            <Card style={{ marginTop: space.lg }}>
              {showHealth ? (
                <Text style={{ color: palette.primary, fontSize: 11, fontWeight: "800", letterSpacing: 1.2, marginBottom: 6 }}>
                  COGNITIVE ENGAGEMENT
                </Text>
              ) : null}
              <Text style={{ color: palette.ink, fontSize: 14.5, lineHeight: 22 }}>{report.summary}</Text>
              <View style={{ height: 1, backgroundColor: palette.line, marginVertical: space.md }} />
              <Row style={{ alignItems: "flex-start" }}>
                <RingProgress value={report.completionRate ?? 0} label="finished" />
                <View style={{ flex: 1, marginLeft: space.lg, gap: 12 }}>
                  <Metric icon="activity" label="Activities" value={String(report.sessionCount)} />
                  <Metric icon="calendar" label="Active days" value={`${report.activeDays} / ${report.totalDays}`} />
                  <Metric icon="clock" label="Time engaged" value={`${report.minutesPlayed} min`} />
                  <Metric
                    icon="target"
                    label="Accuracy"
                    value={report.accuracyMedian === null ? "—" : `${Math.round(report.accuracyMedian * 100)}%`}
                    hint={report.accuracyTrend === "unknown" ? undefined : report.accuracyTrend}
                  />
                </View>
              </Row>
            </Card>

            <ChartCard title="Activities each day" subtitle="How often they played">
              <BarChart data={report.volumeByDay} width={chartW} unit="sessions" />
            </ChartCard>

            <ChartCard title="Accuracy trend" subtitle="Median % correct on the days they played">
              <LineChart data={report.accuracyByDay} width={chartW} unit="%" fixedMax={100} color={palette.primary} />
            </ChartCard>

            <ChartCard title="Response time" subtitle="Median seconds to answer — lower is quicker">
              <LineChart data={report.responseByDay} width={chartW} unit="sec" color={palette.sand} />
            </ChartCard>

            <ChartCard title="Help used" subtitle="Average hints per activity">
              <BarChart data={report.hintsByDay.map((d) => ({ ...d, value: Math.max(0, d.value) }))} width={chartW} unit="hints" color={palette.sand} />
            </ChartCard>

            <ChartCard title="Time engaged" subtitle="Minutes played each day">
              <BarChart data={report.minutesByDay} width={chartW} unit="min" color={palette.primaryDark} />
            </ChartCard>

            <ChartCard title="By activity" subtitle="What they play and how it's going">
              {report.byGame.map((g) => (
                <HBar
                  key={g.gameType}
                  label={g.label}
                  value={g.sessions}
                  max={Math.max(...report.byGame.map((x) => x.sessions), 1)}
                  caption={`${g.sessions}×${g.accuracy !== null ? ` · ${Math.round(g.accuracy * 100)}%` : ""}${
                    g.maxDifficulty ? ` · level ${g.maxDifficulty}` : ""
                  }`}
                />
              ))}
            </ChartCard>

            <ChartCard title="Best time of day" subtitle="When they do their best work">
              {report.byTimeOfDay.map((b) => (
                <HBar
                  key={b.bucket}
                  label={b.bucket}
                  value={b.sessions}
                  max={Math.max(...report.byTimeOfDay.map((x) => x.sessions), 1)}
                  color={report.bestTimeOfDay === b.bucket ? palette.primary : palette.faint}
                  caption={`${b.sessions}×${b.accuracy !== null ? ` · ${Math.round(b.accuracy * 100)}%` : ""}`}
                />
              ))}
            </ChartCard>

            <TipsCard tips={reportTips(report)} />

            <Text style={{ color: palette.faint, fontSize: 11.5, textAlign: "center", marginTop: space.md }}>
              A support summary to help with day-to-day care. It is not a diagnosis and says nothing about medicines.
            </Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Metric({ icon, label, value, hint }: { icon: React.ComponentProps<typeof Feather>["name"]; label: string; value: string; hint?: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      <Feather name={icon} size={15} color={palette.inkSoft} />
      <Text style={{ color: palette.inkSoft, fontSize: 13, flex: 1 }}>{label}</Text>
      <Text style={{ color: palette.ink, fontSize: 14, fontWeight: "800" }}>{value}</Text>
      {hint ? <Text style={{ color: palette.faint, fontSize: 11 }}>{hint}</Text> : null}
    </View>
  );
}

const TIP_STYLE = {
  good: { bg: palette.successSoft, fg: palette.success, icon: "check-circle" as const },
  watch: { bg: palette.warnSoft, fg: palette.warn, icon: "alert-circle" as const },
  info: { bg: palette.primaryTint, fg: palette.primaryDark, icon: "info" as const },
};

function TipsCard({ tips }: { tips: CareTip[] }) {
  return (
    <View style={{ backgroundColor: palette.card, borderRadius: radius.lg, padding: space.lg + 2, marginTop: space.md }}>
      <Text style={{ color: palette.ink, fontSize: 15.5, fontWeight: "800" }}>Care suggestions</Text>
      <Text style={{ color: palette.inkSoft, fontSize: 12.5, marginTop: 2, marginBottom: space.sm }}>
        Small changes that can help the patient stay comfortable and engaged
      </Text>
      {tips.map((tip, i) => {
        const s = TIP_STYLE[tip.tone];
        return (
          <View
            key={i}
            style={{
              flexDirection: "row",
              gap: 10,
              backgroundColor: s.bg,
              borderRadius: radius.md,
              padding: space.md,
              marginTop: i === 0 ? 4 : space.sm,
            }}
          >
            <Feather name={s.icon} size={16} color={s.fg} style={{ marginTop: 1 }} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: s.fg, fontSize: 13.5, fontWeight: "800" }}>{tip.title}</Text>
              <Text style={{ color: palette.ink, fontSize: 13, lineHeight: 19, marginTop: 2 }}>{tip.body}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <View
      style={{
        backgroundColor: palette.card,
        borderRadius: radius.lg,
        padding: space.lg + 2,
        marginTop: space.md,
      }}
    >
      <Text style={{ color: palette.ink, fontSize: 15.5, fontWeight: "800" }}>{title}</Text>
      {subtitle ? <Text style={{ color: palette.inkSoft, fontSize: 12.5, marginTop: 2, marginBottom: 8 }}>{subtitle}</Text> : null}
      {children}
    </View>
  );
}
