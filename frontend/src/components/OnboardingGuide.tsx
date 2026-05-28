import { useEffect, useState } from "react";
import api from "../api/client";

export interface OnboardingStep {
  id: number;
  title: string;
  summary: string;
  location: string;
  action: string;
  expect: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function OnboardingGuide({ open, onClose }: Props) {
  const [steps, setSteps] = useState<OnboardingStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!open || loaded) return;
    setLoading(true);
    api
      .get("/onboarding/steps")
      .then((r) => setSteps(r.data.steps ?? []))
      .catch(() => setError("Failed to load the walkthrough."))
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

  const step = steps[index];
  const isFirst = index === 0;
  const isLast = steps.length > 0 && index === steps.length - 1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
      data-testid="onboarding-modal"
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[95vh] sm:max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b flex items-start justify-between gap-3">
          <div>
            <h2
              id="onboarding-title"
              className="text-lg sm:text-xl font-semibold text-gray-800"
            >
              Getting Started
            </h2>
            <p className="text-xs sm:text-sm text-gray-500 mt-1">
              A step-by-step walkthrough for setting up your first board.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close tutorial"
            data-testid="onboarding-close"
            className="text-gray-400 hover:text-gray-700 text-xl leading-none p-1 -m-1 flex-shrink-0"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-gray-400 text-sm">
              Loading…
            </div>
          ) : error ? (
            <div className="flex items-center justify-center py-12 text-red-500 text-sm">
              {error}
            </div>
          ) : steps.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-gray-400 text-sm">
              No walkthrough steps available yet.
            </div>
          ) : (
            <>
              {/* Progress */}
              <div
                className="flex items-center gap-1 sm:gap-2"
                data-testid="onboarding-progress"
                aria-label={`Step ${index + 1} of ${steps.length}`}
              >
                {steps.map((s, i) => (
                  <button
                    key={s.id}
                    onClick={() => setIndex(i)}
                    aria-label={`Go to step ${i + 1}`}
                    aria-current={i === index ? "step" : undefined}
                    className={`h-2 flex-1 rounded-full transition-colors ${
                      i === index
                        ? "bg-blue-600"
                        : i < index
                        ? "bg-blue-300"
                        : "bg-gray-200 hover:bg-gray-300"
                    }`}
                  />
                ))}
              </div>

              {/* Step card */}
              <div className="bg-white rounded-xl border p-4 sm:p-6 space-y-3 sm:space-y-4">
                <div className="flex items-baseline justify-between gap-3 flex-wrap">
                  <h3 className="text-base sm:text-lg font-semibold text-gray-900">
                    <span className="text-blue-600 mr-2">{index + 1}.</span>
                    {step.title}
                  </h3>
                  <span className="text-xs text-gray-400 whitespace-nowrap">
                    Step {index + 1} of {steps.length}
                  </span>
                </div>
                <p className="text-sm text-gray-600">{step.summary}</p>

                <dl className="space-y-3 text-sm">
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-gray-400">
                      Where to look
                    </dt>
                    <dd className="text-gray-700 mt-0.5">{step.location}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-gray-400">
                      What to click
                    </dt>
                    <dd className="text-gray-700 mt-0.5">{step.action}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-gray-400">
                      What to expect
                    </dt>
                    <dd className="text-gray-700 mt-0.5">{step.expect}</dd>
                  </div>
                </dl>
              </div>
            </>
          )}
        </div>

        {/* Footer navigation */}
        {!loading && !error && steps.length > 0 && (
          <div className="p-4 sm:p-5 border-t flex items-center justify-between gap-3">
            <button
              data-testid="onboarding-prev"
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
              disabled={isFirst}
              className="px-3 sm:px-4 py-2 text-sm border rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ← Previous
            </button>
            <button
              data-testid="onboarding-next"
              onClick={() =>
                isLast ? onClose() : setIndex((i) => Math.min(steps.length - 1, i + 1))
              }
              className="px-3 sm:px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              {isLast ? "All done" : "Next →"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
