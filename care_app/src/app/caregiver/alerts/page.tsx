"use client";

import Link from "next/link";
import { useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { RequireAuth } from "@/components/layout/RequireAuth";
import { SeverityBadge, StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ResourceGate, useAsyncResource } from "@/components/ui/ResourceGate";
import { api } from "@/lib/api";
import { formatDate, formatRelative } from "@/lib/utils";
import type { Alert } from "@/lib/types";

export default function AlertsPage() {
  const state = useAsyncResource(async () => {
    const [alerts, patients] = await Promise.all([
      api.listAlerts(),
      api.listPatients(),
    ]);
    const patientNames = Object.fromEntries(
      patients.map((p) => [p.id, p.displayName]),
    );
    return { alerts, patientNames };
  // The alert inbox is the most time-sensitive screen in the dashboard, so
  // it polls fastest.
  }, [], 8_000);

  return (
    <RequireAuth roles={["caregiver"]}>
      <AppShell title="Alert centre">
        <ResourceGate
          state={state}
          emptyWhen={(data) => data.alerts.length === 0}
          emptyMessage="No alerts for your assigned patients."
        >
          {(data) => (
            <div className="space-y-3">
              {data.alerts.map((alert) => (
                <AlertCard
                  key={alert.id}
                  alert={alert}
                  patientName={
                    data.patientNames[alert.patientId] ?? "Unknown patient"
                  }
                  onChanged={state.reload}
                />
              ))}
            </div>
          )}
        </ResourceGate>
      </AppShell>
    </RequireAuth>
  );
}

function AlertCard({
  alert,
  patientName,
  onChanged,
}: {
  alert: Alert;
  patientName: string;
  onChanged: () => void;
}) {
  const [note, setNote] = useState(alert.note ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const urgent = alert.severity === "urgent";

  async function run(action: "acknowledge" | "escalate" | "resolve") {
    setBusy(true);
    setError(null);
    try {
      if (action === "acknowledge") await api.acknowledgeAlert(alert.id, note);
      if (action === "escalate") await api.escalateAlert(alert.id, note);
      if (action === "resolve") await api.resolveAlert(alert.id, note);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article
      className={`panel space-y-3 ${
        urgent ? "border-[var(--color-urgent)]" : ""
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-ink-muted)]">
            Patient
          </p>
          <Link
            href={`/caregiver/patients/${alert.patientId}`}
            className="font-[family-name:var(--font-display)] text-xl text-[var(--color-teal-dark)] underline-offset-2 hover:underline"
          >
            {patientName}
          </Link>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SeverityBadge severity={alert.severity} />
          <StatusBadge status={alert.status} />
          <span className="text-xs text-[var(--color-ink-muted)]">
            {formatRelative(alert.createdAt)}
          </span>
        </div>
      </div>
      <h2 className="text-base font-semibold text-[var(--color-ink)]">
        {alert.type.replaceAll("_", " ")}
      </h2>
      <div className="rounded-lg bg-[var(--color-mist)] p-3 text-sm">
        <p className="font-medium">Evidence</p>
        <p>{alert.evidence.summary}</p>
        <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
          Period: {alert.evidence.periodDays} days · Metrics:{" "}
          {alert.evidence.metricKeys.join(", ")}
        </p>
      </div>
      <div className="field">
        <label htmlFor={`note-${alert.id}`}>Action note</label>
        <textarea
          id={`note-${alert.id}`}
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Record what you observed or did…"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          disabled={busy || alert.status === "resolved"}
          onClick={() => run("acknowledge")}
        >
          Acknowledge
        </Button>
        {alert.evidence && (
          <a href={`tel:+919876543210`}>
            <Button type="button" variant="secondary">
              Contact patient
            </Button>
          </a>
        )}
        <Button
          variant={urgent ? "urgent" : "secondary"}
          disabled={busy || alert.status === "resolved"}
          onClick={() => run("escalate")}
        >
          Escalate to healthcare worker
        </Button>
        <Button
          variant="primary"
          disabled={busy || alert.status === "resolved"}
          onClick={() => run("resolve")}
        >
          Resolve
        </Button>
      </div>
      {(alert.acknowledgedAt || alert.escalatedAt || alert.resolvedAt) && (
        <p className="text-xs text-[var(--color-ink-muted)]">
          {alert.acknowledgedAt &&
            `Acknowledged ${formatDate(alert.acknowledgedAt)} by ${alert.acknowledgedBy}. `}
          {alert.escalatedAt &&
            `Escalated ${formatDate(alert.escalatedAt)} by ${alert.escalatedBy}. `}
          {alert.resolvedAt &&
            `Resolved ${formatDate(alert.resolvedAt)} by ${alert.resolvedBy}.`}
        </p>
      )}
      {error && (
        <p className="text-sm text-[var(--color-urgent)]" role="alert">
          {error}
        </p>
      )}
    </article>
  );
}
