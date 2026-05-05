import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../test/server";
import { mockCategories } from "../test/handlers";
import { Card, Category } from "../types";
import DailyView from "../components/DailyView";

const TODAY = "2026-05-05";

const categoryMap: Record<string, Category> = {
  "cat-1": mockCategories[0],
  "cat-2": mockCategories[1],
};

const dailyCards: Card[] = [
  {
    id: "d-1",
    title: "Morning standup",
    description: "Team sync",
    category_id: "cat-1",
    status: "in_progress",
    priority: 0,
    duration: 30,
    todo_date: TODAY,
    todo_time: "09:00",
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  },
  {
    id: "d-2",
    title: "Deep work session",
    description: "Focus time",
    category_id: "cat-2",
    status: "ready_to_do",
    priority: 1,
    duration: 90,
    todo_date: TODAY,
    todo_time: "10:00",
    created_at: "2024-01-02T00:00:00Z",
    updated_at: "2024-01-02T00:00:00Z",
  },
  {
    id: "d-3",
    title: "Unscheduled task",
    description: "No time set",
    category_id: "cat-1",
    status: "intent_to_do",
    priority: 2,
    duration: 30,
    todo_date: TODAY,
    created_at: "2024-01-03T00:00:00Z",
    updated_at: "2024-01-03T00:00:00Z",
  },
  {
    id: "d-4",
    title: "Other day task",
    description: "Different date",
    category_id: "cat-1",
    status: "ready_to_do",
    priority: 3,
    duration: 30,
    todo_date: "2026-05-10",
    todo_time: "09:00",
    created_at: "2024-01-04T00:00:00Z",
    updated_at: "2024-01-04T00:00:00Z",
  },
];

function renderDailyView(date = TODAY) {
  localStorage.setItem("token", "mock-token");
  return render(
    <DailyView
      cards={dailyCards}
      categories={mockCategories}
      categoryMap={categoryMap}
      selectedDate={date}
      onDateChange={vi.fn()}
      onUpdate={vi.fn()}
    />
  );
}

