import { useState, useRef, useEffect, useCallback } from "react";
import { Card, Category } from "../types";
import api from "../api/client";
import CardItem from "./CardItem";

// ── Time-slot definitions — mirror DailyView (6:00 AM → 5:45 PM, 15-min, 48 slots)
const SLOTS: string[] = [];
for (let h = 6; h < 18; h++) {
  for (const m of ["00", "15", "30", "45"]) {
    SLOTS.push(`${String(h).padStart(2, "0")}:${m}`);
  }
}

// Each slot is 15 minutes / 32px tall, matching the daily view so the two views
// feel identical. The time axis on the left is TIME_W wide.
const SLOT_H = 32;
const TIME_W = 60;
const HEADER_H = 52;

// Only label the hour and half-hour to keep the grid readable.
function slotLabel(slot: string): string | null {
  const [hStr, m] = slot.split(":");
  if (m === "15" || m === "45") return null;
  const h = parseInt(hStr);
  return `${h % 12 === 0 ? 12 : h % 12}:${m} ${h >= 12 ? "PM" : "AM"}`;
}

export interface WeekDay {
  key: string; // YYYY-MM-DD
  label: string; // "Mon"
  sub: string; // "May 30"
}

interface Props {
  days: WeekDay[];
  // All visible cards bucketed by day key; `noDate` holds cards with no todo_date.
  byDate: Record<string, Card[]>;
  noDate: Card[];
  categories: Category[];
  categoryMap: Record<string, Category>;
  todayKey: string;
  onUpdate: () => void;
  onEnterDay: (date: string) => void;
}

// Where a dragged card will land when released.
type Target =
  | { kind: "slot"; date: string; slot: string }
  | { kind: "day"; date: string } // a day's unscheduled tray (clears the time)
  | { kind: "nodate" }; // the no-date tray (clears date + time)

interface DragState {
  cardId: string;
  card: Card;
}

interface ResizeState {
  cardId: string;
  card: Card;
  date: string;
  edge: "top" | "bottom";
  originalStartIdx: number;
  originalEndIdx: number;
  newStartIdx: number;
  newEndIdx: number;
}

const spansOf = (card: Card) => Math.max(1, Math.ceil((card.duration ?? 30) / 15));

// ── Drag handle — touch-only (mouse drag is started by the card wrapper) ──────
function DragHandle({
  card,
  onInitiateDrag,
}: {
  card: Card;
  onInitiateDrag: (card: Card) => void;
}) {
  return (
    <div
      data-testid={`drag-handle-${card.id}`}
      className="flex-shrink-0 flex items-center justify-center w-4 cursor-grab touch-none text-gray-300 hover:text-gray-400 select-none"
      onTouchStart={(e) => {
        const t = e.target as HTMLElement;
        if (t.closest("button") || t.closest('input[type="checkbox"]')) return;
        e.preventDefault();
        onInitiateDrag(card);
      }}
    >
      ⠿
    </div>
  );
}

// ── Resize handle — top/bottom edges of a scheduled card ──────────────────────
function ResizeHandle({
  card,
  date,
  edge,
  onInitiate,
}: {
  card: Card;
  date: string;
  edge: "top" | "bottom";
  onInitiate: (card: Card, date: string, edge: "top" | "bottom") => void;
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
        onInitiate(card, date, edge);
      }}
      onTouchStart={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onInitiate(card, date, edge);
      }}
      className={`absolute left-0 right-0 h-1.5 cursor-row-resize hover:bg-blue-300/70 ${
        edge === "top" ? "top-0" : "bottom-0"
      }`}
      style={{ touchAction: "none", zIndex: 30 }}
    />
  );
}

