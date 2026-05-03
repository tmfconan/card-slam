import { useState, useEffect, useCallback } from "react";
import { Routes, Route, Link, useLocation, Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import KanbanView from "./KanbanView";
import ListView from "./ListView";
import CategoryManager from "./CategoryManager";
import PromptBar from "./PromptBar";
import { Category, Card } from "../types";
import api from "../api/client";

export default function Layout() {
  const { logout } = useAuth();
  const location = useLocation();
  const [categories, setCategories] = useState<Category[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    const [catRes, cardsRes] = await Promise.all([
      api.get("/categories/"),
      api.get("/cards/"),
    ]);
    setCategories(catRes.data);
    setCards(cardsRes.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const categoryMap = Object.fromEntries(categories.map((c) => [c.id, c]));
  const showPromptBar = location.pathname !== "/categories";

  const navLink = (to: string, label: string) => {
    const active = location.pathname === to;
    return (
      <Link
        to={to}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
          active
            ? "bg-blue-600 text-white"
            : "text-gray-400 hover:bg-gray-800 hover:text-white"
        }`}
      >
        {label}
      </Link>
    );
  };

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Sidebar */}
      <div className="w-52 bg-gray-900 flex flex-col flex-shrink-0">
        <div className="p-5 border-b border-gray-700">
          <h1 className="text-lg font-bold text-white tracking-tight">
            Card Slam
          </h1>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {navLink("/", "Kanban")}
          {navLink("/list", "List")}
          {navLink("/categories", "Categories")}
        </nav>
        <div className="p-4 border-t border-gray-700">
          <button
            onClick={logout}
            className="text-gray-500 hover:text-white text-xs transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {showPromptBar && (
          <PromptBar categories={categories} onCardsCreated={fetchAll} />
        )}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center h-full text-gray-400 text-sm">
              Loading…
            </div>
          ) : (
            <Routes>
              <Route
                path="/"
                element={
                  <KanbanView
                    cards={cards}
                    categories={categories}
                    categoryMap={categoryMap}
                    onUpdate={fetchAll}
                  />
                }
              />
              <Route
                path="/list"
                element={
                  <ListView
                    cards={cards}
                    categories={categories}
                    categoryMap={categoryMap}
                    onUpdate={fetchAll}
                  />
                }
              />
              <Route
                path="/categories"
                element={
                  <CategoryManager categories={categories} onUpdate={fetchAll} />
                }
              />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          )}
        </div>
      </div>
    </div>
  );
}
