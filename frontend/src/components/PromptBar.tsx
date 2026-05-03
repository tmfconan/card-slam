import { useState } from "react";
import { Category, WorkItem } from "../types";
import api from "../api/client";
import WorkItemConfirm from "./WorkItemConfirm";
import QuickAddCard from "./QuickAddCard";

interface Props {
  categories: Category[];
  onCardsCreated: () => void;
}

export default function PromptBar({ categories, onCardsCreated }: Props) {
  const [prompt, setPrompt] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [loading, setLoading] = useState(false);
  const [workItems, setWorkItems] = useState<WorkItem[] | null>(null);
  const [error, setError] = useState("");
  const [showQuickAdd, setShowQuickAdd] = useState(false);

  const selectedCategory = categories.find((c) => c.id === categoryId);

  const handleSubmit = async () => {
    if (!prompt.trim() || !categoryId) return;
    setLoading(true);
    setError("");
    try {
      const res = await api.post("/ai/parse", {
        prompt: prompt.trim(),
        category_id: categoryId,
      });
      setWorkItems(res.data.items);
    } catch {
      setError("Failed to parse. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmed = () => {
    setWorkItems(null);
    setPrompt("");
    onCardsCreated();
  };

  return (
    <>
      <div className="bg-white border-b px-6 py-3 flex-shrink-0">
        <div className="flex items-center gap-3">
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[150px]"
            style={
              selectedCategory
                ? { borderColor: selectedCategory.color, color: selectedCategory.color }
                : {}
            }
          >
            <option value="">Category…</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>

          <input
            type="text"
            placeholder="Describe work to do — Claude will break it into cards (Enter to submit)"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSubmit()}
            disabled={loading}
            className="flex-1 border rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          />

          <button
            onClick={handleSubmit}
            disabled={!prompt.trim() || !categoryId || loading}
            className="px-5 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap transition-colors"
          >
            {loading ? "Parsing…" : "Break it down"}
          </button>

          <button
            onClick={() => setShowQuickAdd(true)}
            className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 whitespace-nowrap transition-colors text-gray-700"
          >
            + Direct add
          </button>
        </div>
        {error && <p className="text-red-500 text-xs mt-1.5">{error}</p>}
        {categories.length === 0 && (
          <p className="text-xs text-amber-600 mt-1.5">
            Create a category first before adding cards.
          </p>
        )}
      </div>

      {workItems && (
        <WorkItemConfirm
          items={workItems}
          categoryId={categoryId}
          categories={categories}
          onConfirm={handleConfirmed}
          onCancel={() => setWorkItems(null)}
        />
      )}

      {showQuickAdd && (
        <QuickAddCard
          categories={categories}
          onCardCreated={() => {
            onCardsCreated();
          }}
          onClose={() => setShowQuickAdd(false)}
        />
      )}
    </>
  );
}
