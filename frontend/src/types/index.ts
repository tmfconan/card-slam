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

export interface Card {
  id: string;
  title: string;
  description: string;
  category_id: string;
  status: Status;
  priority: number;
  created_at: string;
  updated_at: string;
}

export interface WorkItem {
  title: string;
  description: string;
}
