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

// 6:00 AM → 5:45 PM, 15-min increments = 48 slots
const SLOTS: string[] = [];
for (let h = 6; h < 18; h++) {
  for (const m of ["00", "15", "30", "45"]) {
    SLOTS.push(`${String(h).padStart(2, "0")}:${m}`);
  }
}

// Each slot represents 15 minutes. Total height stays 1536px (48 × 32 = 24 × 64).
export const SLOT_H = 32;
const TIME_W = 64;

// Number of 15-min slots a card occupies, given its duration in minutes.
function spansForDuration(duration: number | undefined): number {
  return Math.max(1, Math.ceil((duration ?? 30) / 15));
}

// Where a single card sits in the grid: its vertical extent (startIdx + spans)
// plus the horizontal column it was assigned so overlapping cards sit side-by-side.
export interface CardLayout {
  card: Card;
  startIdx: number;
  spans: number;
  col: number; // 0-based column within its overlap cluster
  cols: number; // total columns in that cluster
}

// Calendar-style layout: cards that overlap *in time* (accounting for duration,
// not just identical start times) are placed in adjacent columns so each card
// shows its full vertical extent without being covered by its neighbours.
export function computeLayout(cards: Card[]): CardLayout[] {
  const items = cards
    .map((card) => {
      const startIdx = SLOTS.indexOf(card.todo_time ?? "");
      const spans = spansForDuration(card.duration);
      return { card, startIdx, spans, endIdx: startIdx + spans };
    })
    .filter((it) => it.startIdx >= 0)
    // Sort by start, then by end so greedy column assignment is stable.
    .sort((a, b) => a.startIdx - b.startIdx || a.endIdx - b.endIdx);

  const result: CardLayout[] = [];
  let cluster: typeof items = [];
  let clusterEnd = -1;

  const flush = () => {
    if (cluster.length === 0) return;
    // Greedily pack each card into the first column it doesn't overlap.
    const colEnds: number[] = [];
    const assigned = cluster.map((it) => {
      let col = colEnds.findIndex((end) => end <= it.startIdx);
      if (col === -1) {
        col = colEnds.length;
        colEnds.push(it.endIdx);
      } else {
        colEnds[col] = it.endIdx;
      }
      return { it, col };
    });
    const cols = colEnds.length;
    for (const { it, col } of assigned) {
      result.push({ card: it.card, startIdx: it.startIdx, spans: it.spans, col, cols });
    }
    cluster = [];
    clusterEnd = -1;
  };

  for (const it of items) {
    // A card that starts at or after every card so far ends begins a new cluster.
    if (cluster.length > 0 && it.startIdx >= clusterEnd) flush();
    cluster.push(it);
    clusterEnd = Math.max(clusterEnd, it.endIdx);
  }
  flush();

  return result;
}

// Only show labels on the hour and half-hour to keep the grid readable.
function slotLabel(slot: string): string | null {
  const [hStr, m] = slot.split(":");
  if (m === "15" || m === "45") return null;
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

interface ResizeState {
  cardId: string;
  card: Card;
  edge: "top" | "bottom";
  originalStartIdx: number;
  originalEndIdx: number;
  newStartIdx: number;
  newEndIdx: number;
}

// ── Drag handle component ──────────────────────────────────────────────────
function DragHandle({
  card,
  testId,
  onInitiateDrag,
}: {
  card: Card;
  testId: string;
  onInitiateDrag: (card: Card) => void;
}) {
  return (
    <div
      data-testid={testId}
      className="flex-shrink-0 flex items-center justify-center w-5 cursor-grab touch-none text-gray-300 hover:text-gray-400 dark:text-gray-600 dark:hover:text-gray-400 select-none"
      // Mouse drag — handled by the parent wrapper's onMouseDown
      // Touch drag — dedicated handler here so we can preventDefault and avoid scroll conflict
      onTouchStart={(e) => {
        const t = e.target as HTMLElement;
        if (t.closest("button") || t.closest('input[type="checkbox"]')) return;
        e.preventDefault(); // prevent page scroll during touch drag
        onInitiateDrag(card);
      }}
    >
      ⠿
    </div>
  );
}

// ── Resize handle component — top/bottom edges of a scheduled card ────────
function ResizeHandle({
  card,
  edge,
  onInitiate,
}: {
  card: Card;
  edge: "top" | "bottom";
  onInitiate: (card: Card, edge: "top" | "bottom") => void;
}) {
  return (
    <div
      data-testid={`resize-handle-${edge}-${card.id}`}
      role="separator"
      aria-label={`Resize ${edge}`}
      onMouseDown={(e) => {
        if (e.button !== 0) return;
        e.stopPropagation(); // don't trigger move-drag on the parent card
        e.preventDefault();
        onInitiate(card, edge);
      }}
      onTouchStart={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onInitiate(card, edge);
      }}
      className={`absolute left-0 right-0 h-1.5 cursor-row-resize hover:bg-blue-300/70 ${
        edge === "top" ? "top-0" : "bottom-0"
      }`}
      style={{ touchAction: "none", zIndex: 30 }}
    />
  );
}

