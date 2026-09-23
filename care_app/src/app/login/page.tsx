"use client";

import { FormEvent, useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthProvider";
import { Button } from "@/components/ui/Button";
import { PageState } from "@/components/ui/PageState";

function LoginForm() {
  const { login, user, loading } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (loading || !user) return;
    router.replace(
      params.get("next") ||
        (user.role === "healthcare_worker" ? "/worker" : "/caregiver"),
    );
  }, [loading, user, router, params]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const signedIn = await login(email, password);
      const next = params.get("next");
      router.replace(
        next ||
          (signedIn.role === "healthcare_worker" ? "/worker" : "/caregiver"),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="font-[family-name:var(--font-display)] text-4xl text-[var(--color-teal-dark)]">
            SmritiSetu
          </h1>
          <p className="mt-2 text-[var(--color-ink-muted)]">
            Caregiver & healthcare-worker sign in
          </p>
        </div>
        <form onSubmit={onSubmit} className="panel space-y-4">
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && (
            <p className="text-sm text-[var(--color-urgent)]" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Signing in…" : "Sign in"}
          </Button>
          <div className="rounded-lg bg-[var(--color-mist)] p-3 text-xs text-[var(--color-ink-muted)]">
            <p className="font-semibold mb-1">Demo Credentials:</p>
            <ul className="list-disc pl-4 space-y-1">
              <li><strong>Caregiver:</strong> daughter@smritisetu.demo / Caregiver#2026</li>
              <li><strong>Health Worker:</strong> asha@smritisetu.demo / AshaWorker#2026</li>
              <li><strong>Admin:</strong> admin@smritisetu.demo / AdminUser#2026</li>
            </ul>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<PageState kind="loading" />}>
      <LoginForm />
    </Suspense>
  );
}
