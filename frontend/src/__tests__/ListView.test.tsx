import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ListView from "../components/ListView";
import { Card, Category } from "../types";

const TODAY = new Date().toISOString().split("T")[0];

const mockCategories: Category[] = [
  { id: "cat-1", name: "Frontend", color: "#3b82f6", created_at: "2024-01-01T00:00:00Z" },
  { id: "cat-2", name: "Backend", color: "#22c55e", created_at: "2024-01-02T00:00:00Z" },
];

const mockCategoryMap: Record<string, Category> = {
  "cat-1": mockCategories[0],
  "cat-2": mockCategories[1],
};

const mockCards: Card[] = [
  {
    id: "card-1",
    title: "Build login page",
    description: "Create login form",
    category_id: "cat-1",
    status: "brainstorm",
    priority: 0,
    duration: 30,
    todo_date: TODAY,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  },
  {
    id: "card-2",
    title: "Set up database",
    description: "Configure DynamoDB",
    category_id: "cat-2",
    status: "in_progress",
    priority: 1,
    duration: 30,
    todo_date: "2024-06-15",
    created_at: "2024-01-02T00:00:00Z",
    updated_at: "2024-01-02T00:00:00Z",
  },
  {
    id: "card-3",
    title: "Write API tests",
    description: "Add pytest coverage",
    category_id: "cat-2",
    status: "done",
    priority: 2,
    duration: 30,
    created_at: "2024-01-03T00:00:00Z",
    updated_at: "2024-01-03T00:00:00Z",
  },
];

// Helper — both mobile card list and desktop table are in DOM in jsdom
// (CSS media queries aren't applied). Use queryAllByText to handle duplicates.
const present = (text: string) => screen.queryAllByText(text).length > 0;
const absent = (text: string) => screen.queryAllByText(text).length === 0;

function renderList(onUpdate = vi.fn()) {
  localStorage.setItem("token", "mock-token");
  return render(
    <ListView
      cards={mockCards}
      categories={mockCategories}
      categoryMap={mockCategoryMap}
      onUpdate={onUpdate}
    />
  );
}

