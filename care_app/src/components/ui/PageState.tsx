import { Button } from "./Button";

export type PageStateKind =
  | "loading"
  | "empty"
  | "offline"
  | "denied"
  | "error";

interface PageStateProps {
  kind: PageStateKind;
  title?: string;
  message?: string;
  onRetry?: () => void;
}

const defaults: Record<
  PageStateKind,
  { title: string; message: string }
> = {
  loading: {
    title: "Loading",
    message: "Fetching the latest care information…",
  },
  empty: {
    title: "Nothing here yet",
    message: "When records are available, they will appear in this view.",
  },
  offline: {
    title: "You appear to be offline",
    message:
      "Reconnect to load or save changes. Previously loaded information may still be visible.",
  },
  denied: {
    title: "Access not available",
    message:
      "You can only view patients assigned to you. Ask an administrator if this looks wrong.",
  },
  error: {
    title: "Something went wrong",
    message: "We could not complete this request. Try again in a moment.",
  },
};

export function PageState({ kind, title, message, onRetry }: PageStateProps) {
  const d = defaults[kind];
  return (
    <div
      className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-[var(--color-border)] bg-white/70 px-5 py-8"
      role="status"
      aria-live="polite"
    >
      {kind === "loading" && (
        <div
          className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-teal)] border-t-transparent"
          aria-hidden
        />
      )}
      <h2 className="font-[family-name:var(--font-display)] text-xl text-[var(--color-ink)]">
        {title ?? d.title}
      </h2>
      <p className="max-w-md text-sm text-[var(--color-ink-muted)]">
        {message ?? d.message}
      </p>
      {onRetry && kind !== "loading" && kind !== "denied" && (
        <Button variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
