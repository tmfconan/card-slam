import { useState, useCallback } from "react";
import {
  DragDropContext,
  Droppable,
  Draggable,
  DropResult,
} from "@hello-pangea/dnd";
import { Card, Category, Status, STATUSES, STATUS_LABELS } from "../types";
import api from "../api/client";
import CardItem from "./CardItem";

interface Props {
  cards: Card[];
  categories: Category[];
  categoryMap: Record<string, Category>;
  onUpdate: () => void;
}

// Statuses excluded from the calendar by default
const DEFAULT_EXCLUDED: Status[] = ["brainstorm", "done"];

function buildDays(count = 14): { key: string; label: string; sub: string }[] {
  const days = [];
  const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const MONTH_NAMES = [
    "Jan","Feb","Mar","Apr","May","Jun",
    "Jul","Aug","Sep","Oct","Nov","Dec",
  ];
  for (let i = 0; i < count; i++) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + i);
    days.push({
      key: d.toISOString().split("T")[0],
      label: DAY_NAMES[d.getDay()],
      sub: `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`,
    });
  }
  return days;
}

const DAYS = buildDays(14);
const VALID_KEYS = new Set(DAYS.map((d) => d.key));

export default function CalendarView({
  cards,
  categories,
  categoryMap,
  onUpdate,
}: Props) {
  const [filterCategory, setFilterCategory] = useState("");
  // Track which excluded statuses the user has toggled back on
  const [includedStatuses, setIncludedStatuses] = useState<Set<Status>>(
    new Set(STATUSES.filter((s) => !DEFAULT_EXCLUDED.includes(s)))
  );

  const toggleStatus = (status: Status) => {
    setIncludedStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  };

  const visible = cards.filter(
    (c) =>
      includedStatuses.has(c.status) &&
      (!filterCategory || c.category_id === filterCategory)
  );

  const byDate: Record<string, Card[]> = { unscheduled: [] };
  DAYS.forEach((d) => (byDate[d.key] = []));
  for (const card of visible) {
    const key =
      card.todo_date && VALID_KEYS.has(card.todo_date)
        ? card.todo_date
        : "unscheduled";
    byDate[key].push(card);
  }
  // Sort each bucket by priority
  Object.values(byDate).forEach((bucket) =>
    bucket.sort((a, b) => a.priority - b.priority)
  );

  const onDragEnd = useCallback(
    async (result: DropResult) => {
      const { destination, source, draggableId } = result;
      if (!destination) return;
      if (
        destination.droppableId === source.droppableId &&
        destination.index === source.index
      )
        return;

      const newDate =
        destination.droppableId === "unscheduled"
          ? null
          : destination.droppableId;

      await api.put(`/cards/${draggableId}`, { todo_date: newDate });
      onUpdate();
    },
    [onUpdate]
  );

  const columnClass =
    "flex-shrink-0 w-44 flex flex-col";

  return (
    <div className="p-4 h-full flex flex-col">
      {/* Controls */}
      <div className="mb-4 flex flex-wrap items-center gap-4">
        {/* Category filter */}
        <div className="flex items-center gap-2">
          <label
            htmlFor="cal-category"
            className="text-xs font-medium text-gray-500"
          >
            Category
          </label>
          <select
            id="cal-category"
            aria-label="Category"
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="text-sm border rounded-lg px-2 py-1 focus:outline-none"
          >
            <option value="">All</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* Status toggles — only show the ones excluded by default */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-500">Show:</span>
          {DEFAULT_EXCLUDED.map((s) => (
            <label
              key={s}
              className="flex items-center gap-1 text-xs text-gray-600 cursor-pointer select-none"
            >
              <input
                type="checkbox"
                aria-label={STATUS_LABELS[s]}
                checked={includedStatuses.has(s)}
                onChange={() => toggleStatus(s)}
                className="rounded"
              />
              {STATUS_LABELS[s]}
            </label>
          ))}
        </div>
      </div>

      {/* Calendar grid */}
      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex gap-3 overflow-x-auto flex-1 pb-4">
          {/* Unscheduled column */}
          <div className={columnClass}>
            <div className="mb-2 px-1">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Unscheduled
              </p>
              <p className="text-xs text-gray-400">No date</p>
            </div>
            <Droppable droppableId="unscheduled">
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className={`flex-1 min-h-20 rounded-xl p-2 space-y-2 transition-colors ${
                    snapshot.isDraggingOver ? "bg-blue-50" : "bg-gray-100"
                  }`}
                >
                  {byDate.unscheduled.map((card, i) => (
                    <Draggable key={card.id} draggableId={card.id} index={i}>
                      {(prov, snap) => (
                        <div
                          ref={prov.innerRef}
                          {...prov.draggableProps}
                          {...prov.dragHandleProps}
                        >
                          <CardItem
                            card={card}
                            category={categoryMap[card.category_id]}
                            isDragging={snap.isDragging}
                            onUpdate={onUpdate}
                            showUpdatedAt
                          />
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </div>

          {/* Day columns */}
          {DAYS.map((day) => {
            const isToday = day.key === DAYS[0].key;
            return (
              <div key={day.key} className={columnClass}>
                <div className="mb-2 px-1">
                  <p
                    className={`text-xs font-semibold uppercase tracking-wide ${
                      isToday ? "text-blue-600" : "text-gray-500"
                    }`}
                  >
                    {day.label}
                  </p>
                  <p
                    className={`text-xs ${
                      isToday ? "text-blue-500 font-medium" : "text-gray-400"
                    }`}
                  >
                    {day.sub}
                  </p>
                </div>
                <Droppable droppableId={day.key}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`flex-1 min-h-20 rounded-xl p-2 space-y-2 transition-colors ${
                        snapshot.isDraggingOver
                          ? "bg-blue-50"
                          : isToday
                          ? "bg-blue-50/50"
                          : "bg-gray-100"
                      }`}
                    >
                      {byDate[day.key].map((card, i) => (
                        <Draggable
                          key={card.id}
                          draggableId={card.id}
                          index={i}
                        >
                          {(prov, snap) => (
                            <div
                              ref={prov.innerRef}
                              {...prov.draggableProps}
                              {...prov.dragHandleProps}
                            >
                              <CardItem
                                card={card}
                                category={categoryMap[card.category_id]}
                                isDragging={snap.isDragging}
                                onUpdate={onUpdate}
                                showUpdatedAt
                              />
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                      {byDate[day.key].length === 0 &&
                        !snapshot.isDraggingOver && (
                          <p className="text-xs text-gray-300 text-center pt-4">
                            —
                          </p>
                        )}
                    </div>
                  )}
                </Droppable>
              </div>
            );
          })}
        </div>
      </DragDropContext>
    </div>
  );
}