describe("ListView", () => {
  beforeEach(() => {
    localStorage.setItem("token", "mock-token");
  });

  // ── Core rendering ──────────────────────────────────────────────────────────

  it("all card titles are rendered", () => {
    renderList();
    expect(present("Build login page")).toBe(true);
    expect(present("Set up database")).toBe(true);
    expect(present("Write API tests")).toBe(true);
  });

  // ── Existing filters ────────────────────────────────────────────────────────

  it("search input filters cards by title substring", async () => {
    const user = userEvent.setup();
    renderList();
    await user.type(screen.getByPlaceholderText(/search/i), "login");
    expect(present("Build login page")).toBe(true);
    expect(absent("Set up database")).toBe(true);
    expect(absent("Write API tests")).toBe(true);
  });

  it("status filter dropdown filters to done", async () => {
    const user = userEvent.setup();
    renderList();
    await user.selectOptions(screen.getByDisplayValue("All statuses"), "done");
    expect(absent("Build login page")).toBe(true);
    expect(absent("Set up database")).toBe(true);
    expect(present("Write API tests")).toBe(true);
  });

  it("category filter dropdown filters to cat-1", async () => {
    const user = userEvent.setup();
    renderList();
    await user.selectOptions(screen.getByDisplayValue("All categories"), "cat-1");
    expect(present("Build login page")).toBe(true);
    expect(absent("Set up database")).toBe(true);
    expect(absent("Write API tests")).toBe(true);
  });

  it("clicking Priority column header shows sort indicator", async () => {
    const user = userEvent.setup();
    renderList();
    await user.click(screen.getByText(/priority/i));
    expect(screen.getByText(/priority/i).closest("th")).toHaveTextContent("↓");
  });

  it("Date column header is sortable and shows a sort indicator when clicked", async () => {
    const user = userEvent.setup();
    renderList();
    const dateHeader = screen
      .getAllByRole("columnheader")
      .find((h) => h.textContent?.trim() === "Date")!;
    await user.click(dateHeader);
    // Re-query after click — React has updated the DOM, look for the indicator
    const sorted = screen
      .getAllByRole("columnheader")
      .find((h) => h.textContent?.includes("Date") && h.textContent?.includes("↑"));
    expect(sorted).toBeTruthy();
  });

  it("sorting by Date ascending puts earlier dates first and undated cards last", async () => {
    const user = userEvent.setup();
    renderList();
    const dateHeader = screen
      .getAllByRole("columnheader")
      .find((h) => h.textContent?.trim() === "Date")!;
    await user.click(dateHeader);

    const mobile = screen.getByTestId("list-mobile");
    const titles = Array.from(mobile.querySelectorAll("p.font-medium")).map(
      (el) => el.textContent
    );
    // card-2 has 2024-06-15, card-1 has TODAY (~2026), card-3 has no date → bottom
    expect(titles.indexOf("Set up database")).toBeLessThan(titles.indexOf("Build login page"));
    expect(titles.indexOf("Build login page")).toBeLessThan(titles.indexOf("Write API tests"));
  });

  // ── Date filter ─────────────────────────────────────────────────────────────

  it("renders a date filter input", () => {
    renderList();
    expect(screen.getByLabelText(/scheduled date/i)).toBeInTheDocument();
  });

  it("renders a Today shortcut button", () => {
    renderList();
    expect(screen.getByRole("button", { name: /today/i })).toBeInTheDocument();
  });

  it("date filter shows only cards with matching todo_date", async () => {
    const user = userEvent.setup();
    renderList();
    await user.type(screen.getByLabelText(/scheduled date/i), "2024-06-15");
    expect(absent("Build login page")).toBe(true);
    expect(present("Set up database")).toBe(true);
    expect(absent("Write API tests")).toBe(true);
  });

  it("Today button filters to today's cards only", async () => {
    const user = userEvent.setup();
    renderList();
    await user.click(screen.getByRole("button", { name: /today/i }));
    // card-1 has todo_date = TODAY; card-2 = 2024-06-15; card-3 has no date
    expect(present("Build login page")).toBe(true);
    expect(absent("Set up database")).toBe(true);
    expect(absent("Write API tests")).toBe(true);
  });

  it("Clear date button restores all cards", async () => {
    const user = userEvent.setup();
    renderList();
    await user.click(screen.getByRole("button", { name: /today/i }));
    expect(absent("Write API tests")).toBe(true);
    await user.click(screen.getByRole("button", { name: /clear date/i }));
    expect(present("Write API tests")).toBe(true);
  });

  it("date filter with no matching cards shows empty state", async () => {
    const user = userEvent.setup();
    renderList();
    await user.type(screen.getByLabelText(/scheduled date/i), "1999-01-01");
    // Mobile empty state text
    const mobile = screen.getByTestId("list-mobile");
    expect(within(mobile).getByText(/no cards/i)).toBeInTheDocument();
  });

  // ── Mobile card list ────────────────────────────────────────────────────────

  it("renders a mobile card list container", () => {
    renderList();
    expect(screen.getByTestId("list-mobile")).toBeInTheDocument();
  });

  it("mobile card list shows all card titles", () => {
    renderList();
    const mobile = screen.getByTestId("list-mobile");
    expect(mobile).toHaveTextContent("Build login page");
    expect(mobile).toHaveTextContent("Set up database");
    expect(mobile).toHaveTextContent("Write API tests");
  });

  it("mobile cards show category badge", () => {
    renderList();
    expect(screen.getByTestId("list-mobile")).toHaveTextContent("Frontend");
  });

  it("mobile cards show todo_date when set", () => {
    renderList();
    // card-2 has todo_date 2024-06-15
    expect(screen.getByTestId("list-mobile")).toHaveTextContent("2024-06-15");
  });

  it("mobile list respects active filters", async () => {
    const user = userEvent.setup();
    renderList();
    await user.click(screen.getByRole("button", { name: /today/i }));
    const mobile = screen.getByTestId("list-mobile");
    expect(mobile).toHaveTextContent("Build login page");
    expect(mobile).not.toHaveTextContent("Set up database");
  });

  // ── Multi-select (bulk delete / archive) ─────────────────────────────────────

  it("no bulk action bar is shown when nothing is selected", () => {
    renderList();
    expect(screen.queryByTestId("bulk-action-bar")).not.toBeInTheDocument();
  });

  it("selecting a card reveals the bulk action bar with a count", async () => {
    const user = userEvent.setup();
    renderList();
    // Each card has a checkbox in both the mobile and desktop layouts
    await user.click(screen.getAllByLabelText("Select Build login page")[0]);
    const bar = screen.getByTestId("bulk-action-bar");
    expect(bar).toHaveTextContent("1 selected");
  });

  it("select-all checkbox selects every visible card", async () => {
    const user = userEvent.setup();
    renderList();
    await user.click(screen.getByLabelText("Select all"));
    expect(screen.getByTestId("bulk-action-bar")).toHaveTextContent("3 selected");
  });

  it("Clear button deselects everything and hides the bar", async () => {
    const user = userEvent.setup();
    renderList();
    await user.click(screen.getByLabelText("Select all"));
    await user.click(screen.getByRole("button", { name: /clear/i }));
    expect(screen.queryByTestId("bulk-action-bar")).not.toBeInTheDocument();
  });

  it("bulk Archive calls the batch endpoint and refreshes", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    renderList(onUpdate);
    await user.click(screen.getAllByLabelText("Select Build login page")[0]);
    await user.click(screen.getByRole("button", { name: /archive/i }));
    expect(onUpdate).toHaveBeenCalled();
    // Selection is cleared after the action completes
    expect(screen.queryByTestId("bulk-action-bar")).not.toBeInTheDocument();
  });

  it("bulk Delete confirms, calls the batch endpoint and refreshes", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    renderList(onUpdate);
    await user.click(screen.getByLabelText("Select all"));
    const bar = screen.getByTestId("bulk-action-bar");
    await user.click(within(bar).getByRole("button", { name: /delete/i }));
    expect(confirmSpy).toHaveBeenCalled();
    expect(onUpdate).toHaveBeenCalled();
    expect(screen.queryByTestId("bulk-action-bar")).not.toBeInTheDocument();
    confirmSpy.mockRestore();
  });

  it("cancelling the bulk Delete confirm keeps the selection and does not refresh", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    renderList(onUpdate);
    await user.click(screen.getByLabelText("Select all"));
    const bar = screen.getByTestId("bulk-action-bar");
    await user.click(within(bar).getByRole("button", { name: /delete/i }));
    expect(confirmSpy).toHaveBeenCalled();
    expect(onUpdate).not.toHaveBeenCalled();
    expect(screen.getByTestId("bulk-action-bar")).toBeInTheDocument();
    confirmSpy.mockRestore();
  });
});
