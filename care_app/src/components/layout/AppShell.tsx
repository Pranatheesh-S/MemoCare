"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthProvider";
import { Button } from "@/components/ui/Button";

const caregiverLinks = [
  { href: "/caregiver", label: "Dashboard" },
  { href: "/caregiver/alerts", label: "Alerts" },
  { href: "/caregiver/patients/new", label: "Add patient" },
  { href: "/caregiver/settings", label: "Settings" },
];

const workerLinks = [
  { href: "/worker", label: "Assigned patients" },
  { href: "/worker/escalations", label: "Escalations" },
];

export function AppShell({
  children,
  title,
}: {
  children: React.ReactNode;
  title?: string;
}) {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const links =
    user?.role === "healthcare_worker" ? workerLinks : caregiverLinks;

  return (
    <div className="min-h-screen bg-[var(--color-canvas)]">
      <header className="border-b border-[var(--color-border)] bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div>
            <Link
              href={user?.role === "healthcare_worker" ? "/worker" : "/caregiver"}
              className="font-[family-name:var(--font-display)] text-2xl tracking-tight text-[var(--color-teal-dark)]"
            >
              SmritiSetu
            </Link>
            <p className="text-xs text-[var(--color-ink-muted)]">
              Care network dashboard
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-[var(--color-ink-muted)] sm:inline">
              {user?.name}
            </span>
            <Button
              variant="ghost"
              onClick={() => {
                logout();
                router.push("/login");
              }}
            >
              Sign out
            </Button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 pb-2">
          {links.map((link) => {
            const active =
              pathname === link.href ||
              (link.href !== "/caregiver" &&
                link.href !== "/worker" &&
                pathname.startsWith(link.href));
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition ${
                  active
                    ? "bg-[var(--color-teal-soft)] text-[var(--color-teal-dark)]"
                    : "text-[var(--color-ink-muted)] hover:bg-[var(--color-mist)]"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        {title && (
          <h1 className="mb-4 font-[family-name:var(--font-display)] text-3xl text-[var(--color-ink)]">
            {title}
          </h1>
        )}
        {children}
      </main>
    </div>
  );
}
