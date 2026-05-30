import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import api from "../api/client";

export interface CurrentUser {
  username: string;
  role: "admin" | "user";
}

export interface CaptchaSolution {
  id: string;
  answer: string;
}

interface AuthContextType {
  token: string | null;
  currentUser: CurrentUser | null;
  // True only right after a login where the server reports the user has not
  // yet seen the onboarding tutorial. Reset once the tutorial is shown.
  needsOnboarding: boolean;
  markOnboardingSeen: () => void;
  login: (
    username: string,
    password: string,
    captcha?: CaptchaSolution
  ) => Promise<void>;
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
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  const login = useCallback(
    async (username: string, password: string, captcha?: CaptchaSolution) => {
    const payload: Record<string, string> = { username, password };
    if (captcha) {
      payload.captcha_id = captcha.id;
      payload.captcha_answer = captcha.answer;
    }
    const { data: loginData } = await api.post("/auth/login", payload);
    localStorage.setItem("token", loginData.access_token);
    setToken(loginData.access_token);

    // Fetch role from the server so the client doesn't need to parse the JWT
    const { data: meData } = await api.get("/auth/me");
    const user: CurrentUser = { username: meData.username, role: meData.role };
    localStorage.setItem("currentUser", JSON.stringify(user));
    setCurrentUser(user);
    // Surface the tutorial automatically the first time a user signs in.
    setNeedsOnboarding(!meData.tutorial_seen);
    },
    []
  );

  const markOnboardingSeen = useCallback(() => {
    setNeedsOnboarding(false);
    // Persist server-side so it stays dismissed across devices. Fire-and-forget:
    // the worst case on failure is the tutorial showing again next login.
    api.put("/auth/me/tutorial-seen").catch(() => {});
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("token");
    localStorage.removeItem("currentUser");
    setToken(null);
    setCurrentUser(null);
    setNeedsOnboarding(false);
  }, []);

  return (
    <AuthContext.Provider
      value={{ token, currentUser, needsOnboarding, markOnboardingSeen, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
