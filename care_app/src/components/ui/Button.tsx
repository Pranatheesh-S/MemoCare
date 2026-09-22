import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "urgent";

const styles: Record<Variant, string> = {
  primary:
    "bg-[var(--color-teal)] text-white hover:bg-[var(--color-teal-dark)] focus-visible:ring-[var(--color-teal)]",
  secondary:
    "bg-white text-[var(--color-ink)] border border-[var(--color-border)] hover:bg-[var(--color-mist)]",
  ghost: "bg-transparent text-[var(--color-ink)] hover:bg-[var(--color-mist)]",
  danger:
    "bg-white text-[var(--color-urgent)] border border-[var(--color-urgent)] hover:bg-red-50",
  urgent:
    "bg-[var(--color-urgent)] text-white hover:bg-red-700 focus-visible:ring-[var(--color-urgent)]",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  children: ReactNode;
}

export function Button({
  variant = "primary",
  className = "",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${styles[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
