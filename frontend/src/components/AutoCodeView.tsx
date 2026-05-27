import { useState, useEffect, useCallback } from "react";
import { FeatureRun, Card, FeatureRequestStatus } from "../types";
import api from "../api/client";

const STATUS_BADGE: Record<
  FeatureRequestStatus | "in_progress" | "completed" | "failed",
  { label: string; classes: string }
> = {
  pending_validation: { label: "Validating",   classes: "bg-yellow-100 text-yellow-700" },
  validation_failed:  { label: "Invalid",       classes: "bg-red-100 text-red-600" },
  queued:             { label: "Queued",         classes: "bg-blue-100 text-blue-700" },
  in_progress:        { label: "Building",       classes: "bg-purple-100 text-purple-700 animate-pulse" },
  completed:          { label: "Deployed",       classes: "bg-green-100 text-green-700" },
  failed:             { label: "Failed",         classes: "bg-red-100 text-red-600" },
};

function Badge({ status }: { status: string }) {
  const cfg = STATUS_BADGE[status as FeatureRequestStatus] ?? {
    label: status,
    classes: "bg-gray-100 text-gray-600",
  };
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cfg.classes}`}>
      {cfg.label}
    </span>
  );
}

function buildLogUrl(_buildId: string, region = "us-east-2") {
  const encoded = encodeURIComponent("/aws/codebuild/card-slam-auto-code");
  return `https://${region}.console.aws.amazon.com/cloudwatch/home?region=${region}#logsV2:log-groups/log-group/${encoded}`;
}

export default function AutoCodeView() {
  const [queue, setQueue] = useState<Card[]>([]);
  const [history, setHistory] = useState<FeatureRun[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const [qRes, hRes] = await Promise.all([
      api.get("/autocode/queue"),
      api.get("/autocode/history"),
    ]);
    setQueue(qRes.data);
    setHistory(hRes.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 30_000);
    return () => clearInterval(interval);
  }, [refresh]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm">
        Loading…
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8">
      {/* Queue */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-gray-800">Queue</h2>
          <button
            onClick={refresh}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            Refresh
          </button>
        </div>
        {queue.length === 0 ? (
          <p className="text-sm text-gray-400">No cards queued. Flag a card as a Feature Request to add it.</p>
        ) : (
          <div className="space-y-2">
            {queue.map((card, i) => (
              <div
                key={card.id}
                className="flex items-center gap-3 bg-white border rounded-lg px-4 py-3 shadow-sm"
              >
                <span className="text-xs text-gray-400 font-mono w-4 text-right">{i + 1}</span>
                <p className="flex-1 text-sm font-medium text-gray-800">{card.title}</p>
                {card.feature_request_status && (
                  <Badge status={card.feature_request_status} />
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* History */}
      <section>
        <h2 className="text-base font-semibold text-gray-800 mb-3">History</h2>
        {history.length === 0 ? (
          <p className="text-sm text-gray-400">No runs yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left text-xs text-gray-400 uppercase tracking-wide border-b">
                  <th className="pb-2 pr-4 font-medium">Feature</th>
                  <th className="pb-2 pr-4 font-medium">Status</th>
                  <th className="pb-2 pr-4 font-medium">Started</th>
                  <th className="pb-2 pr-4 font-medium">Finished</th>
                  <th className="pb-2 font-medium">Logs</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {history.map((run) => (
                  <tr key={run.run_id} className="hover:bg-gray-50">
                    <td className="py-3 pr-4">
                      <p className="font-medium text-gray-800">{run.card_title}</p>
                      {run.card_description && (
                        <p className="text-xs text-gray-400 line-clamp-1 mt-0.5">
                          {run.card_description}
                        </p>
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      <Badge status={run.status} />
                    </td>
                    <td className="py-3 pr-4 text-gray-500 text-xs whitespace-nowrap">
                      {new Date(run.started_at).toLocaleString()}
                    </td>
                    <td className="py-3 pr-4 text-gray-500 text-xs whitespace-nowrap">
                      {run.completed_at ? new Date(run.completed_at).toLocaleString() : "—"}
                    </td>
                    <td className="py-3 text-xs">
                      {run.codebuild_build_id ? (
                        <a
                          href={buildLogUrl(run.codebuild_build_id)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline"
                        >
                          CloudWatch ↗
                        </a>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
