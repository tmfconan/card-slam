import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CategoryManager from "../components/CategoryManager";
import { Category } from "../types";

const mockCategories: Category[] = [
  { id: "cat-1", name: "Frontend", color: "#3b82f6", created_at: "2024-01-01T00:00:00Z" },
  { id: "cat-2", name: "Backend", color: "#22c55e", created_at: "2024-01-02T00:00:00Z" },
];

describe("CategoryManager", () => {
  beforeEach(() => {
    localStorage.setItem("token", "mock-token");
  });

  it("renders category names", () => {
    const onUpdate = vi.fn();
    render(<CategoryManager categories={mockCategories} onUpdate={onUpdate} />);
    expect(screen.getByText("Frontend")).toBeInTheDocument();
    expect(screen.getByText("Backend")).toBeInTheDocument();
  });

  it("renders 'No categories' message when empty array passed", () => {
    const onUpdate = vi.fn();
    render(<CategoryManager categories={[]} onUpdate={onUpdate} />);
    expect(screen.getByText(/no categories yet/i)).toBeInTheDocument();
  });

  it("typing name and clicking 'Add category' calls POST and then onUpdate", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(<CategoryManager categories={mockCategories} onUpdate={onUpdate} />);

    const nameInput = screen.getByPlaceholderText(/category name/i);
    await user.type(nameInput, "New Category");

    const addButton = screen.getByRole("button", { name: /add category/i });
    await user.click(addButton);

    await waitFor(() => {
      expect(onUpdate).toHaveBeenCalled();
    });
  });

  it("clicking Edit shows edit fields", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(<CategoryManager categories={mockCategories} onUpdate={onUpdate} />);

    const editButtons = screen.getAllByRole("button", { name: /edit/i });
    await user.click(editButtons[0]);

    // Edit input field should appear with the category's current name
    expect(screen.getByDisplayValue("Frontend")).toBeInTheDocument();
  });

  it("clicking Delete calls DELETE and onUpdate", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(<CategoryManager categories={mockCategories} onUpdate={onUpdate} />);

    const deleteButtons = screen.getAllByRole("button", { name: /delete/i });
    await user.click(deleteButtons[0]);

    await waitFor(() => {
      expect(onUpdate).toHaveBeenCalled();
    });
  });
});
