import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../contexts/AuthContext";
import Layout from "../components/Layout";

function renderLayout() {
  localStorage.setItem("token", "mock-token");
  return render(
    <MemoryRouter>
      <AuthProvider>
        <Layout />
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
    localStorage.setItem("token", "mock-token");
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
});
