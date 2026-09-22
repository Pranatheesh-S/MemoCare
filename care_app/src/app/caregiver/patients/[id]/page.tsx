"use client";

import { FormEvent, use, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { RequireAuth } from "@/components/layout/RequireAuth";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ResourceGate, useAsyncResource } from "@/components/ui/ResourceGate";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import type { EmergencyContact, PatientProfile } from "@/lib/types";

export default function PatientProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const state = useAsyncResource(async () => {
    const [patient, assignments, consents] = await Promise.all([
      api.getPatient(id),
      api.getAssignments(id),
      api.getConsents(id),
    ]);
    return { patient, assignments, consents };
  }, [id]);

  return (
    <RequireAuth roles={["caregiver"]}>
      <AppShell title="Patient profile">
        <ResourceGate state={state}>
          {(data) => (
            <ProfileEditor
              initial={data.patient}
              assignments={data.assignments}
              consents={data.consents}
              onSaved={state.reload}
            />
          )}
        </ResourceGate>
      </AppShell>
    </RequireAuth>
  );
}

function ProfileEditor({
  initial,
  assignments,
  consents,
  onSaved,
}: {
  initial: PatientProfile;
  assignments: Awaited<ReturnType<typeof api.getAssignments>>;
  consents: Awaited<ReturnType<typeof api.getConsents>>;
  onSaved: () => void;
}) {
  const [patient, setPatient] = useState(initial);
  const [contact, setContact] = useState<EmergencyContact>(
    initial.emergencyContacts[0] ?? {
      name: "",
      relationship: "",
      phone: "",
    },
  );
  const [pairing, setPairing] = useState<{
    code: string;
    expiresAt: string;
  } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const updated = await api.updatePatient(patient.id, {
        displayName: patient.displayName,
        language: patient.language,
        accessibility: patient.accessibility,
        location: patient.location,
        emergencyContacts: contact.name
          ? [contact]
          : patient.emergencyContacts,
      });
      setPatient(updated);
      setMessage("Profile saved.");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function requestPairing() {
    setError(null);
    try {
      const res = await api.pairDevice(patient.id);
      setPairing({ code: res.pairingCode, expiresAt: res.expiresAt });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Pairing failed");
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <form onSubmit={save} className="panel space-y-3 lg:col-span-2">
        <div className="field">
          <label htmlFor="name">Display name</label>
          <input
            id="name"
            value={patient.displayName}
            onChange={(e) =>
              setPatient((p) => ({ ...p, displayName: e.target.value }))
            }
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="field">
            <label htmlFor="language">Language</label>
            <select
              id="language"
              value={patient.language}
              onChange={(e) =>
                setPatient((p) => ({ ...p, language: e.target.value }))
              }
            >
              <option>Assamese</option>
              <option>English</option>
              <option>Khasi</option>
              <option>Manipuri</option>
              <option>Nagamese</option>
            </select>
          </div>
          <div className="field">
            <label>Age</label>
            <input value={patient.age} disabled readOnly />
          </div>
        </div>
        <fieldset className="rounded-lg border border-[var(--color-border)] p-3">
          <legend className="px-1 text-sm font-medium">Accessibility</legend>
          {(
            [
              ["largeText", "Large text"],
              ["highContrast", "High contrast"],
              ["reducedMotion", "Reduced motion"],
              ["voiceGuidance", "Voice guidance"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="mb-2 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="w-auto"
                checked={patient.accessibility[key]}
                onChange={(e) =>
                  setPatient((p) => ({
                    ...p,
                    accessibility: {
                      ...p.accessibility,
                      [key]: e.target.checked,
                    },
                  }))
                }
              />
              {label}
            </label>
          ))}
        </fieldset>
        <fieldset className="rounded-lg border border-[var(--color-border)] p-3">
          <legend className="px-1 text-sm font-medium">Emergency contact</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="field">
              <label htmlFor="cName">Name</label>
              <input
                id="cName"
                value={contact.name}
                onChange={(e) =>
                  setContact((c) => ({ ...c, name: e.target.value }))
                }
              />
            </div>
            <div className="field">
              <label htmlFor="cRel">Relationship</label>
              <input
                id="cRel"
                value={contact.relationship}
                onChange={(e) =>
                  setContact((c) => ({ ...c, relationship: e.target.value }))
                }
              />
            </div>
            <div className="field">
              <label htmlFor="cPhone">Phone</label>
              <input
                id="cPhone"
                value={contact.phone}
                onChange={(e) =>
                  setContact((c) => ({ ...c, phone: e.target.value }))
                }
              />
            </div>
          </div>
        </fieldset>
        {message && <p className="text-sm text-emerald-800">{message}</p>}
        {error && (
          <p className="text-sm text-[var(--color-urgent)]" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save profile"}
        </Button>
      </form>

      <aside className="space-y-4">
        <div className="panel space-y-2">
          <h2 className="font-[family-name:var(--font-display)] text-lg">
            Device pairing
          </h2>
          <p className="text-sm text-[var(--color-ink-muted)]">
            Status: <Badge tone="teal">{patient.deviceStatus}</Badge>
          </p>
          <p className="text-sm text-[var(--color-ink-muted)]">
            Generate a code for the patient&apos;s device so it can download
            their care package.
          </p>
          <Button variant="secondary" onClick={requestPairing}>
            Generate pairing code
          </Button>
          {pairing && (
            <div className="rounded-lg bg-[var(--color-teal-soft)] p-3 text-center">
              <p className="text-xs text-[var(--color-ink-muted)]">
                Enter on device before
              </p>
              <p className="font-[family-name:var(--font-display)] text-3xl tracking-widest">
                {pairing.code}
              </p>
              <p className="text-xs text-[var(--color-ink-muted)]">
                Expires {formatDate(pairing.expiresAt)}{" "}
                {new Date(pairing.expiresAt).toLocaleTimeString()}
              </p>
            </div>
          )}
        </div>
        <div className="panel space-y-2">
          <h2 className="font-[family-name:var(--font-display)] text-lg">
            Assignments
          </h2>
          <ul className="space-y-1 text-sm">
            {assignments.map((a) => (
              <li key={`${a.userId}-${a.role}`}>
                {a.role.replace("_", " ")} · since {formatDate(a.activeFrom)}
              </li>
            ))}
          </ul>
        </div>
        <div className="panel space-y-2">
          <h2 className="font-[family-name:var(--font-display)] text-lg">
            Consent
          </h2>
          <ul className="space-y-2 text-sm">
            {consents.map((c) => (
              <li key={c.id} className="rounded-lg bg-[var(--color-mist)] p-2">
                <div className="flex items-center justify-between gap-2">
                  <span>{c.purpose}</span>
                  <Badge tone={c.status === "granted" ? "ok" : "attention"}>
                    {c.status}
                  </Badge>
                </div>
                <p className="text-xs text-[var(--color-ink-muted)]">
                  {c.assetOrCategory} · {formatDate(c.grantedAt)}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}
