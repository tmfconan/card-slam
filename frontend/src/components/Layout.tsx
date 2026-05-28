import { useState, useEffect, useCallback, ReactNode } from "react";
import { Routes, Route, Link, useLocation, Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import KanbanView from "./KanbanView";
import ListView from "./ListView";
import CalendarView from "./CalendarView";
import CategoryManager from "./CategoryManager";
import UserManagement from "./UserManagement";
import Reports from "./Reports";
import AutoCodeView from "./AutoCodeView";
import OnboardingGuide from "./OnboardingGuide";
import PromptBar from "./PromptBar";
import { Category, Card } from "../types";
import api from "../api/client";
import {
  KanbanIcon,
  ListIcon,
  CalendarIcon,
  CategoriesIcon,
  ReportsIcon,
  UsersIcon,
  FeatureRequestsIcon,
  GettingStartedIcon,
} from "./NavIcons";

export default function Layout() {
  const { logout, currentUser } = useAuth();
  const isAdmin = currentUser?.role === "admin";
  const location = useLocation();
  const [categories, setCategories] = useState<Category[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  // When the calendar is in Day view, store the selected date so the
  // "Direct add" button can default to that day at 8 AM.
  const [dayViewDate, setDayViewDate] = useState<string | null>(null);
  // Default open on desktop, closed on small screens
  const [sidebarOpen, setSidebarOpen] = useState(
    () => typeof window !== "undefined" && window.innerWidth >= 640
  );

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

  // Close sidebar on navigation when on a small screen
  useEffect(() => {
    if (window.innerWidth < 640) setSidebarOpen(false);
  }, [location.pathname]);

  const categoryMap = Object.fromEntries(categories.map((c) => [c.id, c]));
  const showPromptBar = !["/categories", "/users", "/reports", "/feature-requests", "/getting-started"].includes(location.pathname);

  const navLink = (to: string, label: string, icon: ReactNode) => {
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
        <span aria-hidden="true" className="flex-shrink-0">
          {icon}
        </span>
        {label}
      </Link>
    );
  };

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden" style={{ height: "100svh" }}>
      {/* Mobile overlay — tap outside sidebar to close */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 sm:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      {sidebarOpen && (
        <div
          className="w-52 bg-gray-900 flex flex-col flex-shrink-0
            fixed inset-y-0 left-0 z-50 sm:relative sm:z-auto"
        >
          <div className="p-5 border-b border-gray-700 flex items-center justify-between">
            <h1 className="text-lg font-bold text-white tracking-tight">Card Slam</h1>
            <button
              onClick={() => setSidebarOpen(false)}
              className="text-gray-500 hover:text-white text-lg leading-none sm:hidden"
              aria-label="Close sidebar"
            >
              ✕
            </button>
          </div>
          <nav className="flex-1 p-3 space-y-1">
            {navLink("/", "Kanban", <KanbanIcon />)}
            {navLink("/list", "List", <ListIcon />)}
            {navLink("/calendar", "Calendar", <CalendarIcon />)}
            {navLink("/categories", "Categories", <CategoriesIcon />)}
            {navLink("/reports", "Reports", <ReportsIcon />)}
            {navLink("/getting-started", "Getting Started", <GettingStartedIcon />)}
            {isAdmin && navLink("/users", "Users", <UsersIcon />)}
            {isAdmin &&
              navLink("/feature-requests", "Feature Requests", <FeatureRequestsIcon />)}
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
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar: toggle button + prompt bar */}
        <div className="flex items-stretch flex-shrink-0">
          <button
            onClick={() => setSidebarOpen((o) => !o)}
            aria-label="Toggle sidebar"
            className="px-3 bg-gray-900 text-gray-400 hover:text-white transition-colors flex-shrink-0 flex items-center"
          >
            {sidebarOpen ? "◀" : "☰"}
          </button>
          {showPromptBar ? (
            <div className="flex-1 min-w-0">
              <PromptBar
                categories={categories}
                onCardsCreated={fetchAll}
                defaultDate={dayViewDate ?? undefined}
                defaultTime={dayViewDate ? "08:00" : undefined}
              />
            </div>
          ) : (
            <div className="flex-1 bg-white border-b px-4 py-3 flex items-center">
              <span className="text-sm font-medium text-gray-600">
                {location.pathname === "/reports"
                  ? "Reports"
                  : location.pathname === "/feature-requests"
                  ? "Feature Requests"
                  : location.pathname === "/getting-started"
                  ? "Getting Started"
                  : "Categories"}
              </span>
            </div>
          )}
        </div>

        {/* min-h-0 lets the flex child shrink so overflow-auto actually scrolls */}
        <div className="flex-1 overflow-auto min-h-0">
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
                path="/calendar"
                element={
                  <CalendarView
                    cards={cards}
                    categories={categories}
                    categoryMap={categoryMap}
                    onUpdate={fetchAll}
                    onDayViewActive={setDayViewDate}
                  />
                }
              />
              <Route
                path="/categories"
                element={
                  <CategoryManager categories={categories} onUpdate={fetchAll} />
                }
              />
              <Route path="/reports" element={<Reports />} />
              <Route path="/getting-started" element={<OnboardingGuide />} />
              {isAdmin && (
                <Route path="/users" element={<UserManagement />} />
              )}
              {isAdmin && (
                <Route path="/feature-requests" element={<AutoCodeView />} />
              )}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          )}
        </div>
      </div>
    </div>
  );
}
