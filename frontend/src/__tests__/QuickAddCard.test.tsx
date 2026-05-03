import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockCategories } from "../test/handlers";
import QuickAddCard from "../components/QuickAddCard";

function renderQuickAdd(onCardCreated = vi.fn(), onClose = vi.fn()) {
  localStorage.setItem("token", "mock-token");
  return render(
    <QuickAddCard
      categories={mockCategories}
      onCardCreated={onCardCreated}
      onClose={onClose}
    />
  );
}

describe("QuickAddCard", () => {
  it("renders title, description, category and status inputs", () => {
    renderQuickAdd();
    expect(screen.getByPlaceholderText(/title/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/description/i)).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /category/i })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /status/i })).toBeInTheDocument();
  });

  it("lists all available categories in the dropdown", () => {
    renderQuickAdd();
    const catSelect = screen.getByRole("combobox", { name: /category/i });
    for (const cat of mockCategories) {
      expect(catSelect).toHaveTextContent(cat.name);
    }
  });

  it("disables the Create button when title is empty", () => {
    renderQuickAdd();
    expect(screen.getByRole("button", { name: /create card/i })).toBeDisabled();
  });

  it("enables the Create button once a title is typed", async () => {
    const user = userEvent.setup();
    renderQuickAdd();
    await user.type(screen.getByPlaceholderText(/title/i), "My new card");
    expect(screen.getByRole("button", { name: /create card/i })).not.toBeDisabled();
  });

  it("calls POST /api/cards/ with form data on submit", async () => {
    const user = userEvent.setup();
    const onCardCreated = vi.fn();
    renderQuickAdd(onCardCreated);

    await user.type(screen.getByPlaceholderText(/title/i), "New task");
    await user.type(screen.getByPlaceholderText(/description/i), "Details here");
    await user.selectOptions(
      screen.getByRole("combobox", { name: /category/i }),
      "cat-1"
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: /status/i }),
      "ready_to_do"
    );

    await user.click(screen.getByRole("button", { name: /create card/i }));

    await waitFor(() => expect(onCardCreated).toHaveBeenCalledTimes(1));
  });

  it("calls onClose when Cancel is clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderQuickAdd(vi.fn(), onClose);

    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("resets the form and calls onClose after successful creation", async () => {
    const user = userEvent.setup();
    const onCardCreated = vi.fn();
    const onClose = vi.fn();
    renderQuickAdd(onCardCreated, onClose);

    await user.type(screen.getByPlaceholderText(/title/i), "Task to create");
    await user.click(screen.getByRole("button", { name: /create card/i }));

    await waitFor(() => {
      expect(onCardCreated).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it("defaults status to brainstorm", () => {
    renderQuickAdd();
    const statusSelect = screen.getByRole("combobox", {
      name: /status/i,
    }) as HTMLSelectElement;
    expect(statusSelect.value).toBe("brainstorm");
  });
});
