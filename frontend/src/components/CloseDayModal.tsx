import { useEffect, useState } from "react";
import api from "../api/client";
import { DayCloseSummary } from "../types";

interface Props {
  date: string;            // YYYY-MM-DD — the day being closed
  onClose: () => void;
  onSaved?: () => void;    // notify parent after a successful save
}

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function prettyDate(date: string): string {
  const d = new Date(date + "T00:00:00");
  return `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

export default function CloseDayModal({ date, onClose, onSaved }: Props) {
  const [learning, setLearning] = useState("");
  const [aiSummary, setAiSummary] = useState("");
  const [completed, setCompleted] = useState<string[]>([]);
  const [incomplete, setIncomplete] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [alreadyClosed, setAlreadyClosed] = useState(false);
  const [error, setError] = useState("");

  // Prefill from an existing closure if the day was already closed.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await api.get(`/dayclose/${date}`);
        if (!active) return;
        setLearning(res.data.learning ?? "");
        setAiSummary(res.data.ai_summary ?? "");
        setAlreadyClosed(true);
      } catch {
        // 404 just means the day hasn't been closed yet — nothing to prefill.
      }
    })();
    return () => {
      active = false;
    };
  }, [date]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const generateSummary = async () => {
    setGenerating(true);
    setError("");
    try {
      const res = await api.post<DayCloseSummary>("/dayclose/summary", { date });
      setAiSummary(res.data.summary ?? "");
      setCompleted(res.data.completed ?? []);
      setIncomplete(res.data.incomplete ?? []);
    } catch {
      setError("Couldn't generate a summary. Please try again.");
    } finally {
      setGenerating(false);
    }
  };

  const save = async () => {
    if (!learning.trim()) return;
    setSaving(true);
    setError("");
    try {
      await api.post("/dayclose", {
        date,
        learning: learning.trim(),
        ai_summary: aiSummary,
      });
      onSaved?.();
      onClose();
    } catch {
      setError("Couldn't close the day. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="close-day-title"
      data-testid="close-day-modal"
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-2xl max-h-[95vh] sm:max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b dark:border-gray-700 flex items-start justify-between gap-3">
          <div>
            <h2
              id="close-day-title"
              className="text-lg sm:text-xl font-semibold text-gray-800 dark:text-gray-100"
            >
              Close the Day
            </h2>
            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1">
              {prettyDate(date)}
              {alreadyClosed && " — already closed; saving will update it."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 text-xl leading-none p-1 -m-1 flex-shrink-0"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-4 sm:p-6 space-y-5">
          {/* AI summary */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-xs uppercase tracking-wide text-gray-400 dark:text-gray-400">
                Summary of the day
              </h3>
              <button
                type="button"
                onClick={generateSummary}
                disabled={generating}
                className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {generating ? "Generating…" : "✨ Generate summary"}
              </button>
            </div>
            {aiSummary ? (
              <p
                data-testid="close-day-summary"
                className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-line leading-relaxed"
              >
                {aiSummary}
              </p>
            ) : (
              <p className="text-sm text-gray-400 dark:text-gray-500">
                Generate an AI summary of what got done and what didn&apos;t.
              </p>
            )}

            {(completed.length > 0 || incomplete.length > 0) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <p className="text-xs font-medium text-green-700 dark:text-green-400 mb-1">
                    Completed ({completed.length})
                  </p>
                  <ul data-testid="close-day-completed" className="space-y-1">
                    {completed.map((t, i) => (
                      <li key={i} className="text-sm text-gray-600 dark:text-gray-300">• {t}</li>
                    ))}
                    {completed.length === 0 && (
                      <li className="text-sm text-gray-400 dark:text-gray-500">Nothing yet</li>
                    )}
                  </ul>
                </div>
                <div>
                  <p className="text-xs font-medium text-amber-700 dark:text-amber-400 mb-1">
                    Not completed ({incomplete.length})
                  </p>
                  <ul data-testid="close-day-incomplete" className="space-y-1">
                    {incomplete.map((t, i) => (
                      <li key={i} className="text-sm text-gray-600 dark:text-gray-300">• {t}</li>
                    ))}
                    {incomplete.length === 0 && (
                      <li className="text-sm text-gray-400 dark:text-gray-500">All done!</li>
                    )}
                  </ul>
                </div>
              </div>
            )}
          </div>

          {/* Learning (required) */}
          <div className="space-y-2">
            <label
              htmlFor="close-day-learning"
              className="block text-xs uppercase tracking-wide text-gray-400 dark:text-gray-400"
            >
              What did you learn today? <span className="text-red-500">*</span>
            </label>
            <textarea
              id="close-day-learning"
              value={learning}
              onChange={(e) => setLearning(e.target.value)}
              rows={4}
              placeholder="Capture a learning or improvement idea from today…"
              className="w-full text-sm border dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-5 border-t dark:border-gray-700 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving || !learning.trim()}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {saving ? "Closing…" : "Close the day"}
          </button>
        </div>
      </div>
    </div>
  );
}
