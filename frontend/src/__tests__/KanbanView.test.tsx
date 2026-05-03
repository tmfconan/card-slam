import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Card, Category } from "../types";

// Mock @hello-pangea/dnd before importing KanbanView
vi.mock("@hello-pangea/dnd", () => ({
  DragDropContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Droppable: ({
    children,
  }: {
    children: (
      provided: {
        innerRef: ReturnType<typeof vi.fn>;
        droppableProps: Record<string, unknown>;
        placeholder: null;
      },
      snapshot: { isDraggingOver: boolean }
    ) => React.ReactNode;
  }) =>
    children(
      {
        innerRef: vi.fn(),
        droppableProps: {},
        placeholder: null,
      },
      { isDraggingOver: false }
    ),
  Draggable: ({
    children,
  }: {
    children: (
      provided: {
        innerRef: ReturnType<typeof vi.fn>;
        draggableProps: Record<string, unknown>;
        dragHandleProps: Record<string, unknown>;
      },
      snapshot: { isDragging: boolean }
    ) => React.ReactNode;
  }) =>
    children(
      {
        innerRef: vi.fn(),
        draggableProps: {},
        dragHandleProps: {},
      },
      { isDragging: false }
    ),
}));

import KanbanView from "../components/KanbanView";

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
    priority: 0,
    created_at: "2024-01-02T00:00:00Z",
    updated_at: "2024-01-02T00:00:00Z",
  },
  {
    id: "card-3",
    title: "Write API tests",
    description: "Add pytest coverage",
    category_id: "cat-2",
    status: "done",
    priority: 0,
    created_at: "2024-01-03T00:00:00Z",
    updated_at: "2024-01-03T00:00:00Z",
  },
];

describe("KanbanView", () => {
  beforeEach(() => {
    localStorage.setItem("token", "mock-token");
  });

  it("all status column headers are visible", () => {
    const onUpdate = vi.fn();
    render(
      <KanbanView
        cards={mockCards}
        categories={mockCategories}
        categoryMap={mockCategoryMap}
        onUpdate={onUpdate}
      />
    );
    expect(screen.getByText("Brainstorm")).toBeInTheDocument();
    expect(screen.getByText("In Progress")).toBeInTheDocument();
    expect(screen.getByText("Done")).toBeInTheDocument();
    expect(screen.getByText("Intent to Do")).toBeInTheDocument();
    expect(screen.getByText("Ready to Do")).toBeInTheDocument();
    expect(screen.getByText("Needs Finishing")).toBeInTheDocument();
  });

  it("cards appear under the correct status column", () => {
    const onUpdate = vi.fn();
    render(
      <KanbanView
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

  it("clicking a category filter chip filters to only that category's cards", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(
      <KanbanView
        cards={mockCards}
        categories={mockCategories}
        categoryMap={mockCategoryMap}
        onUpdate={onUpdate}
      />
    );

    // Click the "Frontend" chip
    const frontendChip = screen.getByRole("button", { name: "Frontend" });
    await user.click(frontendChip);

    // Only cat-1 card should be visible
    expect(screen.getByText("Build login page")).toBeInTheDocument();
    expect(screen.queryByText("Set up database")).not.toBeInTheDocument();
    expect(screen.queryByText("Write API tests")).not.toBeInTheDocument();
  });

  it("clicking 'All' shows all cards again", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(
      <KanbanView
        cards={mockCards}
        categories={mockCategories}
        categoryMap={mockCategoryMap}
        onUpdate={onUpdate}
      />
    );

    // Filter to Frontend first
    const frontendChip = screen.getByRole("button", { name: "Frontend" });
    await user.click(frontendChip);
    expect(screen.queryByText("Set up database")).not.toBeInTheDocument();

    // Then click All
    const allChip = screen.getByRole("button", { name: "All" });
    await user.click(allChip);

    expect(screen.getByText("Build login page")).toBeInTheDocument();
    expect(screen.getByText("Set up database")).toBeInTheDocument();
    expect(screen.getByText("Write API tests")).toBeInTheDocument();
  });
});
