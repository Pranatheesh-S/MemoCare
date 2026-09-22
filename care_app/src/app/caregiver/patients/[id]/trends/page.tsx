"use client";

import { use, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { RequireAuth } from "@/components/layout/RequireAuth";
import { TrendsCharts } from "@/components/charts/TrendsCharts";
import { Button } from "@/components/ui/Button";
import { ResourceGate, useAsyncResource } from "@/components/ui/ResourceGate";
import { api } from "@/lib/api";

export default function TrendsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [period, setPeriod] = useState<7 | 30>(7);
  const state = useAsyncResource(
    () => api.getTrends(id, period),
    [id, period],
  );

  return (
    <RequireAuth roles={["caregiver"]}>
      <AppShell title="Trends">
        <div className="mb-4 flex gap-2">
          <Button
            variant={period === 7 ? "primary" : "secondary"}
            onClick={() => setPeriod(7)}
          >
            7 days
          </Button>
          <Button
            variant={period === 30 ? "primary" : "secondary"}
            onClick={() => setPeriod(30)}
          >
            30 days
          </Button>
        </div>
        <ResourceGate
          state={state}
          emptyWhen={(t) => t.points.length === 0}
          emptyMessage="No session data for this period yet."
        >
          {(trends) => (
            <div className="space-y-4">
              <ul className="panel space-y-2">
                {trends.plainLanguageObservations.map((obs) => (
                  <li key={obs} className="text-sm text-[var(--color-ink)]">
                    {obs}
                  </li>
                ))}
              </ul>
              <TrendsCharts points={trends.points} />
            </div>
          )}
        </ResourceGate>
      </AppShell>
    </RequireAuth>
  );
}
