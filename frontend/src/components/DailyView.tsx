import { useState, useRef, useEffect, useCallback } from "react";
import { Card, Category, Status, STATUSES, STATUS_LABELS } from "../types";
import api from "../api/client";
import CardItem from "./CardItem";

interface Props {
  cards: Card[];
  categories: Category[];
  categoryMap: Record<string, Category>;
  selectedDate: string;
  onDateChange: (date: string) => void;
  onUpdate: () => void;
}

// 6:00 AM → 5:30 PM, 30-min increments = 24 slots
const SLOTS: string[] = [];
for (let h = 6; h < 18; h++) {
  SLOTS.push(`${String(h).padStart(2, "0")}:00`);
  SLOTS.push(`${String(h).padStart(2, "0")}:30`);
}

const SLOT_H = 64;   // px per slot
const TIME_W = 64;   // px for the time-label column

function slotLabel(slot: string) {
  const [hStr, m] = slot.split(":");
  const h = parseInt(hStr);
  return `${h % 12 === 0 ? 12 : h % 12}:${m} ${h >= 12 ? "PM" : "AM"}`;
}

function shiftDate(date: string, days: number) {
  const d = new Date(date + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

function formatHeader(date: string) {
  return new Date(date + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
}

interface DragState { cardId: string; card: Card }

export default function DailyView({
  cards, categories, categoryMap, selectedDate, onDateChange, onUpdate,
}: Props) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchStatus, setBatchStatus] = useState<Status>("in_progress");

  // Native drag state — no @hello-pangea/dnd in this component
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [hoverSlot, setHoverSlot] = useState<string | null>(null);
  const hoverSlotRef = useRef<string | null>(null); // ref so mouseup closure sees current value
  const gridRef = useRef<HTMLDivElement>(null);

  // ── Derived data ────────────────────────────────────────────────────────────
  const todayCards = cards.filter((c) => c.todo_date === selectedDate);
  const scheduled   = todayCards.filter((c) => c.todo_time && SLOTS.includes(c.todo_time));
  const unscheduled = todayCards.filter((c) => !c.todo_time || !SLOTS.includes(c.todo_time));

  // Multiple cards can share a slot — group them
  const slotMap: Record<string, Card[]> = {};
  for (const card of scheduled) {
    if (!card.todo_time) continue;
    (slotMap[card.todo_time] ??= []).push(card);
  }

  // ── Native drag ─────────────────────────────────────────────────────────────
  const startDrag = useCallback((e: React.MouseEvent, card: Card) => {
    if (e.button !== 0) return;
    // Do NOT call e.preventDefault() — it suppresses the click event on child buttons
    // (text selection is handled by CSS select-none instead)
    setDragState({ cardId: card.id, card });
    document.body.style.cursor = "grabbing";
    document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    if (!dragState) return;

    const onMove = (e: MouseEvent) => {
      if (!gridRef.current) return;
      const { top, bottom } = gridRef.current.getBoundingClientRect();
      const scrollTop = gridRef.current.scrollTop;
      const relY = e.clientY - top + scrollTop;
      // Only snap to a slot if mouse is inside the grid's visible bounds
      if (e.clientY < top || e.clientY > bottom) {
        hoverSlotRef.current = null;
        setHoverSlot(null);
        return;
      }
      const idx = Math.max(0, Math.min(Math.floor(relY / SLOT_H), SLOTS.length - 1));
      const slot = SLOTS[idx];
      hoverSlotRef.current = slot;
      setHoverSlot(slot);
    };

    const onUp = async () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      const target = hoverSlotRef.current;
      if (target && target !== dragState.card.todo_time) {
        await api.put(`/cards/${dragState.cardId}`, {
          todo_time: target,
          todo_date: selectedDate,
        });
        onUpdate();
      }
      setDragState(null);
      setHoverSlot(null);
      hoverSlotRef.current = null;
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [dragState, selectedDate, onUpdate]);

  // ── Batch ───────────────────────────────────────────────────────────────────
  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const applyBatch = async () => {
    await api.post("/cards/batch-status", {
      ids: Array.from(selectedIds),
      status: batchStatus,
    });
    setSelectedIds(new Set());
    onUpdate();
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full select-none">
      {/* Navigation */}
      <div className="bg-white border-b px-5 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <button aria-label="Prev day"
            onClick={() => onDateChange(shiftDate(selectedDate, -1))}
            className="px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50 transition-colors">
            ← Prev
          </button>
          <button aria-label="Today"
            onClick={() => onDateChange(new Date().toISOString().split("T")[0])}
            className="px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50 transition-colors">
            Today
          </button>
          <button aria-label="Next day"
            onClick={() => onDateChange(shiftDate(selectedDate, 1))}
            className="px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50 transition-colors">
            Next →
          </button>
        </div>
        <p data-testid="daily-date-header" className="text-sm font-medium text-gray-700">
          {formatHeader(selectedDate)}
        </p>
      </div>

      {/* Batch bar */}
      {selectedIds.size > 0 && (
        <div data-testid="batch-status-bar"
          className="bg-blue-50 border-b border-blue-200 px-5 py-2 flex items-center gap-4 flex-shrink-0">
          <span className="text-sm text-blue-700 font-medium">
            {selectedIds.size} selected
          </span>
          <select value={batchStatus} onChange={(e) => setBatchStatus(e.target.value as Status)}
            className="text-sm border border-blue-300 rounded px-2 py-1 bg-white focus:outline-none">
            {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
          </select>
          <button aria-label="Apply status" onClick={applyBatch}
            className="text-sm px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors">
            Apply
          </button>
          <button onClick={() => setSelectedIds(new Set())}
            className="text-xs text-blue-500 hover:underline">
            Clear
          </button>
        </div>
      )}

      {/* Grid + sidebar */}
      <div className="flex flex-1 overflow-hidden">
        {/* Time grid */}
        <div ref={gridRef} className="flex-1 overflow-y-auto relative"
          // Absorb pointer events so the invisible overlay below gets them during drag
          onMouseLeave={() => { hoverSlotRef.current = null; setHoverSlot(null); }}>
          <div className="relative" style={{ height: SLOTS.length * SLOT_H }}>

            {/* Slot rows — purely decorative, each at exactly i × SLOT_H */}
            {SLOTS.map((slot, i) => (
              <div
                key={slot}
                data-testid={`slot-${slot}`}
                className={`absolute flex border-b border-gray-100 pointer-events-none ${
                  hoverSlot === slot && dragState ? "bg-blue-50" : ""
                }`}
                style={{ top: i * SLOT_H, left: 0, right: 0, height: SLOT_H }}
              >
                <div className="flex-shrink-0 flex items-start pt-1 px-2" style={{ width: TIME_W }}>
                  <span className="text-xs text-gray-400 leading-none">{slotLabel(slot)}</span>
                </div>
              </div>
            ))}

            {/* Transparent drag-capture overlay — sits above grid lines but below cards.
                Ensures mousemove keeps firing over the grid even when over a card gap. */}
            {dragState && (
              <div className="absolute inset-0" style={{ zIndex: 5, cursor: "grabbing" }} />
            )}

            {/* Scheduled cards — grouped by slot, multiple cards rendered side-by-side */}
            {Object.entries(slotMap).map(([slot, slotCards]) => {
              const slotIdx = SLOTS.indexOf(slot);
              const maxSpans = Math.max(
                ...slotCards.map((c) => Math.max(1, Math.ceil((c.duration ?? 30) / 30)))
              );

              return (
                <div
                  key={slot}
                  className="absolute flex gap-1"
                  style={{
                    top: slotIdx * SLOT_H,
                    left: TIME_W,
                    right: 8,
                    height: maxSpans * SLOT_H - 2,
                    zIndex: 10,
                  }}
                >
                  {slotCards.map((card) => {
                    const spans = Math.max(1, Math.ceil((card.duration ?? 30) / 30));
                    const isBeingDragged = dragState?.cardId === card.id;

                    return (
                      <div
                        key={card.id}
                        data-testid={`daily-card-${card.id}`}
                        data-slot={card.todo_time}
                        data-duration={card.duration ?? 30}
                        className="flex-1 min-w-0 select-none"
                        style={{
                          height: spans * SLOT_H - 2,
                          cursor: "grab",
                          opacity: isBeingDragged ? 0.45 : 1,
                          zIndex: isBeingDragged ? 30 : undefined,
                        }}
                        onMouseDown={(e) => {
                          const t = e.target as HTMLElement;
                          if (t.closest('input[type="checkbox"]')) return;
                          if (t.closest("button")) return; // let button clicks fire normally
                          startDrag(e, card);
                        }}
                      >
                        <div className="flex items-start gap-1 h-full">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(card.id)}
                            onChange={() => toggleSelect(card.id)}
                            className="mt-1 flex-shrink-0 cursor-pointer"
                            style={{ pointerEvents: "auto" }}
                          />
                          <div className="flex-1 min-w-0 min-h-0 overflow-hidden">
                            <CardItem
                              card={card}
                              category={categoryMap[card.category_id]}
                              isDragging={isBeingDragged}
                              onUpdate={onUpdate}
                              categories={categories}
                              onRemoveFromSchedule={async () => {
                                await api.put(`/cards/${card.id}`, { todo_time: null });
                                onUpdate();
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}

            {/* Drop placeholder — shows where the dragged card will land */}
            {dragState && hoverSlot && (() => {
              const card = dragState.card;
              const spans = Math.max(1, Math.ceil((card.duration ?? 30) / 30));
              const idx = SLOTS.indexOf(hoverSlot);
              return (
                <div
                  className="absolute rounded border-2 border-dashed border-blue-400 bg-blue-100/60"
                  style={{
                    top: idx * SLOT_H,
                    left: TIME_W,
                    right: 8,
                    height: spans * SLOT_H - 2,
                    zIndex: 20,
                    pointerEvents: "none",
                  }}
                />
              );
            })()}
          </div>
        </div>

        {/* Unscheduled sidebar */}
        <div className="w-56 border-l flex flex-col flex-shrink-0">
          <div className="px-3 py-2 border-b bg-gray-50">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Unscheduled</p>
            <p className="text-xs text-gray-400">{selectedDate}</p>
          </div>
          <div data-testid="daily-unscheduled" className="flex-1 overflow-y-auto p-2 space-y-2">
            {unscheduled.map((card) => (
              <div
                key={card.id}
                data-testid={`daily-card-${card.id}`}
                data-duration={card.duration ?? 30}
                className="flex items-start gap-1"
                onMouseDown={(e) => {
                  const t = e.target as HTMLElement;
                  if (t.closest('input[type="checkbox"]')) return;
                  if (t.closest("button")) return;
                  startDrag(e, card);
                }}
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(card.id)}
                  onChange={() => toggleSelect(card.id)}
                  className="mt-1 flex-shrink-0 cursor-pointer"
                  style={{ pointerEvents: "auto" }}
                />
                <div className="flex-1">
                  <CardItem
                    card={card}
                    category={categoryMap[card.category_id]}
                    isDragging={dragState?.cardId === card.id}
                    onUpdate={onUpdate}
                    categories={categories}
                  />
                </div>
              </div>
            ))}
            {unscheduled.length === 0 && !dragState && (
              <p className="text-xs text-gray-400 text-center pt-6">No unscheduled cards</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
