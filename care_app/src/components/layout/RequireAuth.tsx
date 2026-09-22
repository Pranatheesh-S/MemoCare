"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthProvider";
import { PageState } from "@/components/ui/PageState";
import type { UserRole } from "@/lib/types";

export function RequireAuth({
  children,
  roles,
}: {
  children: React.ReactNode;
  roles?: UserRole[];
}) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    if (roles && !roles.includes(user.role)) {
      router.replace(
        user.role === "healthcare_worker" ? "/worker" : "/caregiver",
      );
    }
  }, [user, loading, roles, router, pathname]);

  if (loading) return <PageState kind="loading" />;
  if (!user) return <PageState kind="loading" title="Redirecting to sign in" />;
  if (roles && !roles.includes(user.role)) {
    return <PageState kind="denied" />;
  }
  return <>{children}</>;
}
