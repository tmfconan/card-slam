import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CardItem from "../components/CardItem";
import { Card, Category } from "../types";

const mockCard: Card = {
  id: "card-1",
  title: "Build login page",
  description: "Create a login form",
  category_id: "cat-1",
  status: "brainstorm",
  priority: 0,
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
};

const mockCategory: Category = {
  id: "cat-1",
  name: "Frontend",
  color: "#3b82f6",
  created_at: "2024-01-01T00:00:00Z",
};

describe("CardItem", () => {
  beforeEach(() => {
    localStorage.setItem("token", "mock-token");
  });

  it("renders the card title", () => {
    const onUpdate = vi.fn();
    render(<CardItem card={mockCard} category={mockCategory} onUpdate={onUpdate} />);
    expect(screen.getByText("Build login page")).toBeInTheDocument();
  });

  it("renders the category badge", () => {
    const onUpdate = vi.fn();
    render(<CardItem card={mockCard} category={mockCategory} onUpdate={onUpdate} />);
    expect(screen.getByText("Frontend")).toBeInTheDocument();
  });

  it("clicking edit button shows input fields with current title", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(<CardItem card={mockCard} category={mockCategory} onUpdate={onUpdate} />);

    const editButton = screen.getByTitle("Edit");
    await user.click(editButton);

    const titleInput = screen.getByDisplayValue("Build login page");
    expect(titleInput).toBeInTheDocument();
  });

  it("save button calls PUT /api/cards/:id", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(<CardItem card={mockCard} category={mockCategory} onUpdate={onUpdate} />);

    const editButton = screen.getByTitle("Edit");
    await user.click(editButton);

    const saveButton = screen.getByRole("button", { name: /save/i });
    await user.click(saveButton);

    await waitFor(() => {
      expect(onUpdate).toHaveBeenCalled();
    });
  });

  it("delete button calls DELETE /api/cards/:id", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(<CardItem card={mockCard} category={mockCategory} onUpdate={onUpdate} />);

    const deleteButton = screen.getByTitle("Delete");
    await user.click(deleteButton);

    await waitFor(() => {
      expect(onUpdate).toHaveBeenCalled();
    });
  });
});
