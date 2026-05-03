import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ListView from "../components/ListView";
import { Card, Category } from "../types";

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
    created_at: "2024-01-03T00:00:00Z",
    updated_at: "2024-01-03T00:00:00Z",
  },
];

describe("ListView", () => {
  beforeEach(() => {
    localStorage.setItem("token", "mock-token");
  });

  it("all card titles appear in the table", () => {
    const onUpdate = vi.fn();
    render(
      <ListView
        cards={mockCards}
        categories={mockCategories}
        categoryMap={mockCategoryMap}
        onUpdate={onUpdate}
      />
    );
    expect(screen.getByText("Build login page")).toBeInTheDocument();
    expect(screen.getByText("Set up database")).toBeInTheDocument();
    expect(screen.getByText("Write API tests")).toBeInTheDocument();
  });

  it("search input filters cards by title substring", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(
      <ListView
        cards={mockCards}
        categories={mockCategories}
        categoryMap={mockCategoryMap}
        onUpdate={onUpdate}
      />
    );

    const searchInput = screen.getByPlaceholderText(/search/i);
    await user.type(searchInput, "login");

    expect(screen.getByText("Build login page")).toBeInTheDocument();
    expect(screen.queryByText("Set up database")).not.toBeInTheDocument();
    expect(screen.queryByText("Write API tests")).not.toBeInTheDocument();
  });

  it("status filter dropdown filters cards", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(
      <ListView
        cards={mockCards}
        categories={mockCategories}
        categoryMap={mockCategoryMap}
        onUpdate={onUpdate}
      />
    );

    // The filter status select contains "All statuses" as its first option
    const statusSelect = screen.getByDisplayValue("All statuses");
    await user.selectOptions(statusSelect, "done");

    expect(screen.queryByText("Build login page")).not.toBeInTheDocument();
    expect(screen.queryByText("Set up database")).not.toBeInTheDocument();
    expect(screen.getByText("Write API tests")).toBeInTheDocument();
  });

  it("category filter dropdown filters cards", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(
      <ListView
        cards={mockCards}
        categories={mockCategories}
        categoryMap={mockCategoryMap}
        onUpdate={onUpdate}
      />
    );

    // The category filter select contains "All categories" as its first option
    const categorySelect = screen.getByDisplayValue("All categories");
    await user.selectOptions(categorySelect, "cat-1");

    expect(screen.getByText("Build login page")).toBeInTheDocument();
    expect(screen.queryByText("Set up database")).not.toBeInTheDocument();
    expect(screen.queryByText("Write API tests")).not.toBeInTheDocument();
  });

  it("clicking Priority column header shows sort indicator", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(
      <ListView
        cards={mockCards}
        categories={mockCategories}
        categoryMap={mockCategoryMap}
        onUpdate={onUpdate}
      />
    );

    const priorityHeader = screen.getByText(/priority/i);
    // Priority is already the default sort — clicking toggles direction
    await user.click(priorityHeader);

    // After clicking, the sort indicator should appear (↓ for desc)
    expect(screen.getByText(/priority/i).closest("th")).toHaveTextContent("↓");
  });
});
