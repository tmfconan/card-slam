import { useState } from "react";
import { Card, Category, Status, STATUSES, STATUS_LABELS, PlanItem } from "../types";
import api from "../api/client";
import DailyView from "./DailyView";
import PlanReview from "./PlanReview";
import WeekScheduleGrid from "./WeekScheduleGrid";

interface Props {
  cards: Card[];
  categories: Category[];
  categoryMap: Record<string, Category>;
  onUpdate: () => void;
  onDayViewActive?: (date: string | null) => void;
}

const DEFAULT_EXCLUDED: Status[] = ["brainstorm", "done"];
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function todayStr() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString().split("T")[0];
}

function buildDays(startDate: string, count = 14) {
  const days = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(startDate + "T00:00:00");
    d.setDate(d.getDate() + i);
    days.push({
      key: d.toISOString().split("T")[0],
      label: DAY_NAMES[d.getDay()],
      sub: `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`,
    });
  }
  return days;
}

function shiftDate(date: string, days: number): string {
  const d = new Date(date + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

type ViewMode = "week" | "day";

export default function CalendarView({ cards, categories, categoryMap, onUpdate, onDayViewActive }: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [weekStart, setWeekStart] = useState(todayStr());
  const [selectedDay, setSelectedDay] = useState(todayStr());

  const enterDayView = (date: string) => {
    setSelectedDay(date);
    setViewMode("day");
    onDayViewActive?.(date);
  };

  const leaveDayView = () => {
    setViewMode("week");
    onDayViewActive?.(null);
  };

  const [filterCategory, setFilterCategory] = useState("");
  const [includedStatuses, setIncludedStatuses] = useState<Set<Status>>(
    new Set(STATUSES.filter((s) => !DEFAULT_EXCLUDED.includes(s)))
  );

  // Weekly Plan Assist: ask the LLM to suggest a schedule the user reviews.
  const [suggesting, setSuggesting] = useState(false);
  const [planItems, setPlanItems] = useState<PlanItem[] | null>(null);
  const [planNotice, setPlanNotice] = useState("");

  const suggestPlan = async () => {
    setSuggesting(true);
    setPlanNotice("");
    try {
      const res = await api.post("/ai/suggest-plan", {
        week_start: weekStart,
        days: 7,
      });
      const items: PlanItem[] = res.data.items ?? [];
      if (items.length === 0) {
        setPlanNotice("No “Intent to do” or “Ready to do” work to plan.");
      } else {
        setPlanItems(items);
      }
    } catch {
      setPlanNotice("Couldn't generate a plan. Please try again.");
    } finally {
      setSuggesting(false);
    }
  };

  const toggleStatus = (status: Status) => {
    setIncludedStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  };

  const days = buildDays(shiftDate(weekStart, -1), 15);
  const validKeys = new Set(days.map((d) => d.key));

  const visible = cards.filter(
    (c) =>
      includedStatuses.has(c.status) &&
      (!filterCategory || c.category_id === filterCategory)
  );

  const byDate: Record<string, Card[]> = { unscheduled: [] };
  days.forEach((d) => (byDate[d.key] = []));
  for (const card of visible) {
    if (!card.todo_date) {
      byDate.unscheduled.push(card);           // truly unscheduled
    } else if (validKeys.has(card.todo_date)) {
      byDate[card.todo_date].push(card);       // falls in visible window
    }
    // has a date outside the visible window → don't show it at all
  }
  Object.values(byDate).forEach((bucket) =>
    bucket.sort((a, b) => a.priority - b.priority)
  );

  // ── Daily view ─────────────────────────────────────────────────────────────
  if (viewMode === "day") {
    return (
      <div className="flex flex-col h-full">
        <div className="bg-white border-b px-5 py-2 flex items-center gap-3 flex-shrink-0">
          <button
            onClick={leaveDayView}
            className="text-sm text-blue-600 hover:underline"
          >
            ← Week view
          </button>
          <span className="text-gray-300">|</span>
          <span className="text-sm text-gray-500">Day view</span>
        </div>
        <div className="flex-1 overflow-hidden">
          <DailyView
            cards={cards}
            categories={categories}
            categoryMap={categoryMap}
            selectedDate={selectedDay}
            onDateChange={(date) => {
              setSelectedDay(date);
              onDayViewActive?.(date);
            }}
            onUpdate={onUpdate}
          />
        </div>
      </div>
    );
  }

  // ── Week view ──────────────────────────────────────────────────────────────
  return (
    <div className="p-4 h-full flex flex-col">
      {/* Controls */}
      <div className="mb-4 flex flex-wrap items-center gap-4">
        {/* View mode toggle */}
        <div className="flex rounded-lg border overflow-hidden text-sm">
          <button
            onClick={leaveDayView}
            className="px-3 py-1.5 transition-colors bg-gray-800 text-white"
          >
            2 Weeks
          </button>
          <button
            onClick={() => enterDayView(selectedDay)}
            className="px-3 py-1.5 transition-colors hover:bg-gray-50"
          >
            Day
          </button>
        </div>

        {/* Week navigation */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setWeekStart(shiftDate(weekStart, -14))}
            className="px-2 py-1 text-sm border rounded hover:bg-gray-50"
          >
            ← Prev
          </button>
          <button
            onClick={() => setWeekStart(todayStr())}
            className="px-2 py-1 text-sm border rounded hover:bg-gray-50"
          >
            Today
          </button>
          <button
            onClick={() => setWeekStart(shiftDate(weekStart, 14))}
            className="px-2 py-1 text-sm border rounded hover:bg-gray-50"
          >
            Next →
          </button>
        </div>

        {/* Category filter */}
        <div className="flex items-center gap-2">
          <label htmlFor="cal-category" className="text-xs font-medium text-gray-500">
            Category
          </label>
          <select
            id="cal-category"
            aria-label="Category"
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="text-sm border rounded-lg px-2 py-1 focus:outline-none"
          >
            <option value="">All</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* Status toggles */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-500">Show:</span>
          {DEFAULT_EXCLUDED.map((s) => (
            <label key={s} className="flex items-center gap-1 text-xs text-gray-600 cursor-pointer select-none">
              <input
                type="checkbox"
                aria-label={STATUS_LABELS[s]}
                checked={includedStatuses.has(s)}
                onChange={() => toggleStatus(s)}
                className="rounded"
              />
              {STATUS_LABELS[s]}
            </label>
          ))}
        </div>

        {/* Weekly Plan Assist */}
        <div className="flex items-center gap-2 ml-auto">
          {planNotice && (
            <span className="text-xs text-gray-500" role="status">
              {planNotice}
            </span>
          )}
          <button
            onClick={suggestPlan}
            disabled={suggesting}
            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {suggesting ? "Planning…" : "✨ Suggest plan"}
          </button>
        </div>
      </div>

      {planItems && (
        <PlanReview
          items={planItems}
          onApprove={() => {
            setPlanItems(null);
            onUpdate();
          }}
          onReject={() => setPlanItems(null)}
        />
      )}

      {/* Calendar grid — a multi-day time schedule with drag-to-schedule and
          drag-the-edge resizing, mirroring the daily view across the window. */}
      <WeekScheduleGrid
        days={days}
        byDate={byDate}
        noDate={byDate.unscheduled}
        categories={categories}
        categoryMap={categoryMap}
        todayKey={todayStr()}
        onUpdate={onUpdate}
        onEnterDay={enterDayView}
      />
    </div>
  );
}
