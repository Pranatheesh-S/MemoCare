export function createId(prefix = "id"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

export function formatRelative(iso?: string): string {
  if (!iso) return "Never";
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function formatDate(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function adherenceLabel(rate: number): string {
  const pct = Math.round(rate * 100);
  if (pct >= 80) return `Reminders acknowledged about ${pct}% of the time (last 7 days).`;
  if (pct >= 50) return `Reminders acknowledged about ${pct}% of the time — review suggested.`;
  return `Reminder acknowledgements were lower (~${pct}%) over seven days — caregiver review suggested.`;
}

export function isBrowserOffline(): boolean {
  if (typeof navigator === "undefined") return false;
  return !navigator.onLine;
}
