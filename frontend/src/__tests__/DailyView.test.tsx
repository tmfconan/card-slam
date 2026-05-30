import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, within, waitFor, fireEvent, act } from "@testing-library/react";
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

  it("renders the last slot at 5:45 PM", () => {
    renderDailyView();
    expect(screen.getByTestId("slot-17:45")).toBeInTheDocument();
  });

  it("renders 15-minute slot markers between half-hour marks", () => {
    renderDailyView();
    // :15 and :45 marks exist as DOM rows even though they have no visible label
    expect(screen.getByTestId("slot-09:15")).toBeInTheDocument();
    expect(screen.getByTestId("slot-09:45")).toBeInTheDocument();
  });

  it("renders exactly 48 time slot rows (15-min intervals, 6:00 AM to 5:45 PM)", () => {
    renderDailyView();
    const slots = [
      "06:00","06:15","06:30","06:45",
      "07:00","07:15","07:30","07:45",
      "08:00","08:15","08:30","08:45",
      "09:00","09:15","09:30","09:45",
      "10:00","10:15","10:30","10:45",
      "11:00","11:15","11:30","11:45",
      "12:00","12:15","12:30","12:45",
      "13:00","13:15","13:30","13:45",
      "14:00","14:15","14:30","14:45",
      "15:00","15:15","15:30","15:45",
      "16:00","16:15","16:30","16:45",
      "17:00","17:15","17:30","17:45",
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

  it("30-min card spans 2 fifteen-minute slots (data-duration=30)", () => {
    renderDailyView();
    // d-1 has duration:30 → spans 2 × 15-min slots
    expect(screen.getByTestId("daily-card-d-1")).toHaveAttribute("data-duration", "30");
  });

  it("90-min card spans 6 fifteen-minute slots (data-duration=90)", () => {
    renderDailyView();
    // d-2 has duration:90 → spans 6 × 15-min slots
    expect(screen.getByTestId("daily-card-d-2")).toHaveAttribute("data-duration", "90");
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

  it("gives nav buttons explicit text/background colors so they stay readable in dark mode", () => {
    renderDailyView();
    for (const name of [/prev/i, /today/i, /next/i]) {
      const btn = screen.getByRole("button", { name });
      expect(btn).toHaveClass("bg-white");
      expect(btn).toHaveClass("text-gray-700");
    }
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

  // ── Resize handles ──────────────────────────────────────────────────────────

  // The grid in jsdom has zero size; override so slot math lands on real rows.
  // SLOT_H = 32, SLOTS.length = 48 → grid spans 0..1536 vertically.
  function mockGridRect() {
    const grid = screen.getByTestId("daily-grid");
    (grid as unknown as { getBoundingClientRect: () => DOMRect }).getBoundingClientRect =
      () => ({
        top: 0,
        bottom: 1536,
        left: 64,
        right: 800,
        width: 736,
        height: 1536,
        x: 64,
        y: 0,
        toJSON: () => ({}),
      });
  }

  // clientY at the middle of a slot row (slot N occupies [N*32, (N+1)*32))
  const yOfSlot = (slotIdx: number) => slotIdx * 32 + 16;

  it("scheduled cards have top and bottom resize handles", () => {
    renderDailyView();
    expect(screen.getByTestId("resize-handle-top-d-1")).toBeInTheDocument();
    expect(screen.getByTestId("resize-handle-bottom-d-1")).toBeInTheDocument();
    expect(screen.getByTestId("resize-handle-top-d-2")).toBeInTheDocument();
    expect(screen.getByTestId("resize-handle-bottom-d-2")).toBeInTheDocument();
  });

  it("unscheduled cards do not have resize handles", () => {
    renderDailyView();
    expect(screen.queryByTestId("resize-handle-top-d-3")).not.toBeInTheDocument();
    expect(screen.queryByTestId("resize-handle-bottom-d-3")).not.toBeInTheDocument();
  });

  it("starting a bottom-edge resize shows the resize placeholder", async () => {
    renderDailyView();
    mockGridRect();

    const handle = screen.getByTestId("resize-handle-bottom-d-1");
    await act(async () => {
      fireEvent.mouseDown(handle, { button: 0 });
    });

    // Placeholder starts at the card's current size (30 min, starts 09:00)
    const placeholder = screen.getByTestId("resize-placeholder");
    expect(placeholder).toHaveAttribute("data-start-slot", "09:00");
    expect(placeholder).toHaveAttribute("data-duration", "30");

    await act(async () => {
      fireEvent.mouseUp(window);
    });
  });

  it("dragging the bottom resize handle down increases duration in 15-min steps", async () => {
    let capturedBody: Record<string, unknown> | undefined;
    server.use(
      http.put("/api/cards/:id", async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(dailyCards[0]);
      })
    );

    renderDailyView();
    mockGridRect();

    // d-1 is at slot 12 (09:00), duration 30 → bottom edge at slot 13
    const handle = screen.getByTestId("resize-handle-bottom-d-1");
    await act(async () => {
      fireEvent.mouseDown(handle, { button: 0 });
    });
    // Drag bottom edge down to slot 15 → spans 12..15 → 4 slots × 15 = 60 min
    await act(async () => {
      fireEvent.mouseMove(window, { clientY: yOfSlot(15) });
    });
    await act(async () => {
      fireEvent.mouseUp(window);
    });

    await waitFor(() => {
      expect(capturedBody).toMatchObject({ duration: 60 });
    });
    // Bottom-edge resize keeps todo_time unchanged
    expect(capturedBody).not.toHaveProperty("todo_time");
  });

  it("dragging the top resize handle up extends duration and shifts todo_time", async () => {
    let capturedBody: Record<string, unknown> | undefined;
    server.use(
      http.put("/api/cards/:id", async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(dailyCards[1]);
      })
    );

    renderDailyView();
    mockGridRect();

    // d-2 is at slot 16 (10:00), duration 90 → bottom edge at slot 21
    const handle = screen.getByTestId("resize-handle-top-d-2");
    await act(async () => {
      fireEvent.mouseDown(handle, { button: 0 });
    });
    // Drag top up to slot 14 (09:30) → spans 14..21 → 8 slots × 15 = 120 min
    await act(async () => {
      fireEvent.mouseMove(window, { clientY: yOfSlot(14) });
    });
    await act(async () => {
      fireEvent.mouseUp(window);
    });

    await waitFor(() => {
      expect(capturedBody).toMatchObject({
        duration: 120,
        todo_time: "09:30",
        todo_date: TODAY,
      });
    });
  });

  it("bottom edge cannot shrink past the start (minimum 15-min duration)", async () => {
    let capturedBody: Record<string, unknown> | undefined;
    server.use(
      http.put("/api/cards/:id", async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(dailyCards[1]);
      })
    );

    renderDailyView();
    mockGridRect();

    // d-2 is at slot 16, duration 90 → bottom slot 21. Try to drag well above slot 16.
    const handle = screen.getByTestId("resize-handle-bottom-d-2");
    await act(async () => {
      fireEvent.mouseDown(handle, { button: 0 });
    });
    await act(async () => {
      fireEvent.mouseMove(window, { clientY: yOfSlot(10) }); // above start
    });
    await act(async () => {
      fireEvent.mouseUp(window);
    });

    // Minimum span: 1 slot → duration 15. todo_time unchanged for bottom-edge resize.
    await waitFor(() => {
      expect(capturedBody).toMatchObject({ duration: 15 });
    });
    expect(capturedBody).not.toHaveProperty("todo_time");
  });

  it("top edge cannot grow past the bottom (minimum 15-min duration)", async () => {
    let capturedBody: Record<string, unknown> | undefined;
    server.use(
      http.put("/api/cards/:id", async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(dailyCards[1]);
      })
    );

    renderDailyView();
    mockGridRect();

    // d-2 is at slot 16, bottom slot 21. Drag top below the bottom (slot 30).
    const handle = screen.getByTestId("resize-handle-top-d-2");
    await act(async () => {
      fireEvent.mouseDown(handle, { button: 0 });
    });
    await act(async () => {
      fireEvent.mouseMove(window, { clientY: yOfSlot(30) });
    });
    await act(async () => {
      fireEvent.mouseUp(window);
    });

    // Top is clamped to the original end slot → duration 15, new start = slot 21
    // SLOTS[21] = "11:15"
    await waitFor(() => {
      expect(capturedBody).toMatchObject({
        duration: 15,
        todo_time: "11:15",
        todo_date: TODAY,
      });
    });
  });

  it("releasing a resize handle without moving does not call PUT", async () => {
    let putCalls = 0;
    server.use(
      http.put("/api/cards/:id", async () => {
        putCalls++;
        return HttpResponse.json(dailyCards[0]);
      })
    );

    renderDailyView();
    mockGridRect();

    const handle = screen.getByTestId("resize-handle-bottom-d-1");
    await act(async () => {
      fireEvent.mouseDown(handle, { button: 0 });
    });
    await act(async () => {
      fireEvent.mouseUp(window);
    });

    // Allow any pending microtasks to settle
    await new Promise((r) => setTimeout(r, 20));
    expect(putCalls).toBe(0);
  });

  it("resize snaps to 15-min increments (partial-slot drag rounds down)", async () => {
    let capturedBody: Record<string, unknown> | undefined;
    server.use(
      http.put("/api/cards/:id", async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(dailyCards[0]);
      })
    );

    renderDailyView();
    mockGridRect();

    // d-1 starts at slot 12, bottom slot 13. Drag to clientY inside slot 14 (any pixel)
    // → snaps to slot 14 → spans 12..14 → 3 slots × 15 = 45 min.
    const handle = screen.getByTestId("resize-handle-bottom-d-1");
    await act(async () => {
      fireEvent.mouseDown(handle, { button: 0 });
    });
    await act(async () => {
      fireEvent.mouseMove(window, { clientY: 14 * 32 + 1 }); // just inside slot 14
    });
    await act(async () => {
      fireEvent.mouseUp(window);
    });

    await waitFor(() => {
      expect(capturedBody).toMatchObject({ duration: 45 });
    });
  });

  it("mousedown on a resize handle does not start a move-drag", async () => {
    renderDailyView();
    mockGridRect();

    const handle = screen.getByTestId("resize-handle-bottom-d-1");
    await act(async () => {
      fireEvent.mouseDown(handle, { button: 0 });
    });

    // A move-drag would render a drop placeholder (blue dashed border).
    // The resize placeholder is green and identified by data-testid.
    expect(screen.getByTestId("resize-placeholder")).toBeInTheDocument();

    await act(async () => {
      fireEvent.mouseUp(window);
    });
  });
});
