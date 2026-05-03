import { useState, FormEvent } from "react";
import { Category, Status, STATUSES, STATUS_LABELS } from "../types";
import api from "../api/client";

interface Props {
  categories: Category[];
  onCardCreated: () => void;
  onClose: () => void;
}

export default function QuickAddCard({ categories, onCardCreated, onClose }: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [status, setStatus] = useState<Status>("brainstorm");
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
    });
    setSubmitting(false);
    onCardCreated();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="p-6 border-b">
          <h2 className="text-lg font-semibold">Add card directly</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Create a card without AI parsing
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
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

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              placeholder="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="qac-category"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
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
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="qac-status"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
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
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim() || submitting}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {submitting ? "Creating…" : "Create card"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
