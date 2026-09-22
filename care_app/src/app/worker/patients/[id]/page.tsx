"use client";

import Link from "next/link";
import { use } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { RequireAuth } from "@/components/layout/RequireAuth";
import { AuthorRoleLabel, SeverityBadge, StatusBadge } from "@/components/ui/Badge";
import { NonDiagnosticDisclaimer } from "@/components/ui/Disclaimer";
import { ResourceGate, useAsyncResource } from "@/components/ui/ResourceGate";
import { TrendsCharts } from "@/components/charts/TrendsCharts";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/utils";

export default function WorkerPatientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const state = useAsyncResource(async () => {
    const [patient, trends, alerts, observations, visits, consents] =
      await Promise.all([
        api.getPatient(id),
        api.getTrends(id, 30),
        api.listAlerts(),
        api.listObservations(id),
        api.listVisits(id),
        api.getConsents(id),
      ]);
    return {
      patient,
      trends,
      alerts: alerts.filter((a) => a.patientId === id),
      observations,
      visits,
      consents,
    };
  }, [id]);

  return (
    <RequireAuth roles={["healthcare_worker"]}>
      <AppShell title="Patient detail">
        <ResourceGate state={state}>
          {(data) => (
            <div className="space-y-6">
              <div className="panel flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-[family-name:var(--font-display)] text-2xl">
                    {data.patient.displayName}
                  </h2>
                  <p className="text-sm text-[var(--color-ink-muted)]">
                    {[
                      data.patient.location.village,
                      data.patient.location.district,
                      data.patient.language,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 text-sm">
                  <Link
                    className="text-[var(--color-teal-dark)] underline"
                    href={`/worker/patients/${id}/visit`}
                  >
                    Add visit note
                  </Link>
                  <Link
                    className="text-[var(--color-teal-dark)] underline"
                    href={`/worker/patients/${id}/export`}
                  >
                    Summary export
                  </Link>
                </div>
              </div>

              <section className="space-y-3">
                <h3 className="font-[family-name:var(--font-display)] text-xl">
                  Longitudinal trends
                </h3>
                <ul className="panel space-y-1 text-sm">
                  {data.trends.plainLanguageObservations.map((o) => (
                    <li key={o}>{o}</li>
                  ))}
                </ul>
                <TrendsCharts points={data.trends.points} />
              </section>

              <section className="space-y-3">
                <h3 className="font-[family-name:var(--font-display)] text-xl">
                  Alert history
                </h3>
                {data.alerts.length === 0 ? (
                  <p className="text-sm text-[var(--color-ink-muted)]">
                    No alerts for this patient.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {data.alerts.map((a) => (
                      <li key={a.id} className="panel text-sm">
                        <div className="mb-1 flex flex-wrap gap-2">
                          <SeverityBadge severity={a.severity} />
                          <StatusBadge status={a.status} />
                        </div>
                        <p>{a.evidence.summary}</p>
                        <p className="text-xs text-[var(--color-ink-muted)]">
                          {formatDate(a.createdAt)}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="space-y-3">
                <h3 className="font-[family-name:var(--font-display)] text-xl">
                  Caregiver & system notes
                </h3>
                <ul className="space-y-2">
                  {data.observations.map((o) => (
                    <li key={o.id} className="panel space-y-1 text-sm">
                      <AuthorRoleLabel role={o.authorRole} />
                      <p>{o.text}</p>
                      <p className="text-xs text-[var(--color-ink-muted)]">
                        {o.authorName} · {o.source} · {formatDate(o.createdAt)}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="space-y-3">
                <h3 className="font-[family-name:var(--font-display)] text-xl">
                  Visit history
                </h3>
                {data.visits.length === 0 ? (
                  <p className="text-sm text-[var(--color-ink-muted)]">
                    No visits recorded.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {data.visits.map((v) => (
                      <li key={v.id} className="panel space-y-1 text-sm">
                        <AuthorRoleLabel role="healthcare_worker" />
                        <p>
                          <strong>Mood:</strong> {v.mood}
                        </p>
                        <p>
                          <strong>Communication / orientation:</strong>{" "}
                          {v.communicationOrientation}
                        </p>
                        <p>
                          <strong>Routine difficulty:</strong>{" "}
                          {v.routineDifficulty}
                        </p>
                        {v.concernFlag && (
                          <p className="text-[var(--color-urgent)]">
                            Concern flag set for human follow-up.
                          </p>
                        )}
                        <p className="text-xs text-[var(--color-ink-muted)]">
                          {v.authorName} · {formatDate(v.createdAt)}
                          {v.followUpAt
                            ? ` · Follow-up ${formatDate(v.followUpAt)}`
                            : ""}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="space-y-3">
                <h3 className="font-[family-name:var(--font-display)] text-xl">
                  Consent scope
                </h3>
                <NonDiagnosticDisclaimer />
                <ul className="space-y-2">
                  {data.consents.map((c) => (
                    <li key={c.id} className="panel text-sm">
                      {c.purpose} · {c.assetOrCategory} · {c.status}
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          )}
        </ResourceGate>
      </AppShell>
    </RequireAuth>
  );
}
