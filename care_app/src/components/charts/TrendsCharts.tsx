"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TrendPoint } from "@/lib/types";
import { NonDiagnosticDisclaimer } from "@/components/ui/Disclaimer";

export function ChartShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-[var(--color-border)] bg-white p-4 shadow-sm">
      <h3 className="mb-3 font-[family-name:var(--font-display)] text-lg text-[var(--color-ink)]">
        {title}
      </h3>
      <div className="h-64 w-full">{children}</div>
    </section>
  );
}

export function TrendsCharts({ points }: { points: TrendPoint[] }) {
  const data = points.map((p) => ({
    ...p,
    dateLabel: p.date.slice(5),
    accuracyPct: Math.round(p.accuracy * 100),
    abandonmentPct: Math.round(p.abandonmentRate * 100),
    adherencePct: Math.round(p.reminderAdherence * 100),
  }));

  return (
    <div className="space-y-4">
      <NonDiagnosticDisclaimer />
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartShell title="Daily participation (sessions)">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#d5e0dc" />
              <XAxis dataKey="dateLabel" tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              <Line
                type="monotone"
                dataKey="participation"
                name="Sessions"
                stroke="#0f6b5c"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartShell>
        <ChartShell title="Accuracy & hints (completed sessions)">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#d5e0dc" />
              <XAxis dataKey="dateLabel" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              <Line
                type="monotone"
                dataKey="accuracyPct"
                name="Accuracy %"
                stroke="#1d4e89"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="hintsUsed"
                name="Hints used"
                stroke="#b45309"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartShell>
        <ChartShell title="Response time (seconds)">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#d5e0dc" />
              <XAxis dataKey="dateLabel" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="responseTimeSeconds"
                name="Response time"
                stroke="#0f6b5c"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartShell>
        <ChartShell title="Abandonment & reminder acknowledgement">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#d5e0dc" />
              <XAxis dataKey="dateLabel" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              <Line
                type="monotone"
                dataKey="abandonmentPct"
                name="Abandonment %"
                stroke="#b45309"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="adherencePct"
                name="Reminder ack %"
                stroke="#1d4e89"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartShell>
      </div>
    </div>
  );
}
