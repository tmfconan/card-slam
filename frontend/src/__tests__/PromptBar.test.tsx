import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PromptBar from "../components/PromptBar";
import { Category } from "../types";

const mockCategories: Category[] = [
  { id: "cat-1", name: "Frontend", color: "#3b82f6", created_at: "2024-01-01T00:00:00Z" },
  { id: "cat-2", name: "Backend", color: "#22c55e", created_at: "2024-01-02T00:00:00Z" },
];

describe("PromptBar", () => {
  beforeEach(() => {
    localStorage.setItem("token", "mock-token");
  });

  it("submit button is disabled when no category selected", () => {
    const onCardsCreated = vi.fn();
    render(<PromptBar categories={mockCategories} onCardsCreated={onCardsCreated} />);

    const promptInput = screen.getByPlaceholderText(/describe work/i);
    // Type a prompt but leave category empty
    userEvent.type(promptInput, "Some work description");

    const submitButton = screen.getByRole("button", { name: /break it down/i });
    expect(submitButton).toBeDisabled();
  });

  it("submit button is disabled when prompt is empty", async () => {
    const user = userEvent.setup();
    const onCardsCreated = vi.fn();
    render(<PromptBar categories={mockCategories} onCardsCreated={onCardsCreated} />);

    // Select a category but leave prompt empty
    const select = screen.getByRole("combobox");
    await user.selectOptions(select, "cat-1");

    const submitButton = screen.getByRole("button", { name: /break it down/i });
    expect(submitButton).toBeDisabled();
  });

  it("filling prompt + selecting category + clicking submit calls POST /api/ai/parse", async () => {
    const user = userEvent.setup();
    const onCardsCreated = vi.fn();
    render(<PromptBar categories={mockCategories} onCardsCreated={onCardsCreated} />);

    const select = screen.getByRole("combobox");
    await user.selectOptions(select, "cat-1");

    const promptInput = screen.getByPlaceholderText(/describe work/i);
    await user.type(promptInput, "Build a login page");

    const submitButton = screen.getByRole("button", { name: /break it down/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.queryByText(/parsing/i)).not.toBeInTheDocument();
    });
  });

  it("after successful parse, WorkItemConfirm dialog appears with returned items", async () => {
    const user = userEvent.setup();
    const onCardsCreated = vi.fn();
    render(<PromptBar categories={mockCategories} onCardsCreated={onCardsCreated} />);

    const select = screen.getByRole("combobox");
    await user.selectOptions(select, "cat-1");

    const promptInput = screen.getByPlaceholderText(/describe work/i);
    await user.type(promptInput, "Build a login page");

    const submitButton = screen.getByRole("button", { name: /break it down/i });
    await user.click(submitButton);

    // WorkItemConfirm dialog renders items as input values
    await waitFor(() => {
      expect(screen.getByDisplayValue("First work item")).toBeInTheDocument();
      expect(screen.getByDisplayValue("Second work item")).toBeInTheDocument();
    });

    // WorkItemConfirm dialog header
    expect(screen.getByText(/review work items/i)).toBeInTheDocument();
  });
});
