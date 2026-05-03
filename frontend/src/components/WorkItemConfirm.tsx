import { useState } from "react";
import { WorkItem, Status, Category, STATUSES, STATUS_LABELS } from "../types";
import api from "../api/client";

interface Props {
  items: WorkItem[];
  categoryId: string;
  categories: Category[];
  onConfirm: () => void;
  onCancel: () => void;
}

export default function WorkItemConfirm({
  items,
  categoryId,
  categories,
  onConfirm,
  onCancel,
}: Props) {
  const [editableItems, setEditableItems] = useState<WorkItem[]>(items);
  const [status, setStatus] = useState<Status>("brainstorm");
  const [submitting, setSubmitting] = useState(false);

  const update = (i: number, field: keyof WorkItem, value: string) =>
    setEditableItems((prev) =>
      prev.map((item, idx) => (idx === i ? { ...item, [field]: value } : item))
    );

  const remove = (i: number) =>
    setEditableItems((prev) => prev.filter((_, idx) => idx !== i));

  const handleConfirm = async () => {
    setSubmitting(true);
    await api.post(
      "/cards/batch",
      editableItems.map((item, i) => ({
        ...item,
        category_id: categoryId,
        status,
        priority: i,
      }))
    );
    onConfirm();
  };

  const category = categories.find((c) => c.id === categoryId);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="p-6 border-b">
          <h2 className="text-lg font-semibold">Review Work Items</h2>
          <p className="text-sm text-gray-500 mt-1">
            {editableItems.length} items for{" "}
            <span className="font-medium" style={{ color: category?.color }}>
              {category?.name}
            </span>
            . Edit or remove before creating.
          </p>
        </div>

        <div className="flex-1 overflow-auto p-6 space-y-3">
          {editableItems.map((item, i) => (
            <div key={i} className="border rounded-lg p-4">
              <div className="flex items-start gap-2">
                <input
                  className="flex-1 font-medium text-sm focus:outline-none border-b border-transparent focus:border-blue-400"
                  value={item.title}
                  onChange={(e) => update(i, "title", e.target.value)}
                />
                <button
                  onClick={() => remove(i)}
                  className="text-gray-300 hover:text-red-500 text-lg leading-none flex-shrink-0"
                >
                  ×
                </button>
              </div>
              <textarea
                className="mt-2 w-full text-sm text-gray-600 focus:outline-none border-b border-transparent focus:border-blue-400 resize-none"
                value={item.description}
                onChange={(e) => update(i, "description", e.target.value)}
                rows={2}
              />
            </div>
          ))}
        </div>

        <div className="p-6 border-t flex items-center justify-between">
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">Initial status:</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as Status)}
              className="text-sm border rounded-lg px-2 py-1 focus:outline-none"
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={submitting || editableItems.length === 0}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {submitting
                ? "Creating…"
                : `Create ${editableItems.length} card${editableItems.length !== 1 ? "s" : ""}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
