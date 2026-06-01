import { useState, FormEvent } from "react";
import { createPortal } from "react-dom";
import { Card, Category, Status, STATUSES, STATUS_LABELS } from "../types";
import api from "../api/client";
import { useAuth } from "../contexts/AuthContext";

interface Props {
  card: Card;
  categories: Category[];
  onSave: () => void;
  onClose: () => void;
}

export default function CardDetail({ card, categories, onSave, onClose }: Props) {
  const { currentUser } = useAuth();
  const isAdmin = currentUser?.role === "admin";
  const [title, setTitle] = useState(card.title);
  const [description, setDescription] = useState(card.description);
  const [categoryId, setCategoryId] = useState(card.category_id);
  const [status, setStatus] = useState<Status>(card.status);
  const [highPriority, setHighPriority] = useState(card.high_priority ?? false);
  const [duration, setDuration] = useState(card.duration ?? 30);
  const [todoDate, setTodoDate] = useState(card.todo_date ?? "");
  const [todoTime, setTodoTime] = useState(card.todo_time ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [flagging, setFlagging] = useState(false);
  const [flagResult, setFlagResult] = useState<{ valid: boolean; reason: string } | null>(null);
  const [merging, setMerging] = useState(false);
  const [mergeResult, setMergeResult] = useState<{ merged?: boolean; conflict?: boolean; message?: string } | null>(null);
  const [autoMerge, setAutoMerge] = useState(card.auto_merge ?? false);
  const [savingAutoMerge, setSavingAutoMerge] = useState(false);

  const setToNow = () => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    setTodoDate(
      `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
    );
    setTodoTime(`${pad(now.getHours())}:${pad(now.getMinutes())}`);
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (isLocked) return;
    setSaving(true);
    setError("");
    try {
      await api.put(`/cards/${card.id}`, {
        title,
        description,
        category_id: categoryId,
        status,
        high_priority: highPriority,
        duration,
        todo_date: todoDate || null,
        todo_time: todoTime || null,
      });
      onSave();
      onClose();
    } catch {
      setError("Failed to save. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (isLocked) return;
    if (!confirm(`Delete "${title}"?`)) return;
    await api.delete(`/cards/${card.id}`);
    onSave();
    onClose();
  };

  const handleArchiveToggle = async () => {
    if (isLocked) return;
    await api.put(`/cards/${card.id}`, { archived: !card.archived });
    onSave();
    onClose();
  };

  const handleFlag = async () => {
    setFlagging(true);
    setFlagResult(null);
    try {
      const res = await api.post(`/autocode/flag/${card.id}`);
      setFlagResult({ valid: res.data.valid, reason: res.data.reason });
      onSave(); // refresh cards so badge updates
    } catch {
      setFlagResult({ valid: false, reason: "Failed to submit. Try again." });
    } finally {
      setFlagging(false);
    }
  };

  const handleUnflag = async () => {
    await api.delete(`/autocode/flag/${card.id}`);
    onSave();
    onClose();
  };

  const handleMerge = async () => {
    setMerging(true);
    setMergeResult(null);
    try {
      const res = await api.post(`/autocode/merge/${card.id}`);
      setMergeResult(res.data);
      if (res.data.merged) onSave();
    } catch (err: any) {
      setMergeResult({ merged: false, message: err.response?.data?.detail ?? "Merge failed." });
    } finally {
      setMerging(false);
    }
  };

  const handleAutoMergeToggle = async (checked: boolean) => {
    setAutoMerge(checked);
    setSavingAutoMerge(true);
    try {
      await api.put(`/cards/${card.id}`, { auto_merge: checked });
      onSave();
    } catch {
      setAutoMerge(!checked); // revert on failure
    } finally {
      setSavingAutoMerge(false);
    }
  };

  const isFlagged = card.is_feature_request;
  const canUnflag = isFlagged && card.feature_request_status !== "in_progress";
  const canMerge = card.feature_request_status === "completed";
  // Auto-merge is an opt-in for flagged requests that haven't merged yet.
  const canAutoMerge = isFlagged && card.feature_request_status !== "merged";
  // A queued or building feature request feeds its content to the auto-code
  // build, so the card is locked against edits until removed from the queue.
  const isLocked =
    isFlagged &&
    ["pending_validation", "queued", "waiting_for_merge", "in_progress"].includes(
      card.feature_request_status ?? ""
    );

  return createPortal(
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="p-5 border-b dark:border-gray-700 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100">Edit card</h2>
          <p className="text-xs text-gray-400 dark:text-gray-400">
            Updated {new Date(card.updated_at).toLocaleDateString()}
          </p>
        </div>

        <form onSubmit={handleSave} className="flex-1 overflow-auto p-5 space-y-4">
          {isLocked && (
            <p
              role="status"
              className="text-xs bg-amber-50 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2"
            >
              🔒 This card is queued or in progress for a feature request and
              can't be edited. Remove it from the queue to make changes.
            </p>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={isLocked}
              className="w-full border dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder-gray-500 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60 disabled:cursor-not-allowed"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              disabled={isLocked}
              className="w-full border dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder-gray-500 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none disabled:opacity-60 disabled:cursor-not-allowed"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="cd-category"
                className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1"
              >
                Category
              </label>
              <select
                id="cd-category"
                aria-label="Category"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                disabled={isLocked}
                className="w-full border dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder-gray-500 rounded-lg px-3 py-2 text-sm focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <option value="">None</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="cd-status"
                className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1"
              >
                Status
              </label>
              <select
                id="cd-status"
                aria-label="Status"
                value={status}
                onChange={(e) => setStatus(e.target.value as Status)}
                disabled={isLocked}
                className="w-full border dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder-gray-500 rounded-lg px-3 py-2 text-sm focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Schedule</span>
            <button
              type="button"
              onClick={setToNow}
              disabled={isLocked}
              className="text-xs text-blue-600 hover:text-blue-800 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              Set to now
            </button>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label
                htmlFor="cd-date"
                className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1"
              >
                Date
              </label>
              <input
                id="cd-date"
                aria-label="Date"
                type="date"
                value={todoDate}
                onChange={(e) => setTodoDate(e.target.value)}
                disabled={isLocked}
                className="w-full border dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder-gray-500 rounded-lg px-3 py-2 text-sm focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
              />
            </div>

            <div>
              <label
                htmlFor="cd-time"
                className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1"
              >
                Time
              </label>
              <input
                id="cd-time"
                aria-label="Time"
                type="time"
                value={todoTime}
                onChange={(e) => setTodoTime(e.target.value)}
                disabled={isLocked}
                className="w-full border dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder-gray-500 rounded-lg px-3 py-2 text-sm focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
              />
            </div>

            <div>
              <label
                htmlFor="cd-duration"
                className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1"
              >
                Duration (min)
              </label>
              <input
                id="cd-duration"
                aria-label="Duration"
                type="number"
                min="15"
                step="15"
                value={duration}
                onChange={(e) =>
                  setDuration(Math.max(15, parseInt(e.target.value) || 15))
                }
                disabled={isLocked}
                className="w-full border dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder-gray-500 rounded-lg px-3 py-2 text-sm focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
              />
            </div>
          </div>
          </div>

          <div>
            <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
              <input
                id="cd-high-priority"
                aria-label="High priority"
                type="checkbox"
                checked={highPriority}
                onChange={(e) => setHighPriority(e.target.checked)}
                disabled={isLocked}
                className="h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500 disabled:opacity-60 disabled:cursor-not-allowed"
              />
              <span>High priority</span>
            </label>
          </div>

          {error && <p className="text-red-500 text-xs">{error}</p>}
        </form>

        {/* Feature-request section (admin only) */}
        {isAdmin && (
          <div className="px-5 py-3 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-800 rounded-b-none space-y-2">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Auto-Code</p>
            {flagResult && (
              <p className={`text-xs ${flagResult.valid ? "text-green-700" : "text-red-600"}`}>
                {flagResult.valid ? "✓ Queued:" : "✗ Invalid:"} {flagResult.reason}
              </p>
            )}
            {mergeResult && (
              <p className={`text-xs ${mergeResult.merged ? "text-teal-700" : mergeResult.conflict ? "text-amber-600" : "text-red-600"}`}>
                {mergeResult.merged
                  ? "✓ Merged into main successfully."
                  : mergeResult.conflict
                  ? `⚠ ${mergeResult.message}`
                  : `✗ ${mergeResult.message}`}
              </p>
            )}
            {canAutoMerge && (
              <label className="inline-flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  aria-label="Auto-merge when build succeeds"
                  checked={autoMerge}
                  disabled={savingAutoMerge}
                  onChange={(e) => handleAutoMergeToggle(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                />
                <span>Auto-merge when build succeeds</span>
              </label>
            )}
            <div className="flex gap-2 flex-wrap">
              {!isFlagged && (
                <button
                  type="button"
                  onClick={handleFlag}
                  disabled={flagging}
                  className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                >
                  {flagging ? "Validating…" : "⚙ Flag as Feature Request"}
                </button>
              )}
              {canMerge && (
                <button
                  type="button"
                  onClick={handleMerge}
                  disabled={merging}
                  className="px-3 py-1.5 text-xs bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 transition-colors"
                >
                  {merging ? "Merging…" : "⤴ Merge to main"}
                </button>
              )}
              {canUnflag && card.feature_request_status !== "completed" && (
                <button
                  type="button"
                  onClick={handleUnflag}
                  className="px-3 py-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-red-600 transition-colors"
                >
                  Remove from queue
                </button>
              )}
              {isFlagged && !canUnflag && card.feature_request_status === "in_progress" && (
                <span className="text-xs text-purple-600 font-medium animate-pulse">
                  ⚙ Build in progress…
                </span>
              )}
            </div>
          </div>
        )}

        <div className="p-5 border-t dark:border-gray-700 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={handleDelete}
              disabled={isLocked}
              className="text-sm text-red-500 hover:text-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:text-red-500"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={handleArchiveToggle}
              disabled={isLocked}
              className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {card.archived ? "Unarchive" : "Archive"}
            </button>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-800 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!title.trim() || saving || isLocked}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
