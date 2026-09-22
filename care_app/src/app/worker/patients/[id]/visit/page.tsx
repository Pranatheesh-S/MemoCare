"use client";

import { FormEvent, use, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { RequireAuth } from "@/components/layout/RequireAuth";
import { Button } from "@/components/ui/Button";
import { api } from "@/lib/api";

export default function VisitNotePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [form, setForm] = useState({
    mood: "",
    communicationOrientation: "",
    routineDifficulty: "",
    concernFlag: false,
    followUpAt: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.createVisit(id, {
        mood: form.mood,
        communicationOrientation: form.communicationOrientation,
        routineDifficulty: form.routineDifficulty,
        concernFlag: form.concernFlag,
        followUpAt: form.followUpAt
          ? new Date(form.followUpAt).toISOString()
          : undefined,
      });
      router.push(`/worker/patients/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save visit note");
    } finally {
      setSaving(false);
    }
  }

  return (
    <RequireAuth roles={["healthcare_worker"]}>
      <AppShell title="Visit note">
        <form onSubmit={onSubmit} className="panel max-w-xl space-y-3">
          <p className="text-sm text-[var(--color-ink-muted)]">
            Record human observations only. Do not enter diagnoses or treatment
            instructions in this form.
          </p>
          <div className="field">
            <label htmlFor="mood">Mood</label>
            <input
              id="mood"
              required
              value={form.mood}
              onChange={(e) => setForm((f) => ({ ...f, mood: e.target.value }))}
            />
          </div>
          <div className="field">
            <label htmlFor="comm">Communication / orientation observation</label>
            <textarea
              id="comm"
              required
              rows={3}
              value={form.communicationOrientation}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  communicationOrientation: e.target.value,
                }))
              }
            />
          </div>
          <div className="field">
            <label htmlFor="routine">Routine-difficulty note</label>
            <textarea
              id="routine"
              required
              rows={3}
              value={form.routineDifficulty}
              onChange={(e) =>
                setForm((f) => ({ ...f, routineDifficulty: e.target.value }))
              }
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="w-auto"
              checked={form.concernFlag}
              onChange={(e) =>
                setForm((f) => ({ ...f, concernFlag: e.target.checked }))
              }
            />
            Concern flag (for human follow-up — not a clinical diagnosis)
          </label>
          <div className="field">
            <label htmlFor="followUp">Follow-up date</label>
            <input
              id="followUp"
              type="date"
              value={form.followUpAt}
              onChange={(e) =>
                setForm((f) => ({ ...f, followUpAt: e.target.value }))
              }
            />
          </div>
          {error && (
            <p className="text-sm text-[var(--color-urgent)]" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save visit note"}
          </Button>
        </form>
      </AppShell>
    </RequireAuth>
  );
}
