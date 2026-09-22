"use client";

import { FormEvent, use, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { RequireAuth } from "@/components/layout/RequireAuth";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ResourceGate, useAsyncResource } from "@/components/ui/ResourceGate";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import type { Schedule, ScheduleType } from "@/lib/types";

export default function RoutinesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const state = useAsyncResource(() => api.listSchedules(id), [id]);

  return (
    <RequireAuth roles={["caregiver"]}>
      <AppShell title="Routine manager">
        <ResourceGate
          state={state}
          emptyWhen={(s) => s.length === 0}
          emptyMessage="No routines yet. Add a medicine or daily reminder below."
        >
          {(schedules) => (
            <RoutineManager
              patientId={id}
              schedules={schedules}
              onChange={state.reload}
            />
          )}
        </ResourceGate>
        {(state.kind === "ready" || state.kind === "empty") && (
          <div className="mt-4 flex justify-center">
            <RoutineForm patientId={id} onCreated={state.reload} />
          </div>
        )}
      </AppShell>
    </RequireAuth>
  );
}

function RoutineManager({
  patientId,
  schedules,
  onChange,
}: {
  patientId: string;
  schedules: Schedule[];
  onChange: () => void;
}) {
  return (
    <div className="space-y-3">
      {schedules.map((s) => (
        <ScheduleRow key={s.id} schedule={s} onChange={onChange} />
      ))}
      {/* patientId kept for future history filter */}
      <span className="sr-only">{patientId}</span>
    </div>
  );
}

function ScheduleRow({
  schedule,
  onChange,
}: {
  schedule: Schedule;
  onChange: () => void;
}) {
  const [busy, setBusy] = useState(false);

  async function togglePause() {
    setBusy(true);
    try {
      await api.updateSchedule(schedule.id, { paused: !schedule.paused });
      onChange();
    } finally {
      setBusy(false);
    }
  }

  async function toggleCritical() {
    setBusy(true);
    try {
      await api.updateSchedule(schedule.id, { critical: !schedule.critical });
      onChange();
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="panel flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-[family-name:var(--font-display)] text-xl">
            {schedule.label}
          </h2>
          {schedule.critical && <Badge tone="urgent">Critical</Badge>}
          {schedule.paused && <Badge tone="attention">Paused</Badge>}
          <Badge tone="neutral">{schedule.type}</Badge>
        </div>
        <p className="text-sm text-[var(--color-ink-muted)]">
          {schedule.dosageText ?? "No dosage text"} · {schedule.recurrence}
        </p>
        <p className="text-xs text-[var(--color-ink-muted)]">
          Last updated {formatDate(schedule.updatedAt)}
          {schedule.version > 1 ? ` · ${schedule.version} updates` : ""}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" disabled={busy} onClick={toggleCritical}>
          {schedule.critical ? "Mark non-critical" : "Mark critical"}
        </Button>
        <Button variant="secondary" disabled={busy} onClick={togglePause}>
          {schedule.paused ? "Resume" : "Pause"}
        </Button>
      </div>
    </article>
  );
}

function RoutineForm({
  patientId,
  onCreated,
}: {
  patientId: string;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({
    type: "medicine" as ScheduleType,
    label: "",
    dosageText: "",
    recurrence: "daily@09:00",
    critical: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.createSchedule(patientId, form);
      setForm({
        type: "medicine",
        label: "",
        dosageText: "",
        recurrence: "daily@09:00",
        critical: false,
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create schedule");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="panel w-full space-y-3">
      <h2 className="font-[family-name:var(--font-display)] text-lg">
        Add routine
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="field">
          <label htmlFor="type">Type</label>
          <select
            id="type"
            value={form.type}
            onChange={(e) =>
              setForm((f) => ({ ...f, type: e.target.value as ScheduleType }))
            }
          >
            <option value="medicine">Medicine</option>
            <option value="hydration">Hydration</option>
            <option value="meal">Meal</option>
            <option value="appointment">Appointment</option>
            <option value="activity">Activity</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="label">Label</label>
          <input
            id="label"
            required
            value={form.label}
            onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
          />
        </div>
        <div className="field">
          <label htmlFor="dosage">Dosage / detail</label>
          <input
            id="dosage"
            value={form.dosageText}
            onChange={(e) =>
              setForm((f) => ({ ...f, dosageText: e.target.value }))
            }
          />
        </div>
        <div className="field">
          <label htmlFor="recurrence">Recurrence</label>
          <input
            id="recurrence"
            required
            value={form.recurrence}
            onChange={(e) =>
              setForm((f) => ({ ...f, recurrence: e.target.value }))
            }
          />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="w-auto"
          checked={form.critical}
          onChange={(e) =>
            setForm((f) => ({ ...f, critical: e.target.checked }))
          }
        />
        Critical (missed reminders may need urgent caregiver review)
      </label>
      {error && (
        <p className="text-sm text-[var(--color-urgent)]" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" disabled={saving}>
        {saving ? "Adding…" : "Add routine"}
      </Button>
    </form>
  );
}
