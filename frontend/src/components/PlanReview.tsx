import { useState } from "react";
import { PlanItem } from "../types";
import api from "../api/client";

interface Props {
  items: PlanItem[];
  onApprove: () => void;
  onReject: () => void;
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function formatDate(date: string): string {
  if (!date) return "—";
  const d = new Date(date + "T00:00:00");
  if (isNaN(d.getTime())) return date;
  return `${DAY_NAMES[d.getDay()]}, ${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`;
}

export default function PlanReview({ items, onApprove, onReject }: Props) {
  // Cards the user keeps in the plan; toggling a checkbox excludes one.
  const [included, setIncluded] = useState<Set<string>>(
    () => new Set(items.map((i) => i.card_id))
  );
  const [submitting, setSubmitting] = useState(false);

  const toggle = (cardId: string) =>
    setIncluded((prev) => {
      const next = new Set(prev);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });

  const handleApprove = async () => {
    setSubmitting(true);
    const accepted = items.filter((i) => included.has(i.card_id));
    for (const item of accepted) {
      await api.put(`/cards/${item.card_id}`, {
        todo_date: item.todo_date,
        todo_time: item.todo_time,
      });
    }
    onApprove();
  };

  const acceptedCount = items.filter((i) => included.has(i.card_id)).length;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="p-6 border-b">
          <h2 className="text-lg font-semibold">Suggested Weekly Plan</h2>
          <p className="text-sm text-gray-500 mt-1">
            Card Slam suggests a day and time for {items.length} piece
            {items.length !== 1 ? "s" : ""} of work. Uncheck anything you don't
            want, then approve to apply.
          </p>
        </div>

        <div className="flex-1 overflow-auto p-6 space-y-3">
          {items.map((item) => (
            <label
              key={item.card_id}
              className="flex items-start gap-3 border rounded-lg p-4 cursor-pointer select-none"
            >
              <input
                type="checkbox"
                aria-label={`Include ${item.title}`}
                checked={included.has(item.card_id)}
                onChange={() => toggle(item.card_id)}
                className="mt-1 rounded"
              />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-sm">{item.title}</p>
                <p className="text-sm text-blue-600 mt-0.5">
                  {formatDate(item.todo_date)}
                  {item.todo_time ? ` at ${item.todo_time}` : ""}
                </p>
                {item.reason && (
                  <p className="text-xs text-gray-500 mt-1">{item.reason}</p>
                )}
              </div>
            </label>
          ))}
        </div>

        <div className="p-6 border-t flex items-center justify-end gap-3">
          <button
            onClick={onReject}
            disabled={submitting}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 disabled:opacity-50"
          >
            Reject
          </button>
          <button
            onClick={handleApprove}
            disabled={submitting || acceptedCount === 0}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {submitting
              ? "Applying…"
              : `Approve plan (${acceptedCount})`}
          </button>
        </div>
      </div>
    </div>
  );
}
