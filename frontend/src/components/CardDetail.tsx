import { useState, FormEvent } from "react";
import { createPortal } from "react-dom";
import { Card, Category, Status, STATUSES, STATUS_LABELS } from "../types";
import api from "../api/client";

interface Props {
  card: Card;
  categories: Category[];
  onSave: () => void;
  onClose: () => void;
}

export default function CardDetail({ card, categories, onSave, onClose }: Props) {
  const [title, setTitle] = useState(card.title);
  const [description, setDescription] = useState(card.description);
  const [categoryId, setCategoryId] = useState(card.category_id);
  const [status, setStatus] = useState<Status>(card.status);
  const [duration, setDuration] = useState(card.duration ?? 30);
  const [todoDate, setTodoDate] = useState(card.todo_date ?? "");
  const [todoTime, setTodoTime] = useState(card.todo_time ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api.put(`/cards/${card.id}`, {
        title,
        description,
        category_id: categoryId,
        status,
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
    if (!confirm(`Delete "${title}"?`)) return;
    await api.delete(`/cards/${card.id}`);
    onSave();
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="p-5 border-b flex items-center justify-between">
          <h2 className="text-base font-semibold">Edit card</h2>
          <p className="text-xs text-gray-400">
            Updated {new Date(card.updated_at).toLocaleDateString()}
          </p>
        </div>

        <form onSubmit={handleSave} className="flex-1 overflow-auto p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="cd-category"
                className="block text-xs font-medium text-gray-600 mb-1"
              >
                Category
              </label>
              <select
                id="cd-category"
                aria-label="Category"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none"
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
                className="block text-xs font-medium text-gray-600 mb-1"
              >
                Status
              </label>
              <select
                id="cd-status"
                aria-label="Status"
                value={status}
                onChange={(e) => setStatus(e.target.value as Status)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label
                htmlFor="cd-date"
                className="block text-xs font-medium text-gray-600 mb-1"
              >
                Date
              </label>
              <input
                id="cd-date"
                aria-label="Date"
                type="date"
                value={todoDate}
                onChange={(e) => setTodoDate(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="cd-time"
                className="block text-xs font-medium text-gray-600 mb-1"
              >
                Time
              </label>
              <input
                id="cd-time"
                aria-label="Time"
                type="time"
                value={todoTime}
                onChange={(e) => setTodoTime(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="cd-duration"
                className="block text-xs font-medium text-gray-600 mb-1"
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
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none"
              />
            </div>
          </div>

          {error && <p className="text-red-500 text-xs">{error}</p>}
        </form>

        <div className="p-5 border-t flex items-center justify-between">
          <button
            type="button"
            onClick={handleDelete}
            className="text-sm text-red-500 hover:text-red-700 transition-colors"
          >
            Delete
          </button>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!title.trim() || saving}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
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
