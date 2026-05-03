import { useState, useMemo } from "react";
import { Card, Category, Status, STATUSES, STATUS_LABELS } from "../types";
import api from "../api/client";

type SortKey = keyof Pick<
  Card,
  "title" | "status" | "category_id" | "priority" | "created_at" | "updated_at"
>;
type SortDir = "asc" | "desc";

interface Props {
  cards: Card[];
  categories: Category[];
  categoryMap: Record<string, Category>;
  onUpdate: () => void;
}

export default function ListView({
  cards,
  categories,
  categoryMap,
  onUpdate,
}: Props) {
  const [filterStatus, setFilterStatus] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("priority");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const filtered = useMemo(() => {
    let result = [...cards];
    if (filterStatus) result = result.filter((c) => c.status === filterStatus);
    if (filterCategory)
      result = result.filter((c) => c.category_id === filterCategory);
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (c) =>
          c.title.toLowerCase().includes(q) ||
          c.description.toLowerCase().includes(q)
      );
    }
    result.sort((a, b) => {
      const av = a[sortKey] ?? "";
      const bv = b[sortKey] ?? "";
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return result;
  }, [cards, filterStatus, filterCategory, search, sortKey, sortDir]);

  const handleStatusChange = async (card: Card, status: Status) => {
    await api.put(`/cards/${card.id}`, { status });
    onUpdate();
  };

  const handleDelete = async (card: Card) => {
    if (!confirm(`Delete "${card.title}"?`)) return;
    await api.delete(`/cards/${card.id}`);
    onUpdate();
  };

  const Th = ({ label, sortable }: { label: string; sortable?: SortKey }) => (
    <th
      className={`text-left text-xs font-semibold text-gray-500 uppercase tracking-wider py-3 px-4 ${sortable ? "cursor-pointer select-none hover:bg-gray-100" : ""}`}
      onClick={sortable ? () => handleSort(sortable) : undefined}
    >
      {label}
      {sortable && sortKey === sortable && (
        <span className="ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>
      )}
    </th>
  );

  return (
    <div className="p-6">
      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-3 items-center">
        <input
          type="search"
          placeholder="Search…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="border rounded-lg px-3 py-1.5 text-sm focus:outline-none"
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="border rounded-lg px-3 py-1.5 text-sm focus:outline-none"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <span className="text-sm text-gray-400 ml-auto">{filtered.length} items</span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <Th label="Title" sortable="title" />
              <Th label="Category" sortable="category_id" />
              <Th label="Status" sortable="status" />
              <Th label="Priority" sortable="priority" />
              <Th label="Updated" sortable="updated_at" />
              <Th label="" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map((card) => {
              const category = categoryMap[card.category_id];
              return (
                <tr key={card.id} className="hover:bg-gray-50">
                  <td className="py-3 px-4 max-w-xs">
                    <p className="text-sm font-medium text-gray-800 truncate">
                      {card.title}
                    </p>
                    {card.description && (
                      <p className="text-xs text-gray-500 truncate mt-0.5">
                        {card.description}
                      </p>
                    )}
                  </td>
                  <td className="py-3 px-4">
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
                  </td>
                  <td className="py-3 px-4">
                    <select
                      value={card.status}
                      onChange={(e) =>
                        handleStatusChange(card, e.target.value as Status)
                      }
                      className="text-xs border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {STATUS_LABELS[s]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-500">
                    {card.priority}
                  </td>
                  <td className="py-3 px-4 text-xs text-gray-400 whitespace-nowrap">
                    {new Date(card.updated_at).toLocaleDateString()}
                  </td>
                  <td className="py-3 px-4">
                    <button
                      onClick={() => handleDelete(card)}
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
                <td
                  colSpan={6}
                  className="py-16 text-center text-sm text-gray-400"
                >
                  No cards found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
