"use client";

import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { RequireAuth } from "@/components/layout/RequireAuth";
import { Badge } from "@/components/ui/Badge";
import { ResourceGate, useAsyncResource } from "@/components/ui/ResourceGate";
import { api } from "@/lib/api";
import { formatDate, formatRelative } from "@/lib/utils";
import type { PatientProfile } from "@/lib/types";

export default function WorkerPatientsPage() {
  const state = useAsyncResource(async () => {
    const patients = await api.listPatients();
    const rows = await Promise.all(
      patients.map(async (p) => {
        const [overview, alerts, visits] = await Promise.all([
          api.getOverview(p.id),
          api.listAlerts(),
          api.listVisits(p.id),
        ]);
        const patientAlerts = alerts.filter((a) => a.patientId === p.id);
        const openAlerts = patientAlerts.filter(
          (a) => a.status !== "resolved",
        ).length;
        const lastVisit = visits[0];
        return {
          patient: p,
          overview,
          openAlerts,
          lastVisitDate: lastVisit?.createdAt,
          nextFollowUp: lastVisit?.followUpAt,
        };
      }),
    );
    return rows;
  }, []);

  return (
    <RequireAuth roles={["healthcare_worker"]}>
      <AppShell title="Assigned patients">
        <ResourceGate
          state={state}
          emptyWhen={(r) => r.length === 0}
          emptyMessage="No patients are assigned to you."
        >
          {(rows) => (
            <div className="overflow-x-auto rounded-xl border border-[var(--color-border)] bg-white">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-[var(--color-mist)] text-[var(--color-ink-muted)]">
                  <tr>
                    <th className="px-3 py-2 font-medium">Name</th>
                    <th className="px-3 py-2 font-medium">Location</th>
                    <th className="px-3 py-2 font-medium">Last activity</th>
                    <th className="px-3 py-2 font-medium">Adherence</th>
                    <th className="px-3 py-2 font-medium">Open alerts</th>
                    <th className="px-3 py-2 font-medium">Last visit</th>
                    <th className="px-3 py-2 font-medium">Follow-up</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.patient.id}
                      className="border-t border-[var(--color-border)]"
                    >
                      <td className="px-3 py-3">
                        <Link
                          href={`/worker/patients/${row.patient.id}`}
                          className="font-medium text-[var(--color-teal-dark)] underline"
                        >
                          {row.patient.displayName}
                        </Link>
                      </td>
                      <td className="px-3 py-3">
                        {locationLabel(row.patient)}
                      </td>
                      <td className="px-3 py-3">
                        {formatRelative(row.overview.lastActivityAt)}
                      </td>
                      <td className="px-3 py-3">
                        {Math.round(row.overview.reminderAdherence7d * 100)}%
                        ack
                      </td>
                      <td className="px-3 py-3">
                        {row.openAlerts > 0 ? (
                          <Badge tone="urgent">{row.openAlerts}</Badge>
                        ) : (
                          <Badge tone="ok">0</Badge>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        {formatDate(row.lastVisitDate)}
                      </td>
                      <td className="px-3 py-3">
                        {formatDate(row.nextFollowUp)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </ResourceGate>
      </AppShell>
    </RequireAuth>
  );
}

function locationLabel(p: PatientProfile): string {
  return [p.location.village, p.location.district, p.location.state]
    .filter(Boolean)
    .join(", ");
}
