import { useState } from "react";
import { Card, Category, Status, STATUSES, STATUS_LABELS } from "../types";
import api from "../api/client";

interface Props {
  card: Card;
  category: Category | undefined;
  isDragging?: boolean;
  onUpdate: () => void;
  showStatus?: boolean;
}

export default function CardItem({
  card,
  category,
  isDragging,
  onUpdate,
  showStatus,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(card.title);
  const [description, setDescription] = useState(card.description);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await api.put(`/cards/${card.id}`, { title, description });
    setSaving(false);
    setEditing(false);
    onUpdate();
  };

  const handleDelete = async () => {
    if (!confirm(`Delete "${card.title}"?`)) return;
    await api.delete(`/cards/${card.id}`);
    onUpdate();
  };

  const handleStatusChange = async (status: Status) => {
    await api.put(`/cards/${card.id}`, { status });
    onUpdate();
  };

  const borderColor = category?.color ?? "#94a3b8";

  if (editing) {
    return (
      <div
        className="bg-white rounded-lg shadow-sm border-l-4 p-3 space-y-2"
        style={{ borderLeftColor: borderColor }}
      >
        <input
          autoFocus
          className="w-full text-sm font-medium border-b border-gray-300 focus:outline-none focus:border-blue-500 pb-0.5"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <textarea
          className="w-full text-xs text-gray-600 border border-gray-200 rounded p-1.5 focus:outline-none focus:border-blue-400 resize-none"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
        />
        <div className="flex justify-end gap-2">
          <button
            onClick={() => setEditing(false)}
            className="text-xs text-gray-500 hover:text-gray-700"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="text-xs bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`group bg-white rounded-lg shadow-sm border-l-4 p-3 ${isDragging ? "shadow-lg rotate-1 opacity-90" : ""}`}
      style={{ borderLeftColor: borderColor }}
    >
      <div className="flex items-start justify-between gap-1">
        <p className="text-sm font-medium text-gray-800 leading-snug flex-1">
          {card.title}
        </p>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          <button
            onClick={() => setEditing(true)}
            className="text-gray-400 hover:text-blue-500 text-xs px-1"
            title="Edit"
          >
            ✏
          </button>
          <button
            onClick={handleDelete}
            className="text-gray-400 hover:text-red-500 text-xs px-1"
            title="Delete"
          >
            ✕
          </button>
        </div>
      </div>

      {card.description && (
        <p className="text-xs text-gray-500 mt-1 leading-relaxed line-clamp-3">
          {card.description}
        </p>
      )}

      <div className="mt-2 flex items-center justify-between gap-2 flex-wrap">
        {category && (
          <span
            className="text-xs px-2 py-0.5 rounded-full font-medium"
            style={{
              backgroundColor: `${category.color}20`,
              color: category.color,
            }}
          >
            {category.name}
          </span>
        )}
        {showStatus && (
          <select
            value={card.status}
            onChange={(e) => handleStatusChange(e.target.value as Status)}
            onClick={(e) => e.stopPropagation()}
            className="text-xs border-0 text-gray-500 focus:outline-none bg-transparent ml-auto"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}
