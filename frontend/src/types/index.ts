export type Status =
  | "brainstorm"
  | "intent_to_do"
  | "ready_to_do"
  | "in_progress"
  | "needs_finishing"
  | "done";

export const STATUSES: Status[] = [
  "brainstorm",
  "intent_to_do",
  "ready_to_do",
  "in_progress",
  "needs_finishing",
  "done",
];

export const STATUS_LABELS: Record<Status, string> = {
  brainstorm: "Brainstorm",
  intent_to_do: "Intent to Do",
  ready_to_do: "Ready to Do",
  in_progress: "In Progress",
  needs_finishing: "Needs Finishing",
  done: "Done",
};

export interface Category {
  id: string;
  name: string;
  color: string;
  created_at: string;
}

export type FeatureRequestStatus =
  | "pending_validation"
  | "validation_failed"
  | "queued"
  | "waiting_for_merge"
  | "in_progress"
  | "completed"
  | "failed"
  | "merged";

// "Wait for merge": a queued feature request must not start building while an
// earlier request has been build-deployed but not yet merged, so the new work
// builds on the latest code.
export function hasUnmergedDeploy(
  cards: { feature_request_status?: FeatureRequestStatus }[]
): boolean {
  return cards.some((c) => c.feature_request_status === "completed");
}

// Returns the status to display for a queued card given whether a deployed-but-
// unmerged request exists. Non-queued statuses are returned unchanged.
export function deriveFeatureRequestStatus(
  status: FeatureRequestStatus | undefined,
  unmergedDeploy: boolean
): FeatureRequestStatus | undefined {
  if (unmergedDeploy && status === "queued") return "waiting_for_merge";
  return status;
}

export interface Card {
  id: string;
  title: string;
  description: string;
  category_id: string;
  status: Status;
  priority: number;
  high_priority?: boolean;
  archived?: boolean;   // archived cards are hidden from active views
  duration: number;     // minutes, minimum 30
  todo_date?: string;   // YYYY-MM-DD
  todo_time?: string;   // HH:MM
  created_at: string;
  updated_at: string;
  is_feature_request?: boolean;
  feature_request_status?: FeatureRequestStatus;
  auto_merge?: boolean;   // auto-merge the feature branch once the build succeeds
}

export interface FeatureRun {
  run_id: string;
  card_id: string;
  card_title: string;
  card_description: string;
  status: "in_progress" | "completed" | "failed" | "merged";
  codebuild_build_id?: string;
  started_at: string;
  completed_at?: string;
  error_message?: string;
}

export interface WorkItem {
  title: string;
  description: string;
}

export interface PlanItem {
  card_id: string;
  title: string;
  todo_date: string; // YYYY-MM-DD
  todo_time: string; // HH:MM
  reason: string;
}
