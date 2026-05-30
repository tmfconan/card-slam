import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider, useAuth } from "../contexts/AuthContext";
import { ThemeProvider } from "../contexts/ThemeContext";
import Layout from "../components/Layout";
import { server } from "../test/server";

const MOCK_STEPS = {
  steps: [
    {
      id: 1,
      title: "Get oriented in the sidebar",
      summary: "The sidebar is your main navigation.",
      location: "Left edge of the screen",
      action: "Look at the sidebar links.",
      expect: "The active page is highlighted.",
    },
  ],
};

function renderLayout({ admin = false }: { admin?: boolean } = {}) {
  localStorage.setItem("token", "mock-token");
  if (admin) {
    localStorage.setItem(
      "currentUser",
      JSON.stringify({ username: "admin", role: "admin" })
    );
  }
  return render(
    <MemoryRouter>
      <AuthProvider>
        <ThemeProvider>
          <Layout />
        </ThemeProvider>
      </AuthProvider>
    </MemoryRouter>
  );
}

async function waitForLoad() {
  await waitFor(() =>
    expect(screen.queryByText("Loading…")).not.toBeInTheDocument()
  );
}

describe("Layout sidebar", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
    localStorage.setItem("token", "mock-token");
    server.use(
      http.get("/api/onboarding/steps", () => HttpResponse.json(MOCK_STEPS))
    );
  });

  it("renders a dark mode toggle next to Sign out", async () => {
    renderLayout();
    await waitForLoad();
    expect(screen.getByTestId("theme-toggle")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
  });

  it("clicking the dark mode toggle switches the document into dark mode", async () => {
    const user = userEvent.setup();
    renderLayout();
    await waitForLoad();

    const toggle = screen.getByTestId("theme-toggle");
    expect(document.documentElement.classList.contains("dark")).toBe(false);

    await user.click(toggle);

    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(toggle).toHaveAttribute("aria-checked", "true");
  });

  it("renders a sidebar toggle button", async () => {
    renderLayout();
    await waitForLoad();
    expect(
      screen.getByRole("button", { name: /toggle sidebar/i })
    ).toBeInTheDocument();
  });

  it("sidebar nav links are visible by default", async () => {
    renderLayout();
    await waitForLoad();
    expect(screen.getByRole("link", { name: "Kanban" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "List" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Calendar" })).toBeInTheDocument();
  });

  it("shows an Archive nav link pointing at /archive", async () => {
    renderLayout();
    await waitForLoad();
    const link = screen.getByRole("link", { name: "Archive" });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/archive");
    expect(screen.getByTestId("nav-icon-archive")).toBeInTheDocument();
  });

  it("clicking toggle hides the sidebar nav links", async () => {
    const user = userEvent.setup();
    renderLayout();
    await waitForLoad();

    await user.click(screen.getByRole("button", { name: /toggle sidebar/i }));

    expect(screen.queryByRole("link", { name: "Kanban" })).not.toBeInTheDocument();
  });

  it("clicking toggle again re-shows the sidebar nav links", async () => {
    const user = userEvent.setup();
    renderLayout();
    await waitForLoad();

    const btn = screen.getByRole("button", { name: /toggle sidebar/i });
    await user.click(btn);
    await user.click(btn);

    expect(screen.getByRole("link", { name: "Kanban" })).toBeInTheDocument();
  });

  it("shows the Feature Requests link for admin users pointing at /feature-requests", async () => {
    renderLayout({ admin: true });
    await waitForLoad();
    const link = screen.getByRole("link", { name: "Feature Requests" });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/feature-requests");
    expect(
      screen.queryByRole("link", { name: "Auto-Code" })
    ).not.toBeInTheDocument();
  });

  it("hides the Feature Requests link for non-admin users", async () => {
    renderLayout();
    await waitForLoad();
    expect(
      screen.queryByRole("link", { name: "Feature Requests" })
    ).not.toBeInTheDocument();
  });

  it("renders an icon next to each nav link", async () => {
    renderLayout({ admin: true });
    await waitForLoad();
    expect(screen.getByTestId("nav-icon-kanban")).toBeInTheDocument();
    expect(screen.getByTestId("nav-icon-list")).toBeInTheDocument();
    expect(screen.getByTestId("nav-icon-calendar")).toBeInTheDocument();
    expect(screen.getByTestId("nav-icon-categories")).toBeInTheDocument();
    expect(screen.getByTestId("nav-icon-reports")).toBeInTheDocument();
    expect(screen.getByTestId("nav-icon-users")).toBeInTheDocument();
    expect(screen.getByTestId("nav-icon-feature-requests")).toBeInTheDocument();
  });

  it("shows a What's Goin' On nav button with an icon", async () => {
    renderLayout();
    await waitForLoad();
    expect(
      screen.getByRole("button", { name: /what's goin' on/i })
    ).toBeInTheDocument();
    expect(screen.getByTestId("nav-icon-whats-goin-on")).toBeInTheDocument();
  });

  it("clicking What's Goin' On opens the summary modal", async () => {
    const user = userEvent.setup();
    renderLayout();
    await waitForLoad();

    expect(screen.queryByTestId("whats-goin-on-modal")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /what's goin' on/i }));

    await waitFor(() =>
      expect(screen.getByTestId("whats-goin-on-modal")).toBeInTheDocument()
    );
  });

  it("What's Goin' On modal can be dismissed via the close button", async () => {
    const user = userEvent.setup();
    renderLayout();
    await waitForLoad();

    await user.click(screen.getByRole("button", { name: /what's goin' on/i }));
    await waitFor(() =>
      expect(screen.getByTestId("whats-goin-on-modal")).toBeInTheDocument()
    );

    await user.click(screen.getByTestId("whats-goin-on-close"));
    expect(
      screen.queryByTestId("whats-goin-on-modal")
    ).not.toBeInTheDocument();
  });

  it("does not render a Getting Started nav link", async () => {
    renderLayout();
    await waitForLoad();
    expect(
      screen.queryByRole("link", { name: /getting started/i })
    ).not.toBeInTheDocument();
  });

  it("shows a help icon next to the Card Slam title that opens the tutorial modal", async () => {
    const user = userEvent.setup();
    renderLayout();
    await waitForLoad();

    const trigger = screen.getByRole("button", {
      name: /open getting started tutorial/i,
    });
    expect(trigger).toBeInTheDocument();
    expect(screen.queryByTestId("onboarding-modal")).not.toBeInTheDocument();

    await user.click(trigger);

    await waitFor(() =>
      expect(screen.getByTestId("onboarding-modal")).toBeInTheDocument()
    );
  });

  it("tutorial modal can be dismissed via the close button", async () => {
    const user = userEvent.setup();
    renderLayout();
    await waitForLoad();

    await user.click(
      screen.getByRole("button", { name: /open getting started tutorial/i })
    );
    await waitFor(() =>
      expect(screen.getByTestId("onboarding-modal")).toBeInTheDocument()
    );

    await user.click(screen.getByTestId("onboarding-close"));
    expect(screen.queryByTestId("onboarding-modal")).not.toBeInTheDocument();
  });

  it("icons do not interfere with the accessible link names", async () => {
    renderLayout({ admin: true });
    await waitForLoad();
    // Icons are aria-hidden, so the accessible name should still be the label only
    expect(screen.getByRole("link", { name: "Kanban" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "List" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Calendar" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Categories" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Reports" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Users" })).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Feature Requests" })
    ).toBeInTheDocument();
  });
});

