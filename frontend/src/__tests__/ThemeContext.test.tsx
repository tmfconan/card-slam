import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { AuthProvider } from "../contexts/AuthContext";
import { ThemeProvider, useTheme } from "../contexts/ThemeContext";
import { server } from "../test/server";

function ThemeProbe() {
  const { theme, toggleTheme, setTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <button onClick={toggleTheme}>toggle</button>
      <button onClick={() => setTheme("dark")}>go-dark</button>
    </div>
  );
}

function renderTheme() {
  return render(
    <AuthProvider>
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>
    </AuthProvider>
  );
}

describe("ThemeContext", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
  });

  it("defaults to light mode with no dark class on <html>", () => {
    renderTheme();
    expect(screen.getByTestId("theme")).toHaveTextContent("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("toggling switches to dark mode and adds the dark class", async () => {
    const user = userEvent.setup();
    renderTheme();

    await user.click(screen.getByRole("button", { name: "toggle" }));

    expect(screen.getByTestId("theme")).toHaveTextContent("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(localStorage.getItem("theme")).toBe("dark");
  });

  it("toggling back returns to light mode and removes the dark class", async () => {
    const user = userEvent.setup();
    renderTheme();
    const btn = screen.getByRole("button", { name: "toggle" });

    await user.click(btn);
    await user.click(btn);

    expect(screen.getByTestId("theme")).toHaveTextContent("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("seeds the initial theme from localStorage", () => {
    localStorage.setItem("theme", "dark");
    renderTheme();
    expect(screen.getByTestId("theme")).toHaveTextContent("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("adopts the server-stored theme when a session is active", async () => {
    localStorage.setItem("token", "mock-token");
    server.use(
      http.get("/api/auth/me", () =>
        HttpResponse.json({ username: "admin", role: "admin", theme: "dark" })
      )
    );

    renderTheme();

    await waitFor(() =>
      expect(screen.getByTestId("theme")).toHaveTextContent("dark")
    );
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });
});
