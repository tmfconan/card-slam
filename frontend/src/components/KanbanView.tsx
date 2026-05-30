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

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

// Returns [sunday, saturday] (inclusive) of the week containing today,
// each as a YYYY-MM-DD string. Derived from todayStr() to stay consistent
// with the "Today" filter's date handling.
function weekRange(): [string, string] {
  const d = new Date(todayStr() + "T00:00:00Z");
  const day = d.getUTCDay(); // 0 = Sunday
  const sunday = new Date(d);
  sunday.setUTCDate(d.getUTCDate() - day);
  const saturday = new Date(d);
  saturday.setUTCDate(d.getUTCDate() + (6 - day));
  return [
    sunday.toISOString().split("T")[0],
    saturday.toISOString().split("T")[0],
  ];
}

export default function KanbanView({
  cards,
  categories,
  categoryMap,
  onUpdate,
}: Props) {
  const [filterCategory, setFilterCategory] = useState("");
  const [filterToday, setFilterToday] = useState(false);
  const [filterWeek, setFilterWeek] = useState(false);

  const [weekStart, weekEnd] = weekRange();

  const filtered = cards.filter((c) => {
    if (filterCategory && c.category_id !== filterCategory) return false;
    if (filterToday && c.todo_date !== todayStr()) return false;
    if (
      filterWeek &&
      (!c.todo_date || c.todo_date < weekStart || c.todo_date > weekEnd)
    )
      return false;
    return true;
  });

  const byStatus = STATUSES.reduce(
    (acc, s) => {
      acc[s] = filtered
        .filter((c) => c.status === s)
        .sort((a, b) => a.priority - b.priority || a.created_at.localeCompare(b.created_at));
      return acc;
    },
    {} as Record<Status, Card[]>
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

      const srcStatus = source.droppableId as Status;
      const dstStatus = destination.droppableId as Status;
      const movedCard = cards.find((c) => c.id === draggableId)!;

      // Build new ordering for affected columns
      const srcCards = byStatus[srcStatus].filter((c) => c.id !== draggableId);
      const dstCards =
        srcStatus === dstStatus
          ? srcCards
          : [...byStatus[dstStatus]];

      const updatedCard = { ...movedCard, status: dstStatus };
      if (srcStatus === dstStatus) {
        srcCards.splice(destination.index, 0, updatedCard);
      } else {
        dstCards.splice(destination.index, 0, updatedCard);
      }

      const reorderItems = [
        ...srcCards.map((c, i) => ({ id: c.id, status: srcStatus, priority: i })),
        ...(srcStatus !== dstStatus
          ? dstCards.map((c, i) => ({ id: c.id, status: dstStatus, priority: i }))
          : []),
      ];

      await api.post("/cards/reorder", reorderItems);
      onUpdate();
    },
    [cards, byStatus, onUpdate]
  );

  return (
    <div className="p-5 h-full flex flex-col">
      {/* Category filter chips */}
      <div className="mb-4 flex items-center gap-2 flex-wrap">
        <span className="text-xs text-gray-500 font-medium">Filter:</span>
        <button
          onClick={() => { setFilterCategory(""); setFilterToday(false); setFilterWeek(false); }}
          className={`text-xs px-3 py-1 rounded-full transition-colors ${
            !filterCategory && !filterToday && !filterWeek
              ? "bg-gray-800 text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          All
        </button>
        <button
          onClick={() => { setFilterToday((t) => !t); setFilterWeek(false); }}
          className={`text-xs px-3 py-1 rounded-full transition-colors font-medium ${
            filterToday
              ? "bg-blue-600 text-white"
              : "bg-blue-50 text-blue-600 hover:bg-blue-100"
          }`}
        >
          Today
        </button>
        <button
          onClick={() => { setFilterWeek((w) => !w); setFilterToday(false); }}
          className={`text-xs px-3 py-1 rounded-full transition-colors font-medium ${
            filterWeek
              ? "bg-blue-600 text-white"
              : "bg-blue-50 text-blue-600 hover:bg-blue-100"
          }`}
        >
          This Week
        </button>
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() =>
              setFilterCategory(filterCategory === cat.id ? "" : cat.id)
            }
            className="text-xs px-3 py-1 rounded-full transition-colors font-medium"
            style={
              filterCategory === cat.id
                ? { backgroundColor: cat.color, color: "#fff" }
                : { backgroundColor: `${cat.color}25`, color: cat.color }
            }
          >
            {cat.name}
          </button>
        ))}
      </div>

      {/* Kanban columns */}
      <DragDropContext onDragEnd={onDragEnd}>
        {/*
          min-h-0 lets the flex-1 row shrink properly inside the flex-col parent.
          items-stretch ensures all columns reach the row's full height so the
          Droppable bounding-rect covers the entire column, not just the cards in it.
        */}
        <div className="flex gap-4 overflow-x-auto flex-1 min-h-0 pb-4 items-stretch">
          {STATUSES.map((status) => (
            <div key={status} className="flex-shrink-0 w-60 flex flex-col">
              <div className="mb-2 flex items-center justify-between px-1">
                <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                  {STATUS_LABELS[status]}
                </h3>
                <span className="text-xs text-gray-400 bg-gray-200 px-1.5 py-0.5 rounded-full">
                  {byStatus[status].length}
                </span>
              </div>
              <Droppable droppableId={status}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`flex-1 min-h-24 overflow-y-auto rounded-xl p-2 space-y-2 transition-colors ${
                      snapshot.isDraggingOver ? "bg-blue-50" : "bg-gray-100"
                    }`}
                  >
                    {byStatus[status].map((card, index) => (
                      <Draggable
                        key={card.id}
                        draggableId={card.id}
                        index={index}
                      >
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                          >
                            <CardItem
                              card={card}
                              category={categoryMap[card.category_id]}
                              isDragging={snapshot.isDragging}
                              onUpdate={onUpdate}
                              categories={categories}
                            />
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                    {byStatus[status].length === 0 && !snapshot.isDraggingOver && (
                      <p className="text-xs text-gray-400 text-center pt-6 pb-2">
                        Drop here
                      </p>
                    )}
                  </div>
                )}
              </Droppable>
            </div>
          ))}
        </div>
      </DragDropContext>
    </div>
  );
}