// Logs in through the real AuthContext so first-login onboarding state flows
// the way it does in the app, then renders the Layout once authenticated.
function LoginThenLayout() {
  const { token, login } = useAuth();
  return token ? (
    <Layout />
  ) : (
    <button onClick={() => login("testuser", "pw")}>do-login</button>
  );
}

describe("Layout first-login onboarding", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
    server.use(
      http.get("/api/onboarding/steps", () => HttpResponse.json(MOCK_STEPS))
    );
  });

  function renderLoginThenLayout() {
    return render(
      <MemoryRouter>
        <AuthProvider>
          <ThemeProvider>
            <LoginThenLayout />
          </ThemeProvider>
        </AuthProvider>
      </MemoryRouter>
    );
  }

  it("auto-opens the tutorial when a new user logs in for the first time", async () => {
    server.use(
      http.get("/api/auth/me", () =>
        HttpResponse.json({
          username: "testuser",
          role: "user",
          theme: "light",
          tutorial_seen: false,
        })
      )
    );
    const user = userEvent.setup();
    renderLoginThenLayout();

    await user.click(screen.getByRole("button", { name: "do-login" }));

    await waitFor(() =>
      expect(screen.getByTestId("onboarding-modal")).toBeInTheDocument()
    );
  });

  it("marks the tutorial as seen server-side when auto-opened", async () => {
    let markedSeen = false;
    server.use(
      http.get("/api/auth/me", () =>
        HttpResponse.json({
          username: "testuser",
          role: "user",
          theme: "light",
          tutorial_seen: false,
        })
      ),
      http.put("/api/auth/me/tutorial-seen", () => {
        markedSeen = true;
        return HttpResponse.json({ tutorial_seen: true });
      })
    );
    const user = userEvent.setup();
    renderLoginThenLayout();

    await user.click(screen.getByRole("button", { name: "do-login" }));

    await waitFor(() => expect(markedSeen).toBe(true));
  });

  it("does not auto-open the tutorial for a returning user", async () => {
    server.use(
      http.get("/api/auth/me", () =>
        HttpResponse.json({
          username: "testuser",
          role: "user",
          theme: "light",
          tutorial_seen: true,
        })
      )
    );
    const user = userEvent.setup();
    renderLoginThenLayout();

    await user.click(screen.getByRole("button", { name: "do-login" }));

    // Wait for the board to finish loading, then confirm no tutorial appeared.
    await waitFor(() =>
      expect(screen.queryByText("Loading…")).not.toBeInTheDocument()
    );
    expect(screen.queryByTestId("onboarding-modal")).not.toBeInTheDocument();
  });
});
