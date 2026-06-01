import { useState } from "react";
import { Category } from "../types";
import api from "../api/client";

const PRESET_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e",
  "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899",
  "#6b7280", "#14b8a6",
];

interface Props {
  categories: Category[];
  onUpdate: () => void;
}

export default function CategoryManager({ categories, onUpdate }: Props) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(PRESET_COLORS[5]);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("");

  const handleCreate = async () => {
    if (!name.trim()) return;
    setSubmitting(true);
    await api.post("/categories/", { name: name.trim(), color });
    setName("");
    setSubmitting(false);
    onUpdate();
  };

  const startEdit = (cat: Category) => {
    setEditingId(cat.id);
    setEditName(cat.name);
    setEditColor(cat.color);
  };

  const saveEdit = async () => {
    if (!editingId) return;
    await api.put(`/categories/${editingId}`, { name: editName, color: editColor });
    setEditingId(null);
    onUpdate();
  };

  const handleDelete = async (id: string, catName: string) => {
    if (!confirm(`Delete category "${catName}"? Cards will keep their category reference.`)) return;
    await api.delete(`/categories/${id}`);
    onUpdate();
  };

  const ColorPicker = ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (c: string) => void;
  }) => (
    <div className="flex items-center gap-1.5">
      {PRESET_COLORS.map((c) => (
        <button
          key={c}
          onClick={() => onChange(c)}
          className="w-5 h-5 rounded-full border-2 hover:scale-110 transition-transform"
          style={{
            backgroundColor: c,
            borderColor: value === c ? "#1d4ed8" : "transparent",
          }}
        />
      ))}
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-7 h-7 rounded cursor-pointer border border-gray-300 dark:border-gray-700"
        title="Custom color"
      />
    </div>
  );

  return (
    <div className="p-6 max-w-2xl">
      <h2 className="text-xl font-semibold mb-6 text-gray-800 dark:text-gray-100">Categories</h2>

      {/* Create */}
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border dark:border-gray-700 p-5 mb-6">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">
          New Category
        </h3>
        <div className="space-y-3">
          <input
            type="text"
            placeholder="Category name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            className="w-full border dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder-gray-500 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <ColorPicker value={color} onChange={setColor} />
          <button
            onClick={handleCreate}
            disabled={!name.trim() || submitting}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            Add category
          </button>
        </div>
      </div>

      {/* List */}
      <div className="space-y-2">
        {categories.map((cat) => (
          <div
            key={cat.id}
            className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border dark:border-gray-700 p-4 flex items-center gap-4"
          >
            <div
              className="w-5 h-5 rounded-full flex-shrink-0"
              style={{ backgroundColor: cat.color }}
            />
            {editingId === cat.id ? (
              <>
                <input
                  autoFocus
                  className="flex-1 text-sm border-b border-gray-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder-gray-500 focus:outline-none focus:border-blue-500"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                />
                <ColorPicker value={editColor} onChange={setEditColor} />
                <button
                  onClick={saveEdit}
                  className="text-sm text-blue-600 hover:underline"
                >
                  Save
                </button>
                <button
                  onClick={() => setEditingId(null)}
                  className="text-sm text-gray-500 dark:text-gray-400 hover:underline"
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <span className="flex-1 text-sm font-medium">{cat.name}</span>
                <button
                  onClick={() => startEdit(cat)}
                  className="text-xs text-gray-400 dark:text-gray-400 hover:text-blue-500 transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(cat.id, cat.name)}
                  className="text-xs text-gray-400 dark:text-gray-400 hover:text-red-500 transition-colors"
                >
                  Delete
                </button>
              </>
            )}
          </div>
        ))}
        {categories.length === 0 && (
          <p className="text-sm text-gray-400 dark:text-gray-400 text-center py-10">
            No categories yet. Create one above.
          </p>
        )}
      </div>
    </div>
  );
}
