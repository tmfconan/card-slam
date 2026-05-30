import { useEffect, useState } from "react";
import api from "../api/client";
import { CardRecommendation } from "../types";

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function WhatsGoinOn({ open, onClose }: Props) {
  const [summary, setSummary] = useState("");
  const [recommendations, setRecommendations] = useState<CardRecommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!open || loaded) return;
    setLoading(true);
    const today = new Date().toISOString().split("T")[0];
    api
      .post("/ai/whats-goin-on", { today })
      .then((r) => {
        setSummary(r.data.summary ?? "");
        setRecommendations(r.data.recommendations ?? []);
      })
      .catch(() => setError("Failed to generate your summary."))
      .finally(() => {
        setLoading(false);
        setLoaded(true);
      });
  }, [open, loaded]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="whats-goin-on-title"
      data-testid="whats-goin-on-modal"
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
              id="whats-goin-on-title"
              className="text-lg sm:text-xl font-semibold text-gray-800 dark:text-gray-100"
            >
              What&apos;s Goin&apos; On
            </h2>
            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1">
              A quick read on your day and the week ahead.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close summary"
            data-testid="whats-goin-on-close"
            className="text-gray-400 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 text-xl leading-none p-1 -m-1 flex-shrink-0"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-gray-400 dark:text-gray-400 text-sm">
              Loading…
            </div>
          ) : error ? (
            <div className="flex items-center justify-center py-12 text-red-500 text-sm">
              {error}
            </div>
          ) : (
            <>
              <div
                data-testid="whats-goin-on-summary"
                className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-line leading-relaxed"
              >
                {summary}
              </div>

              {recommendations.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-xs uppercase tracking-wide text-gray-400 dark:text-gray-400">
                    Suggested new cards
                  </h3>
                  <ul
                    className="space-y-2"
                    data-testid="whats-goin-on-recommendations"
                  >
                    {recommendations.map((rec, i) => (
                      <li
                        key={i}
                        className="bg-gray-50 dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-3"
                      >
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          {rec.title}
                        </p>
                        <p className="text-sm text-gray-600 dark:text-gray-300 mt-0.5">
                          {rec.description}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-5 border-t dark:border-gray-700 flex justify-end">
          <button
            type="button"
            data-testid="whats-goin-on-done"
            onClick={onClose}
            className="px-3 sm:px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
