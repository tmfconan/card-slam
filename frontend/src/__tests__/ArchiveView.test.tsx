import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../test/server";
import ArchiveView from "../components/ArchiveView";
import { AuthProvider } from "../contexts/AuthContext";
import { Card, Category } from "../types";

const mockCategories: Category[] = [
  { id: "cat-1", name: "Frontend", color: "#3b82f6", created_at: "2024-01-01T00:00:00Z" },
  { id: "cat-2", name: "Backend", color: "#22c55e", created_at: "2024-01-02T00:00:00Z" },
];

const archivedCards: Card[] = [
  {
    id: "arch-1",
    title: "Old idea",
    description: "Shelved for later",
    category_id: "cat-1",
    status: "brainstorm",
    priority: 0,
    archived: true,
    duration: 30,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-02T00:00:00Z",
  },
  {
    id: "arch-2",
    title: "Finished cleanup",
    description: "Done and archived",
    category_id: "cat-2",
    status: "done",
    priority: 1,
    archived: true,
    duration: 30,
    created_at: "2024-01-03T00:00:00Z",
    updated_at: "2024-01-04T00:00:00Z",
  },
];

function renderArchive() {
  localStorage.setItem("token", "mock-token");
  const onUpdate = vi.fn();
  const categoryMap = Object.fromEntries(mockCategories.map((c) => [c.id, c]));
  render(
    <AuthProvider>
      <ArchiveView
        categories={mockCategories}
        categoryMap={categoryMap}
        onUpdate={onUpdate}
      />
    </AuthProvider>
  );
  return { onUpdate };
}

describe("ArchiveView", () => {
  it("requests cards with archived=true", async () => {
    let requestedUrl = "";
    server.use(
      http.get("/api/cards/", ({ request }) => {
        requestedUrl = request.url;
        return HttpResponse.json(archivedCards);
      })
    );
    renderArchive();
    await waitFor(() => expect(requestedUrl).toContain("archived=true"));
  });

  it("renders the archived cards returned by the API", async () => {
    server.use(http.get("/api/cards/", () => HttpResponse.json(archivedCards)));
    renderArchive();
    expect(await screen.findByText("Old idea")).toBeInTheDocument();
    expect(screen.getByText("Finished cleanup")).toBeInTheDocument();
    expect(screen.getByText(/2 archived/i)).toBeInTheDocument();
  });

  it("shows an empty state when there are no archived cards", async () => {
    server.use(http.get("/api/cards/", () => HttpResponse.json([])));
    renderArchive();
    expect(await screen.findByTestId("archive-empty")).toBeInTheDocument();
  });

  it("restoring a card PUTs archived=false and refreshes", async () => {
    let captured: any = null;
    server.use(
      http.get("/api/cards/", () => HttpResponse.json(archivedCards)),
      http.put("/api/cards/:id", async ({ request }) => {
        captured = await request.json();
        return HttpResponse.json({ ok: true });
      })
    );
    const user = userEvent.setup();
    const { onUpdate } = renderArchive();

    await screen.findByText("Old idea");
    const restoreButtons = screen.getAllByRole("button", { name: /restore/i });
    await user.click(restoreButtons[0]);

    await waitFor(() => expect(captured).not.toBeNull());
    expect(captured.archived).toBe(false);
    // The parent is notified so active views refresh too
    await waitFor(() => expect(onUpdate).toHaveBeenCalled());
  });
});
