import { useState, useEffect, useCallback, ReactNode } from "react";
import { Routes, Route, Link, useLocation, Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useTheme } from "../contexts/ThemeContext";
import KanbanView from "./KanbanView";
import ListView from "./ListView";
import CalendarView from "./CalendarView";
import ArchiveView from "./ArchiveView";
import CategoryManager from "./CategoryManager";
import UserManagement from "./UserManagement";
import IntegrationsSettings from "./IntegrationsSettings";
import Reports from "./Reports";
import AutoCodeView from "./AutoCodeView";
import OnboardingGuide from "./OnboardingGuide";
import WhatsGoinOn from "./WhatsGoinOn";
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
  IntegrationsIcon,
  ArchiveIcon,
  HelpIcon,
  WhatsGoinOnIcon,
  SunIcon,
  MoonIcon,
} from "./NavIcons";

export default function Layout() {
  const { logout, currentUser, needsOnboarding, markOnboardingSeen } = useAuth();
  const { theme, toggleTheme } = useTheme();
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
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [whatsGoinOnOpen, setWhatsGoinOnOpen] = useState(false);

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

  // First-time users get the walkthrough automatically on their initial login.
  // markOnboardingSeen() records it server-side so it won't reappear later.
  useEffect(() => {
    if (needsOnboarding) {
      setOnboardingOpen(true);
      markOnboardingSeen();
    }
  }, [needsOnboarding, markOnboardingSeen]);

  const categoryMap = Object.fromEntries(categories.map((c) => [c.id, c]));
  const showPromptBar = !["/categories", "/users", "/reports", "/feature-requests", "/archive", "/integrations"].includes(location.pathname);

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
    <div className="flex h-screen bg-gray-50 dark:bg-gray-950 overflow-hidden" style={{ height: "100svh" }}>
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
          <div className="p-5 border-b border-gray-700 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <h1 className="text-lg font-bold text-white tracking-tight">Card Slam</h1>
              <button
                type="button"
                onClick={() => setOnboardingOpen(true)}
                aria-label="Open Getting Started tutorial"
                title="Getting Started"
                data-testid="open-onboarding"
                className="text-gray-400 hover:text-white transition-colors flex-shrink-0"
              >
                <HelpIcon className="w-5 h-5" />
              </button>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="text-gray-500 hover:text-white text-lg leading-none sm:hidden"
              aria-label="Close sidebar"
            >
              ✕
            </button>
          </div>
          <nav className="flex-1 p-3 flex flex-col gap-1">
            {navLink("/", "Kanban", <KanbanIcon />)}
            {navLink("/list", "List", <ListIcon />)}
            {navLink("/calendar", "Calendar", <CalendarIcon />)}
            {navLink("/archive", "Archive", <ArchiveIcon />)}
            {navLink("/categories", "Categories", <CategoriesIcon />)}
            {navLink("/reports", "Reports", <ReportsIcon />)}
            {isAdmin && navLink("/users", "Users", <UsersIcon />)}
            {isAdmin &&
              navLink("/feature-requests", "Feature Requests", <FeatureRequestsIcon />)}
            {navLink("/integrations", "Integrations", <IntegrationsIcon />)}
            {/* Pinned to the bottom of the nav, set apart by a divider. */}
            <div className="mt-auto pt-2 border-t border-gray-700">
              <button
                type="button"
                onClick={() => setWhatsGoinOnOpen(true)}
                data-testid="open-whats-goin-on"
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors text-gray-400 hover:bg-gray-800 hover:text-white"
              >
                <span aria-hidden="true" className="flex-shrink-0">
                  <WhatsGoinOnIcon />
                </span>
                What&apos;s Goin&apos; On
              </button>
            </div>
          </nav>
          <div className="p-4 border-t border-gray-700 flex items-center justify-between gap-2">
            <button
              onClick={logout}
              className="text-gray-500 hover:text-white text-xs transition-colors"
            >
              Sign out
            </button>
            <button
              type="button"
              onClick={toggleTheme}
              role="switch"
              aria-checked={theme === "dark"}
              aria-label="Toggle dark mode"
              title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              data-testid="theme-toggle"
              className="flex items-center gap-1.5 text-gray-500 hover:text-white text-xs transition-colors"
            >
              {theme === "dark" ? (
                <SunIcon className="w-4 h-4" />
              ) : (
                <MoonIcon className="w-4 h-4" />
              )}
              <span>{theme === "dark" ? "Light mode" : "Dark mode"}</span>
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
            <div className="flex-1 bg-white dark:bg-gray-900 border-b dark:border-gray-700 px-4 py-3 flex items-center">
              <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
                {location.pathname === "/reports"
                  ? "Reports"
                  : location.pathname === "/feature-requests"
                  ? "Feature Requests"
                  : location.pathname === "/archive"
                  ? "Archive"
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
                path="/archive"
                element={
                  <ArchiveView
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
              <Route path="/reports" element={<Reports />} />
              {isAdmin && (
                <Route path="/users" element={<UserManagement />} />
              )}
              {isAdmin && (
                <Route path="/feature-requests" element={<AutoCodeView />} />
              )}
              <Route path="/integrations" element={<IntegrationsSettings />} />

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          )}
        </div>
      </div>

      <OnboardingGuide
        open={onboardingOpen}
        onClose={() => setOnboardingOpen(false)}
      />

      <WhatsGoinOn
        open={whatsGoinOnOpen}
        onClose={() => setWhatsGoinOnOpen(false)}
      />
    </div>
  );
}
