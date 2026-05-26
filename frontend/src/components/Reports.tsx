import { useEffect, useState, useCallback } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import api from "../api/client";

interface LifetimeStats {
  total_intended: number;
  total_done: number;
  completion_rate: number;
}

interface WeeklyThroughput {
  week: string;
  week_label: string;
  done: number;
}

interface WeeklyCohort {
  week: string;
  week_label: string;
  intended: number;
  done: number;
  not_done: number;
  rate: number;
}

interface VelocityData {
  lifetime: LifetimeStats;
  weekly_throughput: WeeklyThroughput[];
  weekly_cohort: WeeklyCohort[];
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col gap-1">
      <span className="text-xs text-gray-500 uppercase tracking-wide">{label}</span>
      <span className="text-3xl font-semibold text-gray-900">{value}</span>
    </div>
  );
}

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

function shiftWeeks(date: string, weeks: number): string {
  const d = new Date(date + "T00:00:00");
  d.setDate(d.getDate() + weeks * 7);
  return d.toISOString().split("T")[0];
}

function weekLabel(date: string): string {
  const d = new Date(date + "T00:00:00");
  const cal = getISOWeek(d);
  return `Week ${cal.week}, ${cal.year}`;
}

function getISOWeek(d: Date): { year: number; week: number } {
  const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  tmp.setUTCDate(tmp.getUTCDate() + 4 - (tmp.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((tmp.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return { year: tmp.getUTCFullYear(), week };
}

export default function Reports() {
  const [data, setData] = useState<VelocityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refDate, setRefDate] = useState(todayStr);

  const fetchData = useCallback((date: string) => {
    setLoading(true);
    setError(null);
    api
      .get("/reports/velocity", { params: { ref_date: date } })
      .then((r) => setData(r.data))
      .catch(() => setError("Failed to load report data."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchData(refDate);
  }, [refDate, fetchData]);

  const isCurrentWeek = refDate === todayStr() || shiftWeeks(refDate, 1) > todayStr();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm">
        Loading…
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="flex items-center justify-center h-full text-red-500 text-sm">
        {error ?? "No data."}
      </div>
    );
  }

  const { lifetime, weekly_throughput, weekly_cohort } = data;
  const pct = Math.round(lifetime.completion_rate * 100);

  return (
    <div className="p-6 space-y-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-lg font-semibold text-gray-800">Velocity Report</h2>
        <div className="flex items-center gap-2">
          <button
            data-testid="reports-prev-week"
            onClick={() => setRefDate((d) => shiftWeeks(d, -1))}
            className="px-2 py-1 text-sm border rounded hover:bg-gray-50"
          >
            ← Prev
          </button>
          <span data-testid="reports-week-label" className="text-sm text-gray-600 min-w-[120px] text-center">
            {weekLabel(refDate)}
          </span>
          <button
            data-testid="reports-next-week"
            onClick={() => setRefDate((d) => shiftWeeks(d, 1))}
            disabled={isCurrentWeek}
            className="px-2 py-1 text-sm border rounded hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Next →
          </button>
        </div>
      </div>

      {/* Lifetime summary */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Total Intended" value={String(lifetime.total_intended)} />
        <StatCard label="Total Done" value={String(lifetime.total_done)} />
        <StatCard label="Completion Rate" value={`${pct}%`} />
      </div>

      {/* Throughput chart */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-700">Cards Completed Per Week</h3>
          <p className="text-xs text-gray-400">Based on when cards were last updated to Done</p>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={weekly_throughput} barSize={16}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
            <XAxis
              dataKey="week_label"
              tick={{ fontSize: 11, fill: "#9ca3af" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fontSize: 11, fill: "#9ca3af" }}
              axisLine={false}
              tickLine={false}
              width={24}
            />
            <Tooltip
              cursor={{ fill: "#f9fafb" }}
              contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: "#e5e7eb" }}
              formatter={(v) => [v ?? 0, "Done"]}
              labelFormatter={(l) => `Week of ${l}`}
            />
            <Bar dataKey="done" fill="#2563eb" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Cohort chart */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-700">Intended vs. Done by Creation Week</h3>
          <p className="text-xs text-gray-400">
            Of cards created each week that left Brainstorm, how many are Done?
          </p>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={weekly_cohort} barSize={16}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
            <XAxis
              dataKey="week_label"
              tick={{ fontSize: 11, fill: "#9ca3af" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fontSize: 11, fill: "#9ca3af" }}
              axisLine={false}
              tickLine={false}
              width={24}
            />
            <Tooltip
              cursor={{ fill: "#f9fafb" }}
              contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: "#e5e7eb" }}
              formatter={(v, name) => [
                v ?? 0,
                name === "done" ? "Done" : "Still in progress",
              ]}
              labelFormatter={(l) => `Week of ${l}`}
            />
            <Bar dataKey="done" stackId="a" fill="#16a34a" radius={[0, 0, 0, 0]} />
            <Bar dataKey="not_done" stackId="a" fill="#d1d5db" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-green-600 inline-block" />
            Done
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-gray-300 inline-block" />
            Still in progress
          </span>
        </div>
      </div>
    </div>
  );
}
