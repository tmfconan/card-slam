import { useState, FormEvent } from "react";
import { Category, Status, STATUSES, STATUS_LABELS } from "../types";
import api from "../api/client";

interface Props {
  categories: Category[];
  onCardCreated: () => void;
  onClose: () => void;
  defaultDate?: string;  // pre-fill when opened from a specific day context
  defaultTime?: string;  // pre-fill when opened from day view (e.g. "08:00")
}

export default function QuickAddCard({
  categories,
  onCardCreated,
  onClose,
  defaultDate = "",
  defaultTime = "",
}: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [status, setStatus] = useState<Status>("brainstorm");
  const [todoDate, setTodoDate] = useState(defaultDate);
  const [todoTime, setTodoTime] = useState(defaultTime);
  const [duration, setDuration] = useState(30);
  const [highPriority, setHighPriority] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const setToNow = () => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    setTodoDate(
      `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
    );
    setTodoTime(`${pad(now.getHours())}:${pad(now.getMinutes())}`);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    await api.post("/cards/", {
      title: title.trim(),
      description,
      category_id: categoryId,
      status,
      priority: 0,
      high_priority: highPriority,
      duration,
      todo_date: todoDate || null,
      todo_time: todoTime || null,
    });
    setSubmitting(false);
    onCardCreated();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="p-5 border-b dark:border-gray-700">
          <h2 className="text-lg font-semibold">Add card directly</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Create a card without AI parsing</p>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-auto p-5 space-y-4">
          {/* Title */}
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              autoFocus
              type="text"
              placeholder="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full border dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-900 dark:text-gray-100 dark:placeholder-gray-500"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Description</label>
            <textarea
              placeholder="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full border dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none dark:bg-gray-900 dark:text-gray-100 dark:placeholder-gray-500"
            />
          </div>

          {/* Category + Status */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="qac-category" className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                Category
              </label>
              <select
                id="qac-category"
                aria-label="Category"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full border dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none dark:bg-gray-900 dark:text-gray-100"
              >
                <option value="">None</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="qac-status" className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                Status
              </label>
              <select
                id="qac-status"
                aria-label="Status"
                value={status}
                onChange={(e) => setStatus(e.target.value as Status)}
                className="w-full border dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none dark:bg-gray-900 dark:text-gray-100"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Date + Time + Duration */}
          <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Schedule</span>
            <button
              type="button"
              onClick={setToNow}
              className="text-xs text-blue-600 hover:text-blue-800 transition-colors"
            >
              Set to now
            </button>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label htmlFor="qac-date" className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                Date
              </label>
              <input
                id="qac-date"
                aria-label="Date"
                type="date"
                value={todoDate}
                onChange={(e) => setTodoDate(e.target.value)}
                className="w-full border dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none dark:bg-gray-900 dark:text-gray-100"
              />
            </div>
            <div>
              <label htmlFor="qac-time" className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                Time
              </label>
              <input
                id="qac-time"
                aria-label="Time"
                type="time"
                value={todoTime}
                onChange={(e) => setTodoTime(e.target.value)}
                className="w-full border dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none dark:bg-gray-900 dark:text-gray-100"
              />
            </div>
            <div>
              <label htmlFor="qac-duration" className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                Duration (min)
              </label>
              <input
                id="qac-duration"
                aria-label="Duration"
                type="number"
                min="15"
                step="15"
                value={duration}
                onChange={(e) => setDuration(Math.max(15, parseInt(e.target.value) || 15))}
                className="w-full border dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none dark:bg-gray-900 dark:text-gray-100"
              />
            </div>
          </div>
          </div>

          <div>
            <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
              <input
                id="qac-high-priority"
                aria-label="High priority"
                type="checkbox"
                checked={highPriority}
                onChange={(e) => setHighPriority(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 dark:border-gray-700 text-red-600 focus:ring-red-500"
              />
              <span>High priority</span>
            </label>
          </div>
        </form>

        <div className="p-5 border-t dark:border-gray-700 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!title.trim() || submitting}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {submitting ? "Creating…" : "Create card"}
          </button>
        </div>
      </div>
    </div>
  );
}
