import type { AlertSeverity, AlertStatus, AuthorRole } from "@/lib/types";

export function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "teal" | "attention" | "urgent" | "ok";
}) {
  const map = {
    neutral: "bg-[var(--color-mist)] text-[var(--color-ink-muted)]",
    teal: "bg-[var(--color-teal-soft)] text-[var(--color-teal-dark)]",
    attention: "bg-amber-100 text-amber-900",
    urgent: "bg-red-100 text-[var(--color-urgent)]",
    ok: "bg-emerald-100 text-emerald-900",
  };
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${map[tone]}`}
    >
      {children}
    </span>
  );
}

export function SeverityBadge({ severity }: { severity: AlertSeverity }) {
  if (severity === "urgent") return <Badge tone="urgent">Urgent</Badge>;
  if (severity === "attention") return <Badge tone="attention">Needs review</Badge>;
  return <Badge tone="neutral">Info</Badge>;
}

export function StatusBadge({ status }: { status: AlertStatus }) {
  const labels: Record<AlertStatus, string> = {
    open: "Open",
    acknowledged: "Acknowledged",
    escalated: "Escalated",
    resolved: "Resolved",
  };
  const tone =
    status === "resolved"
      ? "ok"
      : status === "escalated"
        ? "urgent"
        : status === "acknowledged"
          ? "teal"
          : "attention";
  return <Badge tone={tone}>{labels[status]}</Badge>;
}

export function AuthorRoleLabel({ role }: { role: AuthorRole }) {
  const labels: Record<AuthorRole, string> = {
    system: "System observation",
    caregiver: "Caregiver",
    healthcare_worker: "Healthcare worker",
    clinician: "Clinician",
  };
  return <Badge tone="teal">{labels[role]}</Badge>;
}
