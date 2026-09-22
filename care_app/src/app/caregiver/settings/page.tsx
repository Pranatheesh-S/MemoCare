"use client";

import { FormEvent, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { RequireAuth } from "@/components/layout/RequireAuth";
import { Button } from "@/components/ui/Button";
import { ResourceGate, useAsyncResource } from "@/components/ui/ResourceGate";
import { api } from "@/lib/api";

export default function SettingsPage() {
  const prefsState = useAsyncResource(() => api.getNotificationPrefs(), []);
  const [reason, setReason] = useState("");
  const [deletionMsg, setDeletionMsg] = useState<string | null>(null);
  const [deletionErr, setDeletionErr] = useState<string | null>(null);

  return (
    <RequireAuth roles={["caregiver"]}>
      <AppShell title="Settings">
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="panel space-y-3">
            <h2 className="font-[family-name:var(--font-display)] text-lg">
              Notification preferences
            </h2>
            <p className="text-sm text-[var(--color-ink-muted)]">
              Choose how you want to hear about alerts and weekly summaries.
            </p>
            <ResourceGate state={prefsState}>
              {(prefs) => (
                <PrefsForm
                  initial={prefs}
                  onSaved={prefsState.reload}
                />
              )}
            </ResourceGate>
          </section>

          <section className="panel space-y-3">
            <h2 className="font-[family-name:var(--font-display)] text-lg">
              Access management
            </h2>
            <p className="text-sm text-[var(--color-ink-muted)]">
              You only see patients linked to your account. Contact your care
              network administrator if someone is missing or should be removed.
            </p>
          </section>

          <section className="panel space-y-3 lg:col-span-2">
            <h2 className="font-[family-name:var(--font-display)] text-lg">
              Data deletion request
            </h2>
            <p className="text-sm text-[var(--color-ink-muted)]">
              Request removal of care data. A team member will review and confirm
              when the request has been handled.
            </p>
            <form
              onSubmit={async (e: FormEvent) => {
                e.preventDefault();
                setDeletionErr(null);
                setDeletionMsg(null);
                try {
                  await api.requestDeletion(reason);
                  setDeletionMsg(
                    "Your deletion request was submitted. You will be notified when it has been reviewed.",
                  );
                  setReason("");
                } catch (err) {
                  setDeletionErr(
                    err instanceof Error ? err.message : "Request failed",
                  );
                }
              }}
              className="space-y-3"
            >
              <div className="field">
                <label htmlFor="reason">Reason</label>
                <textarea
                  id="reason"
                  required
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>
              {deletionMsg && (
                <p className="text-sm text-emerald-800">{deletionMsg}</p>
              )}
              {deletionErr && (
                <p className="text-sm text-[var(--color-urgent)]" role="alert">
                  {deletionErr}
                </p>
              )}
              <Button type="submit" variant="danger">
                Submit deletion request
              </Button>
            </form>
          </section>
        </div>
      </AppShell>
    </RequireAuth>
  );
}

function PrefsForm({
  initial,
  onSaved,
}: {
  initial: {
    emailAlerts: boolean;
    smsUrgent: boolean;
    weeklyDigest: boolean;
  };
  onSaved: () => void;
}) {
  const [prefs, setPrefs] = useState(initial);
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <form
      className="space-y-2"
      onSubmit={async (e) => {
        e.preventDefault();
        await api.saveNotificationPrefs(prefs);
        setMsg("Preferences saved.");
        onSaved();
      }}
    >
      {(
        [
          ["emailAlerts", "Email when new alerts open"],
          ["smsUrgent", "SMS for urgent alerts"],
          ["weeklyDigest", "Weekly plain-language digest"],
        ] as const
      ).map(([key, label]) => (
        <label key={key} className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="w-auto"
            checked={prefs[key]}
            onChange={(e) =>
              setPrefs((p) => ({ ...p, [key]: e.target.checked }))
            }
          />
          {label}
        </label>
      ))}
      {msg && <p className="text-sm text-emerald-800">{msg}</p>}
      <Button type="submit" variant="secondary">
        Save preferences
      </Button>
    </form>
  );
}
