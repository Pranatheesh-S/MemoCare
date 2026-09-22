"use client";

import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { RequireAuth } from "@/components/layout/RequireAuth";
import { Badge } from "@/components/ui/Badge";
import { ResourceGate, useAsyncResource } from "@/components/ui/ResourceGate";
import { api } from "@/lib/api";
import { adherenceLabel, formatRelative } from "@/lib/utils";
import type { DashboardOverview, PatientProfile } from "@/lib/types";

export default function CaregiverDashboardPage() {
  const patientsState = useAsyncResource(() => api.listPatients(), []);

  return (
    <RequireAuth roles={["caregiver"]}>
      <AppShell title="Care overview">
        <ResourceGate
          state={patientsState}
          emptyWhen={(p) => p.length === 0}
          emptyMessage="No patients assigned yet. Add a patient to begin configuration."
        >
          {(patients) => (
            <PatientOverviews patients={patients} />
          )}
        </ResourceGate>
      </AppShell>
    </RequireAuth>
  );
}

function PatientOverviews({ patients }: { patients: PatientProfile[] }) {
  const overviewsState = useAsyncResource(async () => {
    const rows: DashboardOverview[] = [];
    for (const p of patients) {
      rows.push(await api.getOverview(p.id));
    }
    return rows;
  // Near-live: picks up a patient's sync or a freshly-raised alert without
  // a manual reload — see useAsyncResource's own comment for why polling
  // rather than a socket.
  }, [patients.map((p) => p.id).join(",")], 15_000);

  return (
    <ResourceGate state={overviewsState}>
      {(overviews) => (
        <div className="grid gap-4 md:grid-cols-2">
          {overviews.map((o) => (
            <article key={o.patientId} className="panel space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="font-[family-name:var(--font-display)] text-2xl">
                    {o.displayName}
                  </h2>
                  <p className="text-sm text-[var(--color-ink-muted)]">
                    Last activity {formatRelative(o.lastActivityAt)} · Last sync{" "}
                    {formatRelative(o.lastSyncAt)}
                  </p>
                </div>
                <Badge
                  tone={
                    o.deviceStatus === "paired" || o.deviceStatus === "offline"
                      ? "teal"
                      : "attention"
                  }
                >
                  Device: {o.deviceStatus}
                </Badge>
              </div>
              <ul className="grid grid-cols-2 gap-2 text-sm">
                <li className="rounded-lg bg-[var(--color-mist)] px-3 py-2">
                  <span className="block text-[var(--color-ink-muted)]">
                    Games completed today
                  </span>
                  <strong>{o.gamesCompletedToday}</strong>
                </li>
                <li className="rounded-lg bg-[var(--color-mist)] px-3 py-2">
                  <span className="block text-[var(--color-ink-muted)]">
                    Open alerts
                  </span>
                  <strong
                    className={
                      o.openAlertCount > 0 ? "text-[var(--color-urgent)]" : ""
                    }
                  >
                    {o.openAlertCount}
                  </strong>
                </li>
              </ul>
              <p className="text-sm text-[var(--color-ink-muted)]">
                {adherenceLabel(o.reminderAdherence7d)}
              </p>
              <nav
                aria-label={`${o.displayName} care actions`}
                className="grid grid-cols-2 gap-2 border-t border-[var(--color-border)] pt-3 sm:grid-cols-4"
              >
                {(
                  [
                    {
                      href: `/caregiver/patients/${o.patientId}`,
                      label: "Profile",
                      hint: "Settings & device",
                    },
                    {
                      href: `/caregiver/patients/${o.patientId}/routines`,
                      label: "Routines",
                      hint: "Medicines & day",
                    },
                    {
                      href: `/caregiver/patients/${o.patientId}/trends`,
                      label: "Trends",
                      hint: "7 & 30 day views",
                    },
                    {
                      href: `/caregiver/patients/${o.patientId}/memories`,
                      label: "Memories",
                      hint: "Photos & stories",
                    },
                  ] as const
                ).map((action) => (
                  <Link
                    key={action.href}
                    href={action.href}
                    className="flex min-h-16 flex-col items-start justify-center gap-0.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-mist)]/60 px-3 py-2.5 text-left transition hover:border-[var(--color-teal)] hover:bg-[var(--color-teal-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-teal)]"
                  >
                    <span className="text-sm font-semibold text-[var(--color-ink)]">
                      {action.label}
                    </span>
                    <span className="text-xs text-[var(--color-ink-muted)]">
                      {action.hint}
                    </span>
                  </Link>
                ))}
              </nav>
            </article>
          ))}
        </div>
      )}
    </ResourceGate>
  );
}
