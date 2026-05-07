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
  const [submitting, setSubmitting] = useState(false);

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
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="p-5 border-b">
          <h2 className="text-lg font-semibold">Add card directly</h2>
          <p className="text-sm text-gray-500 mt-0.5">Create a card without AI parsing</p>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-auto p-5 space-y-4">
          {/* Title */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              autoFocus
              type="text"
              placeholder="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
            <textarea
              placeholder="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          {/* Category + Status */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="qac-category" className="block text-xs font-medium text-gray-600 mb-1">
                Category
              </label>
              <select
                id="qac-category"
                aria-label="Category"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none"
              >
                <option value="">None</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="qac-status" className="block text-xs font-medium text-gray-600 mb-1">
                Status
              </label>
              <select
                id="qac-status"
                aria-label="Status"
                value={status}
                onChange={(e) => setStatus(e.target.value as Status)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Date + Time + Duration */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label htmlFor="qac-date" className="block text-xs font-medium text-gray-600 mb-1">
                Date
              </label>
              <input
                id="qac-date"
                aria-label="Date"
                type="date"
                value={todoDate}
                onChange={(e) => setTodoDate(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="qac-time" className="block text-xs font-medium text-gray-600 mb-1">
                Time
              </label>
              <input
                id="qac-time"
                aria-label="Time"
                type="time"
                value={todoTime}
                onChange={(e) => setTodoTime(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="qac-duration" className="block text-xs font-medium text-gray-600 mb-1">
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
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none"
              />
            </div>
          </div>
        </form>

        <div className="p-5 border-t flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
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
