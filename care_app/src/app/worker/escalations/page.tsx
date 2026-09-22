"use client";

import { useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { RequireAuth } from "@/components/layout/RequireAuth";
import { SeverityBadge, StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ResourceGate, useAsyncResource } from "@/components/ui/ResourceGate";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import type { Alert } from "@/lib/types";

export default function EscalationsPage() {
  const state = useAsyncResource(async () => {
    const alerts = await api.listAlerts();
    return alerts.filter(
      (a) => a.status === "escalated" || a.status === "open",
    );
  }, []);

  return (
    <RequireAuth roles={["healthcare_worker"]}>
      <AppShell title="Escalations">
        <ResourceGate
          state={state}
          emptyWhen={(a) => a.length === 0}
          emptyMessage="No open or escalated items for your assigned patients."
        >
          {(alerts) => (
            <div className="space-y-3">
              {alerts.map((alert) => (
                <EscalationCard
                  key={alert.id}
                  alert={alert}
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

function EscalationCard({
  alert,
  onChanged,
}: {
  alert: Alert;
  onChanged: () => void;
}) {
  const [note, setNote] = useState(alert.note ?? "");
  const [busy, setBusy] = useState(false);

  return (
    <article className="panel space-y-3">
      <div className="flex flex-wrap gap-2">
        <SeverityBadge severity={alert.severity} />
        <StatusBadge status={alert.status} />
      </div>
      <h2 className="font-[family-name:var(--font-display)] text-xl">
        {alert.type.replaceAll("_", " ")}
      </h2>
      <p className="text-sm">{alert.evidence.summary}</p>
      <p className="text-xs text-[var(--color-ink-muted)]">
        Created {formatDate(alert.createdAt)}
        {alert.escalatedAt
          ? ` · Escalated ${formatDate(alert.escalatedAt)}`
          : ""}
      </p>
      <div className="field">
        <label htmlFor={`esc-${alert.id}`}>Action / forward note</label>
        <textarea
          id={`esc-${alert.id}`}
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await api.acknowledgeAlert(alert.id, note);
              onChanged();
            } finally {
              setBusy(false);
            }
          }}
        >
          Acknowledge assignment
        </Button>
        <Button
          variant="primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await api.resolveAlert(alert.id, note || "Closed after review.");
              onChanged();
            } finally {
              setBusy(false);
            }
          }}
        >
          Close
        </Button>
        <Button
          variant="secondary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await api.escalateAlert(
                alert.id,
                note || "Forwarded for further human review.",
              );
              onChanged();
            } finally {
              setBusy(false);
            }
          }}
        >
          Forward
        </Button>
      </div>
    </article>
  );
}
