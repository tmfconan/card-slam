import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import api from "../api/client";
import { useAuth } from "./AuthContext";

export type Theme = "light" | "dark";

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | null>(null);

function loadStoredTheme(): Theme {
  return localStorage.getItem("theme") === "dark" ? "dark" : "light";
}

/**
 * Persist the chosen theme to the backend so it follows the user across
 * devices. Best-effort: a failed sync still keeps the local change.
 */
function persistTheme(theme: Theme) {
  if (localStorage.getItem("token")) {
    api.put("/auth/me/theme", { theme }).catch(() => {});
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  // Seed from localStorage so the correct theme paints before the server
  // round-trip resolves (avoids a light→dark flash on reload).
  const [theme, setThemeState] = useState<Theme>(loadStoredTheme);

  // Reflect the active theme on <html> so Tailwind's `dark:` variants apply.
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("theme", theme);
  }, [theme]);

  // When a session is active, adopt the server-stored preference.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    api
      .get("/auth/me")
      .then(({ data }) => {
        if (!cancelled && (data.theme === "light" || data.theme === "dark")) {
          setThemeState(data.theme);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [token]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    persistTheme(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      persistTheme(next);
      return next;
    });
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
