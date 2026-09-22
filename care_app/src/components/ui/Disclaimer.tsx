export function NonDiagnosticDisclaimer({
  className = "",
}: {
  className?: string;
}) {
  return (
    <p
      className={`rounded-lg border border-[var(--color-border)] bg-[var(--color-mist)] px-3 py-2 text-sm text-[var(--color-ink-muted)] ${className}`}
      role="note"
    >
      SmritiSetu shares engagement and routine observations to support care. It
      does not diagnose, treat, or assess dementia risk.
    </p>
  );
}