export default function WeekScheduleGrid({
  days,
  byDate,
  noDate,
  categories,
  categoryMap,
  todayKey,
  onUpdate,
  onEnterDay,
}: Props) {
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [hoverTarget, setHoverTarget] = useState<Target | null>(null);
  const hoverTargetRef = useRef<Target | null>(null);
  const [resizeState, setResizeState] = useState<ResizeState | null>(null);
  const resizeStateRef = useRef<ResizeState | null>(null);

  // Per-zone element refs used for pointer hit-testing during a drag.
  const gridRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const trayRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const noDateRef = useRef<HTMLDivElement | null>(null);

  const gridH = SLOTS.length * SLOT_H;

  // ── Drag / resize initiation ────────────────────────────────────────────────
  const initiateDrag = useCallback((card: Card) => {
    setDragState({ cardId: card.id, card });
    document.body.style.userSelect = "none";
  }, []);

  const startMouseDrag = useCallback(
    (e: React.MouseEvent, card: Card) => {
      if (e.button !== 0) return;
      const t = e.target as HTMLElement;
      if (t.closest('input[type="checkbox"]') || t.closest("button")) return;
      initiateDrag(card);
    },
    [initiateDrag]
  );

  const initiateResize = useCallback(
    (card: Card, date: string, edge: "top" | "bottom") => {
      if (!card.todo_time) return;
      const startIdx = SLOTS.indexOf(card.todo_time);
      if (startIdx < 0) return;
      const endIdx = Math.min(SLOTS.length - 1, startIdx + spansOf(card) - 1);
      const state: ResizeState = {
        cardId: card.id,
        card,
        date,
        edge,
        originalStartIdx: startIdx,
        originalEndIdx: endIdx,
        newStartIdx: startIdx,
        newEndIdx: endIdx,
      };
      resizeStateRef.current = state;
      setResizeState(state);
      document.body.style.userSelect = "none";
    },
    []
  );

  // ── Global pointer listeners during a move-drag ───────────────────────────────
  useEffect(() => {
    if (!dragState) return;

    // Find which zone (a day slot, a day tray, or the no-date tray) the pointer
    // is over. Day grids and trays are stacked vertically so a point hits one.
    const computeTarget = (clientX: number, clientY: number): Target | null => {
      for (const day of days) {
        const grid = gridRefs.current[day.key];
        if (grid) {
          const r = grid.getBoundingClientRect();
          if (
            clientX >= r.left &&
            clientX <= r.right &&
            clientY >= r.top &&
            clientY <= r.bottom
          ) {
            const idx = Math.max(
              0,
              Math.min(Math.floor((clientY - r.top) / SLOT_H), SLOTS.length - 1)
            );
            return { kind: "slot", date: day.key, slot: SLOTS[idx] };
          }
        }
        const tray = trayRefs.current[day.key];
        if (tray) {
          const r = tray.getBoundingClientRect();
          if (
            clientX >= r.left &&
            clientX <= r.right &&
            clientY >= r.top &&
            clientY <= r.bottom
          ) {
            return { kind: "day", date: day.key };
          }
        }
      }
      const nd = noDateRef.current;
      if (nd) {
        const r = nd.getBoundingClientRect();
        if (
          clientX >= r.left &&
          clientX <= r.right &&
          clientY >= r.top &&
          clientY <= r.bottom
        ) {
          return { kind: "nodate" };
        }
      }
      return null;
    };

    const updateTarget = (target: Target | null) => {
      hoverTargetRef.current = target;
      setHoverTarget(target);
    };

    const handleEnd = async () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      const target = hoverTargetRef.current;
      const card = dragState.card;
      if (target) {
        const update: Record<string, string | number | null> = {};
        if (target.kind === "slot") {
          if (card.todo_date !== target.date || card.todo_time !== target.slot) {
            update.todo_date = target.date;
            update.todo_time = target.slot;
          }
        } else if (target.kind === "day") {
          if (card.todo_date !== target.date || card.todo_time) {
            update.todo_date = target.date;
            update.todo_time = null;
          }
        } else {
          // no-date tray
          if (card.todo_date || card.todo_time) {
            update.todo_date = null;
            update.todo_time = null;
          }
        }
        if (Object.keys(update).length > 0) {
          await api.put(`/cards/${dragState.cardId}`, update);
          onUpdate();
        }
      }
      setDragState(null);
      updateTarget(null);
    };

    const onMouseMove = (e: MouseEvent) =>
      updateTarget(computeTarget(e.clientX, e.clientY));
    const onTouchMove = (e: TouchEvent) => {
      if (!e.touches[0]) return;
      e.preventDefault();
      updateTarget(computeTarget(e.touches[0].clientX, e.touches[0].clientY));
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
  }, [dragState, days, onUpdate]);

  // ── Global pointer listeners during a resize ──────────────────────────────────
  useEffect(() => {
    if (!resizeState) return;

    const calcSlotIdx = (clientY: number): number | null => {
      const grid = gridRefs.current[resizeState.date];
      if (!grid) return null;
      const { top, bottom } = grid.getBoundingClientRect();
      if (clientY < top || clientY > bottom) return null;
      return Math.max(
        0,
        Math.min(Math.floor((clientY - top) / SLOT_H), SLOTS.length - 1)
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
        newEnd = Math.max(current.originalStartIdx, Math.min(idx, SLOTS.length - 1));
      } else {
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
          update.todo_date = state.date;
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
  }, [resizeState, onUpdate]);

  // ── A compact draggable card (used in the unscheduled trays) ──────────────────
  const renderTrayCard = (card: Card) => {
    const isBeingDragged = dragState?.cardId === card.id;
    return (
      <div
        key={card.id}
        data-testid={`week-card-${card.id}`}
        data-date={card.todo_date ?? ""}
        data-duration={card.duration ?? 30}
        className="flex items-start gap-1 select-none"
        style={{ cursor: "grab", opacity: isBeingDragged ? 0.45 : 1 }}
        onMouseDown={(e) => startMouseDrag(e, card)}
      >
        <DragHandle card={card} onInitiateDrag={initiateDrag} />
        <div className="flex-1 min-w-0 overflow-hidden">
          <CardItem
            card={card}
            category={categoryMap[card.category_id]}
            isDragging={isBeingDragged}
            onUpdate={onUpdate}
            categories={categories}
            showStatusDot
          />
        </div>
      </div>
    );
  };

  // ── Render a single day column (header + time grid + unscheduled tray) ─────────
  const renderDayColumn = (day: WeekDay) => {
    const isToday = day.key === todayKey;
    const dayCards = byDate[day.key] ?? [];
    const scheduled = dayCards.filter(
      (c) => c.todo_time && SLOTS.includes(c.todo_time)
    );
    const unscheduled = dayCards.filter(
      (c) => !c.todo_time || !SLOTS.includes(c.todo_time)
    );

    // Group scheduled cards by slot so cards sharing a slot sit side by side.
    const slotMap: Record<string, Card[]> = {};
    for (const card of scheduled) {
      if (!card.todo_time) continue;
      (slotMap[card.todo_time] ??= []).push(card);
    }

    const trayHovered = hoverTarget?.kind === "day" && hoverTarget.date === day.key;

    return (
      <div
        key={day.key}
        data-testid={`week-day-${day.key}`}
        className="flex-shrink-0 w-44 border-l border-gray-200 flex flex-col"
      >
        {/* Sticky day header */}
        <div
          className={`sticky top-0 z-20 px-2 flex items-center justify-between border-b ${
            isToday ? "bg-blue-50" : "bg-white"
          }`}
          style={{ height: HEADER_H }}
        >
          <div>
            <p
              className={`text-xs font-semibold uppercase tracking-wide ${
                isToday ? "text-blue-600" : "text-gray-500"
              }`}
            >
              {day.label}
            </p>
            <p className={`text-xs ${isToday ? "text-blue-500 font-medium" : "text-gray-400"}`}>
              {day.sub}
            </p>
          </div>
          <button
            onClick={() => onEnterDay(day.key)}
            className="text-xs text-gray-400 hover:text-blue-500 transition-colors"
            title="Open day view"
          >
            ⏱
          </button>
        </div>

        {/* Time grid body */}
        <div
          ref={(el) => (gridRefs.current[day.key] = el)}
          data-testid={`week-grid-${day.key}`}
          className={`relative ${isToday ? "bg-blue-50/30" : ""}`}
          style={{ height: gridH }}
        >
          {/* Background slot lines */}
          {SLOTS.map((slot, i) => (
            <div
              key={slot}
              className="absolute left-0 right-0 border-b border-gray-100 pointer-events-none"
              style={{ top: i * SLOT_H, height: SLOT_H }}
            />
          ))}

          {/* Transparent overlay so mousemove fires over gaps between cards */}
          {dragState && (
            <div className="absolute inset-0" style={{ zIndex: 5, cursor: "grabbing" }} />
          )}

          {/* Scheduled cards, grouped by slot */}
          {Object.entries(slotMap).map(([slot, slotCards]) => {
            const slotIdx = SLOTS.indexOf(slot);
            const maxSpans = Math.max(...slotCards.map(spansOf));
            return (
              <div
                key={slot}
                className="absolute flex gap-0.5 overflow-hidden"
                style={{
                  top: slotIdx * SLOT_H,
                  left: 2,
                  right: 2,
                  height: maxSpans * SLOT_H - 2,
                  zIndex: 10,
                }}
              >
                {slotCards.map((card) => {
                  const spans = spansOf(card);
                  const isBeingDragged = dragState?.cardId === card.id;
                  const isBeingResized = resizeState?.cardId === card.id;
                  return (
                    <div
                      key={card.id}
                      data-testid={`week-card-${card.id}`}
                      data-slot={card.todo_time}
                      data-date={card.todo_date}
                      data-duration={card.duration ?? 30}
                      className="relative flex-1 min-w-0 flex flex-col select-none overflow-hidden"
                      style={{
                        height: spans * SLOT_H - 2,
                        cursor: "grab",
                        opacity: isBeingDragged || isBeingResized ? 0.45 : 1,
                      }}
                      onMouseDown={(e) => startMouseDrag(e, card)}
                    >
                      <ResizeHandle
                        card={card}
                        date={day.key}
                        edge="top"
                        onInitiate={initiateResize}
                      />
                      <div className="flex items-start gap-0.5 h-full">
                        <DragHandle card={card} onInitiateDrag={initiateDrag} />
                        <div className="flex-1 min-w-0 min-h-0 overflow-hidden">
                          <CardItem
                            card={card}
                            category={categoryMap[card.category_id]}
                            isDragging={isBeingDragged}
                            onUpdate={onUpdate}
                            categories={categories}
                            showStatusDot
                            onRemoveFromSchedule={async () => {
                              await api.put(`/cards/${card.id}`, { todo_time: null });
                              onUpdate();
                            }}
                          />
                        </div>
                      </div>
                      <ResizeHandle
                        card={card}
                        date={day.key}
                        edge="bottom"
                        onInitiate={initiateResize}
                      />
                    </div>
                  );
                })}
              </div>
            );
          })}

          {/* Drop placeholder while dragging over a slot in this day */}
          {dragState &&
            hoverTarget?.kind === "slot" &&
            hoverTarget.date === day.key &&
            (() => {
              const spans = spansOf(dragState.card);
              const idx = SLOTS.indexOf(hoverTarget.slot);
              return (
                <div
                  className="absolute rounded border-2 border-dashed border-blue-400 bg-blue-100/60 pointer-events-none"
                  style={{ top: idx * SLOT_H, left: 2, right: 2, height: spans * SLOT_H - 2, zIndex: 20 }}
                />
              );
            })()}

          {/* Resize preview */}
          {resizeState &&
            resizeState.date === day.key &&
            (() => {
              const top = resizeState.newStartIdx * SLOT_H;
              const height = (resizeState.newEndIdx - resizeState.newStartIdx + 1) * SLOT_H - 2;
              return (
                <div
                  data-testid="resize-placeholder"
                  data-start-slot={SLOTS[resizeState.newStartIdx]}
                  data-duration={(resizeState.newEndIdx - resizeState.newStartIdx + 1) * 15}
                  className="absolute rounded border-2 border-dashed border-green-500 bg-green-100/50 pointer-events-none"
                  style={{ top, left: 2, right: 2, height, zIndex: 25 }}
                />
              );
            })()}
        </div>

        {/* Unscheduled tray — bottom of the day; cards here can be dragged up to schedule */}
        <div
          ref={(el) => (trayRefs.current[day.key] = el)}
          data-testid={`week-unscheduled-${day.key}`}
          className={`border-t p-1.5 space-y-1.5 min-h-[64px] transition-colors ${
            trayHovered ? "bg-blue-50" : "bg-gray-50"
          }`}
        >
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
            Unscheduled
          </p>
          {unscheduled.map(renderTrayCard)}
          {unscheduled.length === 0 && !trayHovered && (
            <p className="text-[10px] text-gray-300 text-center py-1">—</p>
          )}
        </div>
      </div>
    );
  };

  const noDateHovered = hoverTarget?.kind === "nodate";

  return (
    <div data-testid="week-schedule-grid" className="flex-1 overflow-auto select-none">
      <div className="flex min-w-max">
        {/* Time axis */}
        <div className="sticky left-0 z-30 flex-shrink-0 bg-white" style={{ width: TIME_W }}>
          <div
            className="sticky top-0 z-10 bg-white border-b border-r"
            style={{ height: HEADER_H }}
          />
          <div className="relative border-r" style={{ height: gridH }}>
            {SLOTS.map((slot, i) => (
              <div
                key={slot}
                className="absolute left-0 right-0 flex items-start pt-0.5 px-1 border-b border-gray-100"
                style={{ top: i * SLOT_H, height: SLOT_H }}
              >
                {slotLabel(slot) && (
                  <span className="text-[10px] text-gray-400 leading-none">{slotLabel(slot)}</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Day columns */}
        {days.map(renderDayColumn)}

        {/* No-date tray — cards that have no scheduled date at all */}
        <div className="flex-shrink-0 w-44 border-l border-gray-200 flex flex-col">
          <div
            className="sticky top-0 z-20 px-2 flex flex-col justify-center border-b bg-white"
            style={{ height: HEADER_H }}
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Unscheduled
            </p>
            <p className="text-xs text-gray-400">No date</p>
          </div>
          <div
            ref={noDateRef}
            data-testid="week-nodate"
            className={`flex-1 min-h-[80px] p-2 space-y-2 transition-colors ${
              noDateHovered ? "bg-blue-50" : "bg-gray-100"
            }`}
          >
            {noDate.map(renderTrayCard)}
            {noDate.length === 0 && !noDateHovered && (
              <p className="text-xs text-gray-300 text-center pt-4">—</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
