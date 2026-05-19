import { useEffect, useState } from "react";
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

export default function Reports() {
  const [data, setData] = useState<VelocityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get("/reports/velocity")
      .then((r) => setData(r.data))
      .catch(() => setError("Failed to load report data."))
      .finally(() => setLoading(false));
  }, []);

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
      <h2 className="text-lg font-semibold text-gray-800">Velocity Report</h2>

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
