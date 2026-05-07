import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../test/server";
import { mockCategories } from "../test/handlers";
import QuickAddCard from "../components/QuickAddCard";

function renderQuickAdd(
  onCardCreated = vi.fn(),
  onClose = vi.fn(),
  props: { defaultDate?: string; defaultTime?: string } = {}
) {
  localStorage.setItem("token", "mock-token");
  return render(
    <QuickAddCard
      categories={mockCategories}
      onCardCreated={onCardCreated}
      onClose={onClose}
      {...props}
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

  // ── New fields matching CardDetail ─────────────────────────────────────────

  it("renders date, time and duration fields", () => {
    renderQuickAdd();
    expect(screen.getByLabelText(/date/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/time/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/duration/i)).toBeInTheDocument();
  });

  it("duration field has a minimum of 15 minutes", () => {
    renderQuickAdd();
    const dur = screen.getByLabelText(/duration/i) as HTMLInputElement;
    expect(dur.min).toBe("15");
  });

  it("defaultDate prop pre-fills the date field", () => {
    renderQuickAdd(vi.fn(), vi.fn(), { defaultDate: "2026-05-10" });
    const dateInput = screen.getByLabelText(/date/i) as HTMLInputElement;
    expect(dateInput.value).toBe("2026-05-10");
  });

  it("defaultTime prop pre-fills the time field", () => {
    renderQuickAdd(vi.fn(), vi.fn(), { defaultTime: "08:00" });
    const timeInput = screen.getByLabelText(/time/i) as HTMLInputElement;
    expect(timeInput.value).toBe("08:00");
  });

  it("submission includes todo_date, todo_time, and duration in the payload", async () => {
    const user = userEvent.setup();
    let capturedBody: unknown;
    server.use(
      http.post("/api/cards/", async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json(
          { id: "new", title: "x", description: "", category_id: "", status: "brainstorm",
            priority: 0, duration: 30, created_at: "", updated_at: "" },
          { status: 201 }
        );
      })
    );

    renderQuickAdd(vi.fn(), vi.fn(), { defaultDate: "2026-05-10", defaultTime: "08:00" });
    await user.type(screen.getByPlaceholderText(/title/i), "Test");
    await user.click(screen.getByRole("button", { name: /create card/i }));

    await waitFor(() =>
      expect(capturedBody).toMatchObject({
        todo_date: "2026-05-10",
        todo_time: "08:00",
        duration: 30,
      })
    );
  });
});
