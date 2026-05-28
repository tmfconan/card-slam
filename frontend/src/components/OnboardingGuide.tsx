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

export default function OnboardingGuide() {
  const [steps, setSteps] = useState<OnboardingStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    api
      .get("/onboarding/steps")
      .then((r) => setSteps(r.data.steps ?? []))
      .catch(() => setError("Failed to load the walkthrough."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm">
        Loading…
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-red-500 text-sm">
        {error}
      </div>
    );
  }
  if (steps.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm">
        No walkthrough steps available yet.
      </div>
    );
  }

  const step = steps[index];
  const isFirst = index === 0;
  const isLast = index === steps.length - 1;

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-800">Getting Started</h2>
        <p className="text-sm text-gray-500 mt-1">
          A step-by-step walkthrough from account creation through setting up
          your first board.
        </p>
      </div>

      {/* Progress */}
      <div
        className="flex items-center gap-2"
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
      <div className="bg-white rounded-xl shadow-sm border p-6 space-y-4">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-lg font-semibold text-gray-900">
            <span className="text-blue-600 mr-2">
              {index + 1}.
            </span>
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

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <button
          data-testid="onboarding-prev"
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          disabled={isFirst}
          className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          ← Previous
        </button>
        <button
          data-testid="onboarding-next"
          onClick={() => setIndex((i) => Math.min(steps.length - 1, i + 1))}
          disabled={isLast}
          className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isLast ? "All done" : "Next →"}
        </button>
      </div>
    </div>
  );
}