export default function DailyView({
  cards, categories, categoryMap, selectedDate, onDateChange, onUpdate,
}: Props) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchStatus, setBatchStatus] = useState<Status>("in_progress");
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [hoverSlot, setHoverSlot] = useState<string | null>(null);
  const [resizeState, setResizeState] = useState<ResizeState | null>(null);
  const resizeStateRef = useRef<ResizeState | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const hoverSlotRef = useRef<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  // ── Derived data ────────────────────────────────────────────────────────────
  const todayCards = cards.filter((c) => c.todo_date === selectedDate);
  const scheduled = todayCards.filter((c) => c.todo_time && SLOTS.includes(c.todo_time));
  const unscheduled = todayCards.filter((c) => !c.todo_time || !SLOTS.includes(c.todo_time));

  const layout = computeLayout(scheduled);

  // ── Drag initiation (shared by mouse and touch) ──────────────────────────
  const initiateDrag = useCallback((card: Card) => {
    setDragState({ cardId: card.id, card });
    document.body.style.userSelect = "none";
  }, []);

  const startMouseDrag = useCallback((e: React.MouseEvent, card: Card) => {
    if (e.button !== 0) return;
    const t = e.target as HTMLElement;
    if (t.closest('input[type="checkbox"]') || t.closest("button")) return;
    initiateDrag(card);
  }, [initiateDrag]);

  // ── Resize initiation ────────────────────────────────────────────────────
  const initiateResize = useCallback((card: Card, edge: "top" | "bottom") => {
    if (!card.todo_time) return;
    const startIdx = SLOTS.indexOf(card.todo_time);
    if (startIdx < 0) return;
    const spans = spansForDuration(card.duration);
    const endIdx = Math.min(SLOTS.length - 1, startIdx + spans - 1);
    const state: ResizeState = {
      cardId: card.id,
      card,
      edge,
      originalStartIdx: startIdx,
      originalEndIdx: endIdx,
      newStartIdx: startIdx,
      newEndIdx: endIdx,
    };
    resizeStateRef.current = state;
    setResizeState(state);
    document.body.style.userSelect = "none";
  }, []);

  // ── Global pointer listeners during drag ─────────────────────────────────
  useEffect(() => {
    if (!dragState) return;

    const calcSlot = (clientY: number): string | null => {
      if (!gridRef.current) return null;
      const { top, bottom } = gridRef.current.getBoundingClientRect();
      const scrollTop = gridRef.current.scrollTop;
      if (clientY < top || clientY > bottom) return null;
      const idx = Math.max(0, Math.min(Math.floor((clientY - top + scrollTop) / SLOT_H), SLOTS.length - 1));
      return SLOTS[idx];
    };

    const updateSlot = (slot: string | null) => {
      hoverSlotRef.current = slot;
      setHoverSlot(slot);
    };

    const handleEnd = async () => {
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
      updateSlot(null);
    };

    // Mouse
    const onMouseMove = (e: MouseEvent) => updateSlot(calcSlot(e.clientY));
    // Touch
    const onTouchMove = (e: TouchEvent) => {
      if (!e.touches[0]) return;
      e.preventDefault(); // prevent page scroll while dragging
      updateSlot(calcSlot(e.touches[0].clientY));
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", handleEnd);
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", handleEnd);

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", handleEnd);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", handleEnd);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [dragState, selectedDate, onUpdate]);

  // ── Global pointer listeners during resize ───────────────────────────────
  useEffect(() => {
    if (!resizeState) return;

    const calcSlotIdx = (clientY: number): number | null => {
      if (!gridRef.current) return null;
      const { top, bottom } = gridRef.current.getBoundingClientRect();
      const scrollTop = gridRef.current.scrollTop;
      if (clientY < top || clientY > bottom) return null;
      return Math.max(
        0,
        Math.min(Math.floor((clientY - top + scrollTop) / SLOT_H), SLOTS.length - 1)
      );
    };

    const updateFromY = (clientY: number) => {
      const idx = calcSlotIdx(clientY);
      if (idx === null) return;
      const current = resizeStateRef.current;
      if (!current) return;
      let newStart = current.newStartIdx;
      let newEnd = current.newEndIdx;
      if (current.edge === "bottom") {
        // Bottom edge — never crosses above the start; snaps to the slot at clientY
        newEnd = Math.max(current.originalStartIdx, Math.min(idx, SLOTS.length - 1));
      } else {
        // Top edge — never crosses below the end; snaps to the slot at clientY
        newStart = Math.max(0, Math.min(idx, current.originalEndIdx));
      }
      if (newStart === current.newStartIdx && newEnd === current.newEndIdx) return;
      const updated: ResizeState = { ...current, newStartIdx: newStart, newEndIdx: newEnd };
      resizeStateRef.current = updated;
      setResizeState(updated);
    };

    const handleEnd = async () => {
      document.body.style.userSelect = "";
      const state = resizeStateRef.current;
      if (state) {
        const newDuration = (state.newEndIdx - state.newStartIdx + 1) * 15;
        const newStartTime = SLOTS[state.newStartIdx];
        const originalDuration = state.card.duration ?? 30;
        const update: Record<string, string | number> = {};
        if (newDuration !== originalDuration) update.duration = newDuration;
        if (state.edge === "top" && newStartTime !== state.card.todo_time) {
          update.todo_time = newStartTime;
          update.todo_date = selectedDate;
        }
        if (Object.keys(update).length > 0) {
          await api.put(`/cards/${state.cardId}`, update);
          onUpdate();
        }
      }
      resizeStateRef.current = null;
      setResizeState(null);
    };

    const onMouseMove = (e: MouseEvent) => updateFromY(e.clientY);
    const onTouchMove = (e: TouchEvent) => {
      if (!e.touches[0]) return;
      e.preventDefault();
      updateFromY(e.touches[0].clientY);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", handleEnd);
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", handleEnd);

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", handleEnd);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", handleEnd);
      document.body.style.userSelect = "";
    };
  }, [resizeState, selectedDate, onUpdate]);

  // ── Batch ────────────────────────────────────────────────────────────────
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

  // ── Card row renderer (shared by grid and sheet) ──────────────────────────
  const renderCardRow = (card: Card, extra?: React.CSSProperties) => {
    const isBeingDragged = dragState?.cardId === card.id;
    return (
      <div
        key={card.id}
        data-testid={`daily-card-${card.id}`}
        data-slot={card.todo_time}
        data-duration={card.duration ?? 30}
        className="flex items-start gap-1 select-none"
        style={{ cursor: "grab", opacity: isBeingDragged ? 0.45 : 1, ...extra }}
        onMouseDown={(e) => startMouseDrag(e, card)}
      >
        <DragHandle
          card={card}
          testId={`drag-handle-${card.id}`}
          onInitiateDrag={initiateDrag}
        />
        <input
          type="checkbox"
          checked={selectedIds.has(card.id)}
          onChange={() => toggleSelect(card.id)}
          className="mt-1 flex-shrink-0 cursor-pointer"
          style={{ pointerEvents: "auto" }}
        />
        <div className="flex-1 min-w-0 overflow-hidden">
          <CardItem
            card={card}
            category={categoryMap[card.category_id]}
            isDragging={isBeingDragged}
            onUpdate={onUpdate}
            categories={categories}
            showStatusDot
            onRemoveFromSchedule={
              card.todo_time
                ? async () => {
                    await api.put(`/cards/${card.id}`, { todo_time: null });
                    onUpdate();
                  }
                : undefined
            }
          />
        </div>
      </div>
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full select-none">
      {/* Navigation */}
      <div className="bg-white dark:bg-gray-900 border-b dark:border-gray-700 px-4 py-2 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <button aria-label="Prev day"
            onClick={() => onDateChange(shiftDate(selectedDate, -1))}
            className="px-2 py-1.5 text-sm border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            ←
          </button>
          <button aria-label="Today"
            onClick={() => onDateChange(new Date().toISOString().split("T")[0])}
            className="px-2 py-1.5 text-sm border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            Today
          </button>
          <button aria-label="Next day"
            onClick={() => onDateChange(shiftDate(selectedDate, 1))}
            className="px-2 py-1.5 text-sm border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            →
          </button>
        </div>
        <p data-testid="daily-date-header" className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 text-right">
          {formatHeader(selectedDate)}
        </p>
      </div>

      {/* Batch bar */}
      {selectedIds.size > 0 && (
        <div data-testid="batch-status-bar"
          className="bg-blue-50 dark:bg-blue-950/40 border-b border-blue-200 dark:border-gray-700 px-4 py-2 flex items-center gap-3 flex-shrink-0 flex-wrap">
          <span className="text-sm text-blue-700 font-medium">{selectedIds.size} selected</span>
          <select value={batchStatus} onChange={(e) => setBatchStatus(e.target.value as Status)}
            className="text-sm border border-blue-300 dark:border-gray-700 rounded px-2 py-1 bg-white dark:bg-gray-900 dark:text-gray-100 dark:placeholder-gray-500 focus:outline-none">
            {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
          </select>
          <button aria-label="Apply status" onClick={applyBatch}
            className="text-sm px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors">
            Apply
          </button>
          <button onClick={() => setSelectedIds(new Set())} className="text-xs text-blue-500 hover:underline">
            Clear
          </button>
        </div>
      )}

      {/* Grid + desktop sidebar */}
      <div className="flex flex-1 overflow-hidden">
        {/* Time grid scrolls internally; no bottom padding needed on mobile now */}
        <div ref={gridRef} data-testid="daily-grid" className="flex-1 overflow-y-auto relative"
          onMouseLeave={() => { hoverSlotRef.current = null; setHoverSlot(null); }}>
          <div className="relative" style={{ height: SLOTS.length * SLOT_H }}>

            {/* Slot rows — background grid */}
            {SLOTS.map((slot, i) => (
              <div
                key={slot}
                data-testid={`slot-${slot}`}
                className={`absolute flex border-b border-gray-100 dark:border-gray-700 pointer-events-none ${
                  hoverSlot === slot && dragState ? "bg-blue-50 dark:bg-blue-950/40" : ""
                }`}
                style={{ top: i * SLOT_H, left: 0, right: 0, height: SLOT_H }}
              >
                <div className="flex-shrink-0 flex items-start pt-1 px-2" style={{ width: TIME_W }}>
                  {slotLabel(slot) && (
                    <span className="text-xs text-gray-400 leading-none">{slotLabel(slot)}</span>
                  )}
                </div>
              </div>
            ))}

            {/* Transparent overlay so mousemove fires over gaps between cards */}
            {dragState && (
              <div className="absolute inset-0" style={{ zIndex: 5, cursor: "grabbing" }} />
            )}

            {/* Scheduled cards — each spans its full duration; cards that overlap
                in time are packed into side-by-side columns. */}
            {layout.map(({ card, startIdx, spans, col, cols }) => {
              const isBeingDragged = dragState?.cardId === card.id;
              const isBeingResized = resizeState?.cardId === card.id;
              // Horizontal track runs from TIME_W to (right edge − 8px); split it
              // into `cols` equal columns and place this card in column `col`.
              const track = `(100% - ${TIME_W + 8}px)`;
              return (
                <div
                  key={card.id}
                  data-testid={`daily-card-${card.id}`}
                  data-slot={card.todo_time}
                  data-duration={card.duration ?? 30}
                  className="absolute min-w-0 flex flex-col select-none overflow-hidden"
                  style={{
                    top: startIdx * SLOT_H,
                    left: `calc(${TIME_W}px + ${track} * ${col} / ${cols})`,
                    width: `calc(${track} / ${cols} - 2px)`,
                    height: spans * SLOT_H - 2,
                    zIndex: 10,
                    cursor: "grab",
                    opacity: isBeingDragged || isBeingResized ? 0.45 : 1,
                  }}
                  onMouseDown={(e) => startMouseDrag(e, card)}
                >
                  <ResizeHandle card={card} edge="top" onInitiate={initiateResize} />
                  <div className="flex items-start gap-1 h-full">
                    <DragHandle
                      card={card}
                      testId={`drag-handle-${card.id}`}
                      onInitiateDrag={initiateDrag}
                    />
                    <input
                      type="checkbox"
                      checked={selectedIds.has(card.id)}
                      onChange={() => toggleSelect(card.id)}
                      className="mt-1 flex-shrink-0 cursor-pointer"
                      style={{ pointerEvents: "auto" }}
                    />
                    <div className="flex-1 min-w-0 min-h-0 h-full overflow-hidden">
                      <CardItem
                        card={card}
                        category={categoryMap[card.category_id]}
                        isDragging={isBeingDragged}
                        onUpdate={onUpdate}
                        categories={categories}
                        showStatusDot
                        fillHeight
                        onRemoveFromSchedule={async () => {
                          await api.put(`/cards/${card.id}`, { todo_time: null });
                          onUpdate();
                        }}
                      />
                    </div>
                  </div>
                  <ResizeHandle card={card} edge="bottom" onInitiate={initiateResize} />
                </div>
              );
            })}

            {/* Drop placeholder */}
            {dragState && hoverSlot && (() => {
              const spans = spansForDuration(dragState.card.duration);
              const idx = SLOTS.indexOf(hoverSlot);
              return (
                <div
                  className="absolute rounded border-2 border-dashed border-blue-400 bg-blue-100/60 pointer-events-none"
                  style={{ top: idx * SLOT_H, left: TIME_W, right: 8, height: spans * SLOT_H - 2, zIndex: 20 }}
                />
              );
            })()}

            {/* Resize preview — shows the new size while a resize is in progress */}
            {resizeState && (() => {
              const top = resizeState.newStartIdx * SLOT_H;
              const height =
                (resizeState.newEndIdx - resizeState.newStartIdx + 1) * SLOT_H - 2;
              return (
                <div
                  data-testid="resize-placeholder"
                  data-start-slot={SLOTS[resizeState.newStartIdx]}
                  data-duration={
                    (resizeState.newEndIdx - resizeState.newStartIdx + 1) * 15
                  }
                  className="absolute rounded border-2 border-dashed border-green-500 bg-green-100/50 pointer-events-none"
                  style={{ top, left: TIME_W, right: 8, height, zIndex: 25 }}
                />
              );
            })()}
          </div>
        </div>

        {/* Desktop sidebar — hidden on mobile, always in DOM for tests */}
        <div className="hidden sm:flex w-56 border-l dark:border-gray-700 flex-col flex-shrink-0">
          <div className="px-3 py-2 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Unscheduled</p>
            <p className="text-xs text-gray-400">{selectedDate}</p>
          </div>
          <div data-testid="daily-unscheduled" className="flex-1 overflow-y-auto p-2 space-y-2">
            {unscheduled.map((card) => renderCardRow(card))}
            {unscheduled.length === 0 && (
              <p className="text-xs text-gray-400 text-center pt-6">No unscheduled cards</p>
            )}
          </div>
        </div>
      </div>

      {/* Mobile: fixed bottom trigger — position:fixed escapes flex layout and
          overflow:hidden ancestors, so it's always visible at the viewport bottom */}
      <button
        data-testid="unscheduled-sheet-trigger"
        onClick={() => setSheetOpen(true)}
        className="sm:hidden flex-shrink-0 border-t dark:border-gray-700 bg-white dark:bg-gray-900 px-4 text-sm text-gray-700 dark:text-gray-300 font-medium flex items-center justify-between shadow-[0_-2px_8px_rgba(0,0,0,0.08)]"
        style={{
          paddingTop: "12px",
          // Keep content above the home indicator (safe area)
          paddingBottom: "max(12px, env(safe-area-inset-bottom))",
        }}
      >
        <span>Unscheduled</span>
        <span className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded-full">
          {unscheduled.length}
        </span>
      </button>

      {/* Mobile bottom sheet */}
      {sheetOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end sm:hidden">
          {/* Overlay */}
          <div
            data-testid="unscheduled-sheet-overlay"
            className="absolute inset-0 bg-black/40"
            onClick={() => setSheetOpen(false)}
          />
          {/* Sheet — paddingBottom keeps content above home indicator */}
          <div
            className="relative bg-white dark:bg-gray-900 rounded-t-2xl max-h-[65vh] flex flex-col shadow-2xl"
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
          >
            <div className="px-4 py-3 border-b dark:border-gray-700 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                Unscheduled · {selectedDate}
              </h3>
              <button
                aria-label="Close sheet"
                onClick={() => setSheetOpen(false)}
                className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 text-lg leading-none"
              >
                ✕
              </button>
            </div>
            <div data-testid="unscheduled-sheet" className="overflow-y-auto p-3 space-y-2 flex-1">
              {unscheduled.map((card) => renderCardRow(card))}
              {unscheduled.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-8">No unscheduled cards</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
