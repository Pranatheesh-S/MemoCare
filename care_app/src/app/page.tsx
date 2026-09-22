"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthProvider";
import { PageState } from "@/components/ui/PageState";

export default function HomePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    router.replace(
      user.role === "healthcare_worker" ? "/worker" : "/caregiver",
    );
  }, [user, loading, router]);

  return <PageState kind="loading" title="Opening SmritiSetu" />;
}
