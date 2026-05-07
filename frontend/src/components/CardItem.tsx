import { useState, useRef } from "react";
import { Card, Category, Status, STATUSES, STATUS_LABELS } from "../types";
import api from "../api/client";
import CardDetail from "./CardDetail";

// Colour for the status dot shown on calendar cards
const STATUS_DOT_COLOR: Record<Status, string> = {
  brainstorm:       "#9ca3af", // gray
  intent_to_do:     "#eab308", // yellow
  ready_to_do:      "#22c55e", // green
  in_progress:      "#3b82f6", // blue
  needs_finishing:  "#f97316", // orange
  done:             "#9ca3af", // gray (unused — done cards never show the dot)
};

interface Props {
  card: Card;
  category: Category | undefined;
  isDragging?: boolean;
  onUpdate: () => void;
  showStatus?: boolean;
  showUpdatedAt?: boolean;
  // Show a small coloured status dot (calendar/day views); never shown for done cards
  showStatusDot?: boolean;
  // Provide categories to enable click-to-edit; omit to suppress it
  categories?: Category[];
  // If provided, the × button calls this instead of deleting (e.g. move to unscheduled)
  onRemoveFromSchedule?: () => void;
}

export default function CardItem({
  card,
  category,
  isDragging,
  onUpdate,
  showStatus,
  showUpdatedAt,
  showStatusDot,
  categories,
  onRemoveFromSchedule,
}: Props) {
  const [showDetail, setShowDetail] = useState(false);
  const pointerOrigin = useRef<{ x: number; y: number } | null>(null);
  const didDrag = useRef(false);

  const handlePointerDown = (e: React.PointerEvent) => {
    pointerOrigin.current = { x: e.clientX, y: e.clientY };
    didDrag.current = false;
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!pointerOrigin.current) return;
    const dx = e.clientX - pointerOrigin.current.x;
    const dy = e.clientY - pointerOrigin.current.y;
    if (Math.sqrt(dx * dx + dy * dy) > 5) didDrag.current = true;
  };

  const handleClick = () => {
    if (!categories || didDrag.current) return;
    setShowDetail(true);
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onRemoveFromSchedule) { onRemoveFromSchedule(); return; }
    if (!confirm(`Delete "${card.title}"?`)) return;
    await api.delete(`/cards/${card.id}`);
    onUpdate();
  };

  const handleStatusChange = async (status: Status) => {
    await api.put(`/cards/${card.id}`, { status });
    onUpdate();
  };

  const borderColor = category?.color ?? "#94a3b8";
  const isDone = card.status === "done";
  const showDot = showStatusDot && !isDone;

  return (
    <>
      <article
        role="article"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onClick={handleClick}
        className={`relative group bg-white rounded-lg shadow-sm border-l-4 p-3 select-none ${
          isDragging ? "shadow-lg rotate-1 opacity-90" : ""
        } ${isDone ? "opacity-50" : ""} ${
          categories ? "cursor-pointer hover:shadow-md transition-shadow" : ""
        }`}
        style={{ borderLeftColor: borderColor }}
      >
        {/* Status dot — top-right corner, only on active cards in calendar context */}
        {showDot && (
          <span
            data-testid="status-dot"
            className="absolute top-2 right-6 w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: STATUS_DOT_COLOR[card.status] }}
          />
        )}

        <div className="flex items-start justify-between gap-1">
          <p
            className={`text-sm font-medium text-gray-800 leading-snug flex-1 ${
              isDone ? "line-through" : ""
            }`}
          >
            {card.title}
          </p>
          <button
            onClick={handleDelete}
            className="text-gray-400 hover:text-red-500 text-xs px-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
            title="Delete"
          >
            ✕
          </button>
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
              style={{ backgroundColor: `${category.color}20`, color: category.color }}
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
                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
              ))}
            </select>
          )}
        </div>
        {showUpdatedAt && (
          <p className="text-xs text-gray-300 mt-1.5">
            Updated {new Date(card.updated_at).toLocaleDateString()}
          </p>
        )}
      </article>

      {showDetail && categories && (
        <CardDetail
          card={card}
          categories={categories}
          onSave={onUpdate}
          onClose={() => setShowDetail(false)}
        />
      )}
    </>
  );
}