describe("DailyView", () => {
  beforeEach(() => {
    server.use(http.get("/api/cards/", () => HttpResponse.json(dailyCards)));
  });

  // ── Slot rendering ──────────────────────────────────────────────────────────

  it("renders the first slot at 6:00 AM", () => {
    renderDailyView();
    expect(screen.getByText("6:00 AM")).toBeInTheDocument();
  });

  it("renders the last slot at 5:30 PM", () => {
    renderDailyView();
    expect(screen.getByText("5:30 PM")).toBeInTheDocument();
  });

  it("renders exactly 24 time slot rows (6:00 AM to 5:30 PM)", () => {
    renderDailyView();
    const slots = [
      "06:00","06:30","07:00","07:30","08:00","08:30",
      "09:00","09:30","10:00","10:30","11:00","11:30",
      "12:00","12:30","13:00","13:30","14:00","14:30",
      "15:00","15:30","16:00","16:30","17:00","17:30",
    ];
    for (const s of slots) {
      expect(screen.getByTestId(`slot-${s}`)).toBeInTheDocument();
    }
  });

  // ── Card placement (data-slot attribute) ────────────────────────────────────

  it("places card d-1 (09:00) via data-slot attribute", () => {
    renderDailyView();
    expect(screen.getByTestId("daily-card-d-1")).toHaveAttribute(
      "data-slot",
      "09:00"
    );
  });

  it("places card d-2 (10:00, 90 min) via data-slot attribute", () => {
    renderDailyView();
    expect(screen.getByTestId("daily-card-d-2")).toHaveAttribute(
      "data-slot",
      "10:00"
    );
  });

  it("card d-1 title is visible in the grid", () => {
    renderDailyView();
    expect(screen.getByText("Morning standup")).toBeInTheDocument();
  });

  it("card d-2 has data-duration of 90", () => {
    renderDailyView();
    expect(screen.getByTestId("daily-card-d-2")).toHaveAttribute(
      "data-duration",
      "90"
    );
  });

  it("shows cards for the selected date only — d-4 (different date) is absent", () => {
    renderDailyView();
    expect(screen.queryByText("Other day task")).not.toBeInTheDocument();
  });

  it("shows cards without todo_time in the Unscheduled section", () => {
    renderDailyView();
    const unscheduled = screen.getByTestId("daily-unscheduled");
    expect(within(unscheduled).getByText("Unscheduled task")).toBeInTheDocument();
  });

  // ── Date navigation ─────────────────────────────────────────────────────────

  it("renders Prev, Today, and Next navigation buttons", () => {
    renderDailyView();
    expect(screen.getByRole("button", { name: /prev/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /today/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /next/i })).toBeInTheDocument();
  });

  it("calls onDateChange with the previous day when Prev is clicked", async () => {
    const user = userEvent.setup();
    const onDateChange = vi.fn();
    localStorage.setItem("token", "mock-token");
    render(
      <DailyView
        cards={dailyCards}
        categories={mockCategories}
        categoryMap={categoryMap}
        selectedDate={TODAY}
        onDateChange={onDateChange}
        onUpdate={vi.fn()}
      />
    );
    await user.click(screen.getByRole("button", { name: /prev/i }));
    expect(onDateChange).toHaveBeenCalledWith("2026-05-04");
  });

  it("calls onDateChange with the next day when Next is clicked", async () => {
    const user = userEvent.setup();
    const onDateChange = vi.fn();
    localStorage.setItem("token", "mock-token");
    render(
      <DailyView
        cards={dailyCards}
        categories={mockCategories}
        categoryMap={categoryMap}
        selectedDate={TODAY}
        onDateChange={onDateChange}
        onUpdate={vi.fn()}
      />
    );
    await user.click(screen.getByRole("button", { name: /next/i }));
    expect(onDateChange).toHaveBeenCalledWith("2026-05-06");
  });

  it("shows the selected date in the header", () => {
    renderDailyView();
    expect(screen.getByTestId("daily-date-header")).toBeInTheDocument();
  });

  // ── Batch status ────────────────────────────────────────────────────────────

  it("each card in the daily view has a checkbox", () => {
    renderDailyView();
    // d-1, d-2 (scheduled) + d-3 (unscheduled) = 3 cards for today
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes.length).toBeGreaterThanOrEqual(3);
  });

  it("selecting a card shows the batch status bar", async () => {
    const user = userEvent.setup();
    renderDailyView();
    const checkboxes = screen.getAllByRole("checkbox");
    await user.click(checkboxes[0]);
    expect(screen.getByTestId("batch-status-bar")).toBeInTheDocument();
  });

  it("batch status bar shows count of selected cards", async () => {
    const user = userEvent.setup();
    renderDailyView();
    const checkboxes = screen.getAllByRole("checkbox");
    await user.click(checkboxes[0]);
    await user.click(checkboxes[1]);
    expect(screen.getByText(/2 selected/i)).toBeInTheDocument();
  });

  it("applying batch status calls POST /api/cards/batch-status", async () => {
    const user = userEvent.setup();
    let capturedBody: unknown;
    server.use(
      http.post("/api/cards/batch-status", async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({ updated: 1 });
      })
    );

    const onUpdate = vi.fn();
    localStorage.setItem("token", "mock-token");
    render(
      <DailyView
        cards={dailyCards}
        categories={mockCategories}
        categoryMap={categoryMap}
        selectedDate={TODAY}
        onDateChange={vi.fn()}
        onUpdate={onUpdate}
      />
    );

    const checkboxes = screen.getAllByRole("checkbox");
    await user.click(checkboxes[0]);

    const bar = screen.getByTestId("batch-status-bar");
    await user.selectOptions(within(bar).getByRole("combobox"), "done");
    await user.click(within(bar).getByRole("button", { name: /apply/i }));

    await waitFor(() => {
      expect(capturedBody).toMatchObject({ status: "done" });
      expect(onUpdate).toHaveBeenCalled();
    });
  });

  // ── × button: unschedule, not delete ───────────────────────────────────────

  it("× button on a scheduled card calls PUT with todo_time null", async () => {
    const user = userEvent.setup();
    let capturedBody: unknown;
    server.use(
      http.put("/api/cards/:id", async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json(dailyCards[0]);
      })
    );

    renderDailyView();

    // The delete (×) button title is "Delete"
    const deleteButtons = screen.getAllByTitle("Delete");
    await user.click(deleteButtons[0]);

    await waitFor(() => {
      expect(capturedBody).toMatchObject({ todo_time: null });
    });
  });

  it("× button does NOT call DELETE /api/cards/:id", async () => {
    const user = userEvent.setup();
    let deleteCalled = false;
    server.use(
      http.delete("/api/cards/:id", () => {
        deleteCalled = true;
        return new HttpResponse(null, { status: 204 });
      })
    );

    renderDailyView();
    const deleteButtons = screen.getAllByTitle("Delete");
    await user.click(deleteButtons[0]);

    // Give time for any async operations
    await new Promise((r) => setTimeout(r, 50));
    expect(deleteCalled).toBe(false);
  });

  // ── Multiple cards per slot ─────────────────────────────────────────────────

  it("shows two cards at the same time slot", () => {
    const parallel: Card = {
      id: "d-parallel",
      title: "Parallel meeting",
      description: "Same slot as morning standup",
      category_id: "cat-2",
      status: "in_progress",
      priority: 5,
      duration: 30,
      todo_date: TODAY,
      todo_time: "09:00",
      created_at: "2024-01-05T00:00:00Z",
      updated_at: "2024-01-05T00:00:00Z",
    };

    localStorage.setItem("token", "mock-token");
    render(
      <DailyView
        cards={[...dailyCards, parallel]}
        categories={mockCategories}
        categoryMap={categoryMap}
        selectedDate={TODAY}
        onDateChange={vi.fn()}
        onUpdate={vi.fn()}
      />
    );

    expect(screen.getByText("Morning standup")).toBeInTheDocument();
    expect(screen.getByText("Parallel meeting")).toBeInTheDocument();

    expect(screen.getByTestId("daily-card-d-1")).toHaveAttribute("data-slot", "09:00");
    expect(screen.getByTestId("daily-card-d-parallel")).toHaveAttribute("data-slot", "09:00");
  });

  it("cards in the same slot each get their own data-testid", () => {
    const c2: Card = {
      id: "d-c2",
      title: "Second 09:00 card",
      description: "",
      category_id: "cat-1",
      status: "ready_to_do",
      priority: 6,
      duration: 60,
      todo_date: TODAY,
      todo_time: "09:00",
      created_at: "2024-01-06T00:00:00Z",
      updated_at: "2024-01-06T00:00:00Z",
    };

    localStorage.setItem("token", "mock-token");
    render(
      <DailyView
        cards={[...dailyCards, c2]}
        categories={mockCategories}
        categoryMap={categoryMap}
        selectedDate={TODAY}
        onDateChange={vi.fn()}
        onUpdate={vi.fn()}
      />
    );

    expect(screen.getByTestId("daily-card-d-1")).toBeInTheDocument();
    expect(screen.getByTestId("daily-card-d-c2")).toBeInTheDocument();
  });

  // ── Mobile bottom sheet ─────────────────────────────────────────────────────

  it("renders an unscheduled bottom-sheet trigger button", () => {
    renderDailyView();
    expect(screen.getByTestId("unscheduled-sheet-trigger")).toBeInTheDocument();
  });

  it("trigger shows the count of unscheduled cards", () => {
    renderDailyView();
    // d-3 is the only unscheduled card for TODAY
    expect(screen.getByTestId("unscheduled-sheet-trigger")).toHaveTextContent("1");
  });

  it("clicking the trigger opens the bottom sheet", async () => {
    const user = userEvent.setup();
    renderDailyView();
    expect(screen.queryByTestId("unscheduled-sheet")).not.toBeInTheDocument();
    await user.click(screen.getByTestId("unscheduled-sheet-trigger"));
    expect(screen.getByTestId("unscheduled-sheet")).toBeInTheDocument();
  });

  it("bottom sheet displays the unscheduled cards", async () => {
    const user = userEvent.setup();
    renderDailyView();
    await user.click(screen.getByTestId("unscheduled-sheet-trigger"));
    expect(
      within(screen.getByTestId("unscheduled-sheet")).getByText("Unscheduled task")
    ).toBeInTheDocument();
  });

  it("clicking the overlay closes the bottom sheet", async () => {
    const user = userEvent.setup();
    renderDailyView();
    await user.click(screen.getByTestId("unscheduled-sheet-trigger"));
    expect(screen.getByTestId("unscheduled-sheet")).toBeInTheDocument();
    await user.click(screen.getByTestId("unscheduled-sheet-overlay"));
    expect(screen.queryByTestId("unscheduled-sheet")).not.toBeInTheDocument();
  });

  it("close button inside the sheet closes it", async () => {
    const user = userEvent.setup();
    renderDailyView();
    await user.click(screen.getByTestId("unscheduled-sheet-trigger"));
    await user.click(screen.getByRole("button", { name: /close sheet/i }));
    expect(screen.queryByTestId("unscheduled-sheet")).not.toBeInTheDocument();
  });

  // ── Touch drag handles ──────────────────────────────────────────────────────

  it("each scheduled card has a touch drag handle", () => {
    renderDailyView();
    // d-1 and d-2 are scheduled for TODAY
    expect(screen.getByTestId("drag-handle-d-1")).toBeInTheDocument();
    expect(screen.getByTestId("drag-handle-d-2")).toBeInTheDocument();
  });

  it("unscheduled cards in the sheet also have drag handles", async () => {
    const user = userEvent.setup();
    renderDailyView();
    await user.click(screen.getByTestId("unscheduled-sheet-trigger"));
    expect(
      within(screen.getByTestId("unscheduled-sheet")).getByTestId("drag-handle-d-3")
    ).toBeInTheDocument();
  });
});
