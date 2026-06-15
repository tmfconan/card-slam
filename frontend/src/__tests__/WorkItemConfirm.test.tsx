import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import WorkItemConfirm from "../components/WorkItemConfirm";
import { WorkItem, Category } from "../types";

const mockItems: WorkItem[] = [
  { title: "First work item", description: "Description for first item" },
  { title: "Second work item", description: "Description for second item" },
];

const mockCategories: Category[] = [
  { id: "cat-1", name: "Frontend", color: "#3b82f6", created_at: "2024-01-01T00:00:00Z" },
];

describe("WorkItemConfirm", () => {
  beforeEach(() => {
    localStorage.setItem("token", "mock-token");
  });

  it("renders both item titles", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <WorkItemConfirm
        items={mockItems}
        categoryId="cat-1"
        categories={mockCategories}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );
    expect(screen.getByDisplayValue("First work item")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Second work item")).toBeInTheDocument();
  });

  it("clicking × on an item removes it", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <WorkItemConfirm
        items={mockItems}
        categoryId="cat-1"
        categories={mockCategories}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

    const removeButtons = screen.getAllByText("×");
    await user.click(removeButtons[0]);

    expect(screen.queryByDisplayValue("First work item")).not.toBeInTheDocument();
    expect(screen.getByDisplayValue("Second work item")).toBeInTheDocument();
  });

  it("clicking Cancel calls onCancel", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <WorkItemConfirm
        items={mockItems}
        categoryId="cat-1"
        categories={mockCategories}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

    const cancelButton = screen.getByRole("button", { name: /cancel/i });
    await user.click(cancelButton);
    expect(onCancel).toHaveBeenCalled();
  });

  it("clicking Create cards calls POST /api/cards/batch then onConfirm", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <WorkItemConfirm
        items={mockItems}
        categoryId="cat-1"
        categories={mockCategories}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

    const createButton = screen.getByRole("button", { name: /create 2 cards/i });
    await user.click(createButton);

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalled();
    });
  });

  it("title input and description textarea use a transparent background so they stay readable in dark mode", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <WorkItemConfirm
        items={mockItems}
        categoryId="cat-1"
        categories={mockCategories}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

    // Each suggested card must inherit the dark modal background rather than
    // the browser's default white field background (which made light text
    // unreadable in dark mode).
    const titleInput = screen.getByDisplayValue("First work item");
    expect(titleInput).toHaveClass("bg-transparent");
    expect(titleInput).toHaveClass("dark:text-gray-100");

    const descTextarea = screen.getByDisplayValue("Description for first item");
    expect(descTextarea).toHaveClass("bg-transparent");
    expect(descTextarea).toHaveClass("dark:text-gray-300");
  });

  it("can change item title via input", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <WorkItemConfirm
        items={mockItems}
        categoryId="cat-1"
        categories={mockCategories}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

    const firstTitleInput = screen.getByDisplayValue("First work item");
    await user.clear(firstTitleInput);
    await user.type(firstTitleInput, "Updated title");

    expect(screen.getByDisplayValue("Updated title")).toBeInTheDocument();
  });
});
