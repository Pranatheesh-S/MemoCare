"use client";

import { FormEvent, use, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { RequireAuth } from "@/components/layout/RequireAuth";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ResourceGate, useAsyncResource } from "@/components/ui/ResourceGate";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import type { MemoryAssetType, MemoryLabels } from "@/lib/types";

export default function MemoriesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const state = useAsyncResource(() => api.listMemories(id), [id]);

  return (
    <RequireAuth roles={["caregiver"]}>
      <AppShell title="Memory Vault">
        <ResourceGate
          state={state}
          emptyWhen={(m) => m.length === 0}
          emptyMessage="No memory assets yet. Upload a consented photo or audio below."
        >
          {(memories) => (
            <ul className="mb-6 grid gap-3 sm:grid-cols-2">
              {memories.map((m) => (
                <li key={m.id} className="panel space-y-2">
                  <div className="flex items-center justify-between">
                    <Badge tone="teal">{m.type}</Badge>
                    <Button
                      variant="ghost"
                      onClick={async () => {
                        await api.deleteMemory(m.id);
                        state.reload();
                      }}
                    >
                      Remove
                    </Button>
                  </div>
                  <p className="font-medium">
                    {m.labels.person ?? "Unnamed"}{" "}
                    {m.labels.relationship
                      ? `(${m.labels.relationship})`
                      : ""}
                  </p>
                  <p className="text-sm text-[var(--color-ink-muted)]">
                    {[m.labels.place, m.labels.festival, m.labels.story]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  <p className="text-xs text-[var(--color-ink-muted)]">
                    Consent recorded · {formatDate(m.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </ResourceGate>
        {(state.kind === "ready" || state.kind === "empty") && (
          <UploadForm patientId={id} onUploaded={state.reload} />
        )}
      </AppShell>
    </RequireAuth>
  );
}

function UploadForm({
  patientId,
  onUploaded,
}: {
  patientId: string;
  onUploaded: () => void;
}) {
  const [type, setType] = useState<MemoryAssetType>("photo");
  const [labels, setLabels] = useState<MemoryLabels>({});
  const [consent, setConsent] = useState(false);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!consent) {
      setError("Explicit consent is required for each memory asset.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const upload = await api.getUploadUrl(patientId);
      // Upload URL is obtained first; binary PUT happens when live storage is connected.
      await api.createMemory(patientId, {
        type,
        objectKey: upload.objectKey,
        labels,
        consentGranted: true,
      });
      setLabels({});
      setConsent(false);
      setFileName("");
      onUploaded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="panel max-w-2xl space-y-3">
      <h2 className="font-[family-name:var(--font-display)] text-lg">
        Upload memory
      </h2>
      <p className="text-sm text-[var(--color-ink-muted)]">
        Add a photo or audio clip with labels so familiar people and places can
        appear in personal activities.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="field">
          <label htmlFor="type">Type</label>
          <select
            id="type"
            value={type}
            onChange={(e) => setType(e.target.value as MemoryAssetType)}
          >
            <option value="photo">Photo</option>
            <option value="audio">Audio</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="file">File</label>
          <input
            id="file"
            type="file"
            accept={type === "photo" ? "image/*" : "audio/*"}
            onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")}
            required
          />
          {fileName && (
            <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
              Selected: {fileName}
            </p>
          )}
        </div>
      </div>
      {(
        [
          ["person", "Person"],
          ["relationship", "Relationship"],
          ["story", "Story"],
          ["place", "Place"],
          ["festival", "Festival"],
        ] as const
      ).map(([key, label]) => (
        <div className="field" key={key}>
          <label htmlFor={key}>{label}</label>
          <input
            id={key}
            value={labels[key] ?? ""}
            onChange={(e) =>
              setLabels((l) => ({ ...l, [key]: e.target.value }))
            }
          />
        </div>
      ))}
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-1 w-auto"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
        />
        <span>
          I confirm explicit consent from the subject (or authorized caregiver)
          to use this asset in personal memory activities.
        </span>
      </label>
      {error && (
        <p className="text-sm text-[var(--color-urgent)]" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" disabled={saving}>
        {saving ? "Uploading…" : "Save memory asset"}
      </Button>
    </form>
  );
}
