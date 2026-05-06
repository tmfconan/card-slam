import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import api from "../api/client";

export interface CurrentUser {
  username: string;
  role: "admin" | "user";
}

interface AuthContextType {
  token: string | null;
  currentUser: CurrentUser | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

function loadStoredUser(): CurrentUser | null {
  try {
    const stored = localStorage.getItem("currentUser");
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(localStorage.getItem("token"));
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(loadStoredUser);

  const login = useCallback(async (username: string, password: string) => {
    const { data: loginData } = await api.post("/auth/login", { username, password });
    localStorage.setItem("token", loginData.access_token);
    setToken(loginData.access_token);

    // Fetch role from the server so the client doesn't need to parse the JWT
    const { data: meData } = await api.get("/auth/me");
    const user: CurrentUser = { username: meData.username, role: meData.role };
    localStorage.setItem("currentUser", JSON.stringify(user));
    setCurrentUser(user);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("token");
    localStorage.removeItem("currentUser");
    setToken(null);
    setCurrentUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ token, currentUser, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
