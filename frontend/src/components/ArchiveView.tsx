import { useState, useEffect, useCallback } from "react";
import { Card, Category } from "../types";
import api from "../api/client";
import CardItem from "./CardItem";

interface Props {
  categories: Category[];
  categoryMap: Record<string, Category>;
  // Refresh the parent's active card data after a card is restored/deleted.
  onUpdate: () => void;
}

export default function ArchiveView({ categories, categoryMap, onUpdate }: Props) {
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchArchived = useCallback(async () => {
    setLoading(true);
    const res = await api.get("/cards/", { params: { archived: true } });
    setCards(res.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchArchived();
  }, [fetchArchived]);

  // Re-fetch the archive list and notify the parent so active views update too.
  const refresh = useCallback(() => {
    fetchArchived();
    onUpdate();
  }, [fetchArchived, onUpdate]);

  const handleUnarchive = async (card: Card) => {
    await api.put(`/cards/${card.id}`, { archived: false });
    refresh();
  };

  return (
    <div className="p-3 sm:p-6">
      <div className="mb-4 flex items-baseline gap-3">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Archive</h2>
        <span className="text-sm text-gray-400">{cards.length} archived</span>
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        Archived cards are hidden from the Kanban, List, and Calendar views.
        Restore a card to bring it back to your active work.
      </p>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400 text-sm">
          Loading…
        </div>
      ) : cards.length === 0 ? (
        <p className="text-center text-sm text-gray-400 py-16" data-testid="archive-empty">
          No archived cards
        </p>
      ) : (
        <div
          data-testid="archive-list"
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
        >
          {cards.map((card) => (
            <CardItem
              key={card.id}
              card={card}
              category={categoryMap[card.category_id]}
              categories={categories}
              onUpdate={refresh}
              onUnarchive={() => handleUnarchive(card)}
              showUpdatedAt
            />
          ))}
        </div>
      )}
    </div>
  );
}
