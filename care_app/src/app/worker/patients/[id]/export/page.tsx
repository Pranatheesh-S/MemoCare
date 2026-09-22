"use client";

import { use } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { RequireAuth } from "@/components/layout/RequireAuth";
import { NonDiagnosticDisclaimer } from "@/components/ui/Disclaimer";
import { Button } from "@/components/ui/Button";
import { ResourceGate, useAsyncResource } from "@/components/ui/ResourceGate";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/utils";

/**
 * Period summary composed from trends, alerts, observations, and visits.
 */
export default function SummaryExportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const state = useAsyncResource(async () => {
    const [patient, trends, alerts, observations, visits] = await Promise.all([
      api.getPatient(id),
      api.getTrends(id, 30),
      api.listAlerts(),
      api.listObservations(id),
      api.listVisits(id),
    ]);
    return {
      patient,
      trends,
      alerts: alerts.filter((a) => a.patientId === id),
      observations,
      visits,
      generatedAt: new Date().toISOString(),
    };
  }, [id]);

  return (
    <RequireAuth roles={["healthcare_worker"]}>
      <AppShell title="Period summary export">
        <ResourceGate state={state}>
          {(data) => (
            <div className="space-y-4">
              <NonDiagnosticDisclaimer />
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  onClick={() => window.print()}
                >
                  Print / save as PDF
                </Button>
              </div>
              <article className="panel space-y-4 print:border-0 print:shadow-none">
                <header>
                  <h2 className="font-[family-name:var(--font-display)] text-2xl">
                    Care period summary — {data.patient.displayName}
                  </h2>
                  <p className="text-sm text-[var(--color-ink-muted)]">
                    Generated {formatDate(data.generatedAt)} · 30-day window
                  </p>
                </header>

                <section>
                  <h3 className="mb-2 font-semibold">Engagement observations</h3>
                  <ul className="space-y-1 text-sm">
                    {data.trends.plainLanguageObservations.map((line) => (
                      <li key={line}>
                        <span className="text-[var(--color-ink-muted)]">
                          [Source: system]
                        </span>{" "}
                        {line}
                      </li>
                    ))}
                  </ul>
                </section>

                <section>
                  <h3 className="mb-2 font-semibold">Alerts</h3>
                  {data.alerts.length === 0 ? (
                      <p className="text-sm text-[var(--color-ink-muted)]">
                        <span className="text-[var(--color-ink-muted)]">
                          [Source: alerts]
                        </span>{" "}
                        No alerts recorded for this period.
                      </p>
                  ) : (
                    <ul className="space-y-2 text-sm">
                      {data.alerts.map((a) => (
                        <li key={a.id}>
                          <span className="text-[var(--color-ink-muted)]">
                            [Source: alert {a.id} · {a.status}]
                          </span>{" "}
                          {a.evidence.summary}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section>
                  <h3 className="mb-2 font-semibold">Notes</h3>
                  <ul className="space-y-2 text-sm">
                    {data.observations.map((o) => (
                      <li key={o.id}>
                        <span className="text-[var(--color-ink-muted)]">
                          [Source: {o.authorRole} · {o.source}]
                        </span>{" "}
                        {o.text}
                      </li>
                    ))}
                  </ul>
                </section>

                <section>
                  <h3 className="mb-2 font-semibold">Visit records</h3>
                  <ul className="space-y-2 text-sm">
                    {data.visits.map((v) => (
                      <li key={v.id}>
                        <span className="text-[var(--color-ink-muted)]">
                          [Source: healthcare worker visit · {formatDate(v.createdAt)}]
                        </span>{" "}
                        Mood: {v.mood}. {v.communicationOrientation}{" "}
                        {v.routineDifficulty}
                        {v.concernFlag
                          ? " Concern flag was set for follow-up."
                          : ""}
                      </li>
                    ))}
                  </ul>
                </section>
              </article>
            </div>
          )}
        </ResourceGate>
      </AppShell>
    </RequireAuth>
  );
}
