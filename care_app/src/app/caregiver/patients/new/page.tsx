"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { RequireAuth } from "@/components/layout/RequireAuth";
import { Button } from "@/components/ui/Button";
import { api } from "@/lib/api";

export default function NewPatientPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    displayName: "",
    age: 70,
    language: "Assamese",
    village: "",
    district: "",
    state: "Assam",
    consent: false,
  });

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.consent) {
      setError(
        "Care monitoring consent must be recorded before creating a patient.",
      );
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const patient = await api.createPatient({
        displayName: form.displayName,
        age: form.age,
        language: form.language,
        village: form.village || undefined,
        district: form.district || undefined,
        state: form.state,
      });
      router.push(`/caregiver/patients/${patient.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create patient");
    } finally {
      setSaving(false);
    }
  }

  return (
    <RequireAuth roles={["caregiver"]}>
      <AppShell title="Add patient">
        <form
          onSubmit={onSubmit}
          className="mx-auto max-w-2xl space-y-6"
        >
          <p className="max-w-xl text-sm text-[var(--color-ink-muted)]">
            Enter basic details to start care setup. Device pairing can be done
            later from the patient profile.
          </p>

          <section className="panel space-y-5 !p-5 sm:!p-6">
            <header className="border-b border-[var(--color-border)] pb-3">
              <h2 className="font-[family-name:var(--font-display)] text-lg text-[var(--color-ink)]">
                About the person
              </h2>
            </header>

            <div className="field mb-0">
              <label htmlFor="displayName">Display name</label>
              <input
                id="displayName"
                required
                placeholder="e.g. Aita"
                value={form.displayName}
                onChange={(e) =>
                  setForm((f) => ({ ...f, displayName: e.target.value }))
                }
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="field mb-0">
                <label htmlFor="age">Age</label>
                <input
                  id="age"
                  type="number"
                  min={1}
                  max={120}
                  required
                  value={form.age}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, age: Number(e.target.value) }))
                  }
                />
              </div>
              <div className="field mb-0">
                <label htmlFor="language">Preferred language</label>
                <select
                  id="language"
                  value={form.language}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, language: e.target.value }))
                  }
                >
                  <option>Assamese</option>
                  <option>English</option>
                  <option>Khasi</option>
                  <option>Manipuri</option>
                  <option>Nagamese</option>
                </select>
              </div>
            </div>
          </section>

          <section className="panel space-y-5 !p-5 sm:!p-6">
            <header className="border-b border-[var(--color-border)] pb-3">
              <h2 className="font-[family-name:var(--font-display)] text-lg text-[var(--color-ink)]">
                Location
              </h2>
              <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
                Optional — helps healthcare workers find the right household.
              </p>
            </header>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="field mb-0">
                <label htmlFor="village">Village</label>
                <input
                  id="village"
                  placeholder="Village"
                  value={form.village}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, village: e.target.value }))
                  }
                />
              </div>
              <div className="field mb-0">
                <label htmlFor="district">District</label>
                <input
                  id="district"
                  placeholder="District"
                  value={form.district}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, district: e.target.value }))
                  }
                />
              </div>
              <div className="field mb-0">
                <label htmlFor="state">State</label>
                <input
                  id="state"
                  value={form.state}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, state: e.target.value }))
                  }
                />
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-mist)]/50 p-5 sm:p-6">
            <h2 className="font-[family-name:var(--font-display)] text-lg text-[var(--color-ink)]">
              Consent
            </h2>
            <label className="mt-3 flex flex-row items-start gap-3 text-sm leading-relaxed text-[var(--color-ink)]">
              <input
                type="checkbox"
                className="mt-0.5 !h-4 !w-4 !min-w-4 shrink-0 !border !p-0 accent-[var(--color-teal)]"
                checked={form.consent}
                onChange={(e) =>
                  setForm((f) => ({ ...f, consent: e.target.checked }))
                }
              />
              <span className="min-w-0 flex-1">
                I confirm that care-monitoring consent has been granted by an
                authorized caregiver for this person.
              </span>
            </label>
          </section>

          {error && (
            <p
              className="rounded-lg border border-[var(--color-urgent)]/30 bg-red-50 px-3 py-2 text-sm text-[var(--color-urgent)]"
              role="alert"
            >
              {error}
            </p>
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
            <Link href="/caregiver" className="sm:mr-auto">
              <Button type="button" variant="ghost" className="w-full sm:w-auto">
                Cancel
              </Button>
            </Link>
            <Button
              type="submit"
              disabled={saving}
              className="w-full sm:w-auto sm:min-w-40"
            >
              {saving ? "Saving…" : "Create patient"}
            </Button>
          </div>
        </form>
      </AppShell>
    </RequireAuth>
  );
}
