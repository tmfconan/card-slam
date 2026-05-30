import { useEffect, useState, useCallback } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
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
  weekly_cohort: WeeklyCohort[];
}

interface CategorySlice {
  category_id: string;
  name: string;
  color: string;
  value: number;
}

interface CategoryBreakdown {
  total: CategorySlice[];
  complete: CategorySlice[];
  incomplete: CategorySlice[];
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-5 flex flex-col gap-1">
      <span className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">{label}</span>
      <span className="text-3xl font-semibold text-gray-900 dark:text-gray-100">{value}</span>
    </div>
  );
}

function CategoryPie({ title, data }: { title: string; data: CategorySlice[] }) {
  const total = data.reduce((sum, s) => sum + s.value, 0);
  return (
    <div
      data-testid={`category-pie-${title.toLowerCase()}`}
      className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-3"
    >
      <div className="text-center">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">{title}</h3>
        <p className="text-xs text-gray-400">{total} card{total === 1 ? "" : "s"}</p>
      </div>
      {total === 0 ? (
        <div className="h-[180px] flex items-center justify-center text-xs text-gray-400">
          No cards
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={180}>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={70}
              isAnimationActive={false}
            >
              {data.map((slice) => (
                <Cell key={slice.category_id || "uncategorized"} fill={slice.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: "#e5e7eb" }}
              formatter={(v, name) => [v ?? 0, name]}
            />
          </PieChart>
        </ResponsiveContainer>
      )}
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
  const [categories, setCategories] = useState<CategoryBreakdown | null>(null);
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

  // Category breakdown is lifetime-wide and independent of the selected week.
  useEffect(() => {
    api
      .get("/reports/by-category")
      .then((r) => setCategories(r.data))
      .catch(() => setCategories(null));
  }, []);

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
      <div className="flex items-center justify-center h-full text-red-500 dark:text-red-400 text-sm">
        {error ?? "No data."}
      </div>
    );
  }

  const { lifetime, weekly_cohort } = data;
  const pct = Math.round(lifetime.completion_rate * 100);

  return (
    <div className="p-6 space-y-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Work Report</h2>
        <div className="flex items-center gap-2">
          <button
            data-testid="reports-prev-week"
            onClick={() => setRefDate((d) => shiftWeeks(d, -1))}
            className="px-2 py-1 text-sm text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-700 rounded hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            ← Prev
          </button>
          <span data-testid="reports-week-label" className="text-sm text-gray-600 dark:text-gray-300 min-w-[120px] text-center">
            {weekLabel(refDate)}
          </span>
          <button
            data-testid="reports-next-week"
            onClick={() => setRefDate((d) => shiftWeeks(d, 1))}
            disabled={isCurrentWeek}
            className="px-2 py-1 text-sm text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-700 rounded hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed"
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

      {/* Cohort chart */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Intended vs. Done by Creation Week</h3>
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
        <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
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

      {/* Category breakdown pies */}
      {categories && (
        <div className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Cards by Category</h3>
            <p className="text-xs text-gray-400">
              How your cards split across categories — all, still to do, and done.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <CategoryPie title="Total" data={categories.total} />
            <CategoryPie title="Incomplete" data={categories.incomplete} />
            <CategoryPie title="Complete" data={categories.complete} />
          </div>
        </div>
      )}
    </div>
  );
}
