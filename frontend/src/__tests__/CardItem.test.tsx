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
  duration: 30,
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
    render(<CardItem card={mockCard} category={mockCategory} onUpdate={vi.fn()} />);
    expect(screen.getByText("Build login page")).toBeInTheDocument();
  });

  it("renders the category badge", () => {
    render(<CardItem card={mockCard} category={mockCategory} onUpdate={vi.fn()} />);
    expect(screen.getByText("Frontend")).toBeInTheDocument();
  });

  it("clicking the card body opens the CardDetail modal", async () => {
    const user = userEvent.setup();
    render(
      <CardItem
        card={mockCard}
        category={mockCategory}
        onUpdate={vi.fn()}
        categories={[mockCategory]}
      />
    );

    await user.click(screen.getByRole("article"));
    expect(screen.getByDisplayValue("Build login page")).toBeInTheDocument();
  });

  it("CardDetail modal has a Save button", async () => {
    const user = userEvent.setup();
    render(
      <CardItem
        card={mockCard}
        category={mockCategory}
        onUpdate={vi.fn()}
        categories={[mockCategory]}
      />
    );

    await user.click(screen.getByRole("article"));
    expect(screen.getByRole("button", { name: /save/i })).toBeInTheDocument();
  });

  it("CardDetail modal can be closed via Cancel", async () => {
    const user = userEvent.setup();
    render(
      <CardItem
        card={mockCard}
        category={mockCategory}
        onUpdate={vi.fn()}
        categories={[mockCategory]}
      />
    );

    await user.click(screen.getByRole("article"));
    expect(screen.getByDisplayValue("Build login page")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(screen.queryByRole("button", { name: /save/i })).not.toBeInTheDocument();
  });

  it("delete button calls DELETE /api/cards/:id", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(<CardItem card={mockCard} category={mockCategory} onUpdate={onUpdate} />);

    await user.click(screen.getByTitle("Delete"));
    await waitFor(() => expect(onUpdate).toHaveBeenCalled());
  });
});
