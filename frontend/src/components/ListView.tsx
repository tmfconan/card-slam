import { useState, useMemo } from "react";
import { Card, Category, Status, STATUSES, STATUS_LABELS } from "../types";
import api from "../api/client";
import CardDetail from "./CardDetail";

type SortKey = keyof Pick<
  Card,
  "title" | "status" | "category_id" | "priority" | "todo_date" | "created_at" | "updated_at"
>;
type SortDir = "asc" | "desc";

interface Props {
  cards: Card[];
  categories: Category[];
  categoryMap: Record<string, Category>;
  onUpdate: () => void;
}

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

export default function ListView({ cards, categories, categoryMap, onUpdate }: Props) {
  const [filterStatus, setFilterStatus] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterDate, setFilterDate] = useState("");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("priority");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const filtered = useMemo(() => {
    let result = [...cards];
    if (filterStatus) result = result.filter((c) => c.status === filterStatus);
    if (filterCategory) result = result.filter((c) => c.category_id === filterCategory);
    if (filterDate) result = result.filter((c) => c.todo_date === filterDate);
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (c) => c.title.toLowerCase().includes(q) || c.description.toLowerCase().includes(q)
      );
    }
    result.sort((a, b) => {
      // Cards without a todo_date always sort to the bottom regardless of direction
      const sentinel = "9999-99-99";
      const av = sortKey === "todo_date" ? (a.todo_date ?? sentinel) : (a[sortKey] ?? "");
      const bv = sortKey === "todo_date" ? (b.todo_date ?? sentinel) : (b[sortKey] ?? "");
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return result;
  }, [cards, filterStatus, filterCategory, filterDate, search, sortKey, sortDir]);

  const handleStatusChange = async (card: Card, status: Status) => {
    await api.put(`/cards/${card.id}`, { status });
    onUpdate();
  };

  const handleDelete = async (card: Card) => {
    if (!confirm(`Delete "${card.title}"?`)) return;
    await api.delete(`/cards/${card.id}`);
    onUpdate();
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allSelected = filtered.length > 0 && filtered.every((c) => selectedIds.has(c.id));

  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      if (filtered.every((c) => prev.has(c.id))) {
        // All visible cards are selected → clear the visible selection
        const next = new Set(prev);
        filtered.forEach((c) => next.delete(c.id));
        return next;
      }
      const next = new Set(prev);
      filtered.forEach((c) => next.add(c.id));
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const handleBulkDelete = async () => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    if (!confirm(`Delete ${ids.length} card${ids.length === 1 ? "" : "s"}?`)) return;
    await api.post("/cards/batch-delete", { ids });
    clearSelection();
    onUpdate();
  };

  const handleBulkArchive = async () => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    await api.post("/cards/batch-archive", { ids, archived: true });
    clearSelection();
    onUpdate();
  };

  const Th = ({ label, sortable }: { label: string; sortable?: SortKey }) => (
    <th
      className={`text-left text-xs font-semibold text-gray-500 uppercase tracking-wider py-3 px-4 ${
        sortable ? "cursor-pointer select-none hover:bg-gray-100" : ""
      }`}
      onClick={sortable ? () => handleSort(sortable) : undefined}
    >
      {label}
      {sortable && sortKey === sortable && (
        <span className="ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>
      )}
    </th>
  );

  return (
    <div className="p-3 sm:p-6">
      {/* ── Filters ─────────────────────────────────────────────────────────── */}
      <div className="mb-4 flex flex-wrap gap-2 items-center">
        <input
          type="search"
          placeholder="Search…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full sm:w-auto"
        />

        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="border rounded-lg px-3 py-1.5 text-sm focus:outline-none flex-1 sm:flex-none"
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </select>

        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="border rounded-lg px-3 py-1.5 text-sm focus:outline-none flex-1 sm:flex-none"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        {/* Date filter */}
        <div className="flex items-center gap-1.5 w-full sm:w-auto">
          <label htmlFor="lv-date" className="sr-only">Scheduled date</label>
          <input
            id="lv-date"
            aria-label="Scheduled date"
            type="date"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
            className="border rounded-lg px-3 py-1.5 text-sm focus:outline-none flex-1 sm:flex-none"
          />
          <button
            onClick={() => setFilterDate(todayStr())}
            className="text-xs text-blue-600 hover:underline whitespace-nowrap font-medium"
          >
            Today
          </button>
          {filterDate && (
            <button
              aria-label="Clear date"
              onClick={() => setFilterDate("")}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          )}
        </div>

        <span className="text-sm text-gray-400 ml-auto">{filtered.length} items</span>
      </div>

      {/* ── Bulk action bar ─────────────────────────────────────────────────── */}
      {selectedIds.size > 0 && (
        <div
          data-testid="bulk-action-bar"
          className="mb-4 flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2"
        >
          <span className="text-sm font-medium text-blue-700">
            {selectedIds.size} selected
          </span>
          <button
            onClick={handleBulkArchive}
            className="text-sm font-medium text-gray-600 hover:text-gray-900 px-2 py-1"
          >
            Archive
          </button>
          <button
            onClick={handleBulkDelete}
            className="text-sm font-medium text-red-500 hover:text-red-700 px-2 py-1"
          >
            Delete
          </button>
          <button
            onClick={clearSelection}
            className="text-sm text-gray-400 hover:text-gray-600 ml-auto"
          >
            Clear
          </button>
        </div>
      )}

      {/* ── Mobile card list (no horizontal scroll) ─────────────────────────── */}
      <div data-testid="list-mobile" className="sm:hidden space-y-2">
        {filtered.map((card) => {
          const category = categoryMap[card.category_id];
          return (
            <div
              key={card.id}
              className="bg-white rounded-xl border shadow-sm p-3 cursor-pointer active:bg-gray-50"
              onClick={() => setSelectedCard(card)}
            >
              <div className="flex items-start justify-between gap-2">
                <input
                  type="checkbox"
                  aria-label={`Select ${card.title}`}
                  checked={selectedIds.has(card.id)}
                  onChange={() => toggleSelect(card.id)}
                  onClick={(e) => e.stopPropagation()}
                  className="mt-1 flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{card.title}</p>
                  {card.description && (
                    <p className="text-xs text-gray-500 truncate mt-0.5">{card.description}</p>
                  )}
                </div>
                <select
                  value={card.status}
                  onChange={(e) => handleStatusChange(card, e.target.value as Status)}
                  onClick={(e) => e.stopPropagation()}
                  className="text-xs border rounded px-1.5 py-1 focus:outline-none flex-shrink-0"
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                  ))}
                </select>
              </div>

              <div className="mt-2 flex items-center gap-2 flex-wrap">
                {category && (
                  <span
                    className="text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{ backgroundColor: `${category.color}20`, color: category.color }}
                  >
                    {category.name}
                  </span>
                )}
                {card.todo_date && (
                  <span className="text-xs text-gray-400">{card.todo_date}</span>
                )}
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <p className="text-center text-sm text-gray-400 py-16">No cards found</p>
        )}
      </div>

      {/* ── Desktop table ──────────────────────────────────────────────────── */}
      <div className="hidden sm:block bg-white rounded-xl shadow-sm border overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="py-3 px-4 w-10">
                <input
                  type="checkbox"
                  aria-label="Select all"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                />
              </th>
              <Th label="Title" sortable="title" />
              <Th label="Category" sortable="category_id" />
              <Th label="Status" sortable="status" />
              <Th label="Priority" sortable="priority" />
              <Th label="Date" sortable="todo_date" />
              <Th label="Updated" sortable="updated_at" />
              <Th label="" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map((card) => {
              const category = categoryMap[card.category_id];
              return (
                <tr
                  key={card.id}
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => setSelectedCard(card)}
                >
                  <td className="py-3 px-4 w-10" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      aria-label={`Select ${card.title}`}
                      checked={selectedIds.has(card.id)}
                      onChange={() => toggleSelect(card.id)}
                    />
                  </td>
                  <td className="py-3 px-4 max-w-xs">
                    <p className="text-sm font-medium text-gray-800 truncate">{card.title}</p>
                    {card.description && (
                      <p className="text-xs text-gray-500 truncate mt-0.5">{card.description}</p>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    {category && (
                      <span
                        className="text-xs px-2 py-0.5 rounded-full font-medium"
                        style={{ backgroundColor: `${category.color}20`, color: category.color }}
                      >
                        {category.name}
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <select
                      value={card.status}
                      onChange={(e) => handleStatusChange(card, e.target.value as Status)}
                      onClick={(e) => e.stopPropagation()}
                      className="text-xs border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                      ))}
                    </select>
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-500">{card.priority}</td>
                  <td className="py-3 px-4 text-xs text-gray-400">{card.todo_date ?? "—"}</td>
                  <td className="py-3 px-4 text-xs text-gray-400 whitespace-nowrap">
                    {new Date(card.updated_at).toLocaleDateString()}
                  </td>
                  <td className="py-3 px-4">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(card); }}
                      className="text-xs text-gray-400 hover:text-red-500 transition-colors"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="py-16 text-center text-sm text-gray-400">
                  No cards found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selectedCard && (
        <CardDetail
          card={selectedCard}
          categories={categories}
          onSave={() => { onUpdate(); setSelectedCard(null); }}
          onClose={() => setSelectedCard(null)}
        />
      )}
    </div>
  );
}
