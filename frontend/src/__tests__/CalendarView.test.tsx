import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, within, waitFor, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../test/server";
import { mockCategories } from "../test/handlers";
import { Card, Category } from "../types";
import CalendarView from "../components/CalendarView";

// Helper: YYYY-MM-DD string N days from today
function dateStr(daysFromToday: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + daysFromToday);
  return d.toISOString().split("T")[0];
}

const categoryMap: Record<string, Category> = {
  "cat-1": mockCategories[0],
  "cat-2": mockCategories[1],
};

// Cards used across calendar tests
const calendarCards: Card[] = [
  {
    id: "cal-1",
    title: "Ready card today",
    description: "Scheduled for today",
    category_id: "cat-1",
    status: "ready_to_do",
    priority: 0,
    duration: 30,
    todo_date: dateStr(0),
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  },
  {
    id: "cal-2",
    title: "In progress card day 5",
    description: "Scheduled 5 days out",
    category_id: "cat-2",
    status: "in_progress",
    priority: 1,
    duration: 30,
    todo_date: dateStr(5),
    created_at: "2024-01-02T00:00:00Z",
    updated_at: "2024-01-02T00:00:00Z",
  },
  {
    id: "cal-3",
    title: "Brainstorm card",
    description: "Excluded by default",
    category_id: "cat-1",
    status: "brainstorm",
    priority: 2,
    duration: 30,
    todo_date: dateStr(1),
    created_at: "2024-01-03T00:00:00Z",
    updated_at: "2024-01-03T00:00:00Z",
  },
  {
    id: "cal-4",
    title: "Done card",
    description: "Also excluded by default",
    category_id: "cat-2",
    status: "done",
    priority: 3,
    duration: 30,
    todo_date: dateStr(2),
    created_at: "2024-01-04T00:00:00Z",
    updated_at: "2024-01-04T00:00:00Z",
  },
  {
    id: "cal-5",
    title: "Unscheduled card",
    description: "No date set",
    category_id: "cat-1",
    status: "intent_to_do",
    priority: 4,
    duration: 30,
    created_at: "2024-01-05T00:00:00Z",
    updated_at: "2024-01-05T00:00:00Z",
  },
];

function renderCalendar(cards = calendarCards) {
  localStorage.setItem("token", "mock-token");
  return render(
    <CalendarView
      cards={cards}
      categories={mockCategories}
      categoryMap={categoryMap}
      onUpdate={vi.fn()}
    />
  );
}

describe("CalendarView (week schedule grid)", () => {
  beforeEach(() => {
    server.use(http.get("/api/cards/", () => HttpResponse.json(calendarCards)));
  });

  it("renders yesterday + 14 day columns plus a no-date Unscheduled tray", () => {
    renderCalendar();
    // No-date tray for cards with no scheduled date
    expect(screen.getByTestId("week-nodate")).toBeInTheDocument();
    // Yesterday column is included to help manage completed cards
    expect(screen.getByTestId(`week-day-${dateStr(-1)}`)).toBeInTheDocument();
    // Each of the 14 day columns (today + next 13) should be in the DOM
    for (let i = 0; i < 14; i++) {
      expect(screen.getByTestId(`week-day-${dateStr(i)}`)).toBeInTheDocument();
    }
  });

  it("renders time-of-day slot labels like the daily view", () => {
    renderCalendar();
    // The shared time axis shows hour/half-hour labels
    expect(screen.getByText("6:00 AM")).toBeInTheDocument();
    expect(screen.getByText("5:00 PM")).toBeInTheDocument();
  });

  it("shows cards with todo_date of yesterday in the yesterday column", () => {
    const yesterdayCard: Card = {
      id: "cal-yesterday",
      title: "Completed yesterday",
      description: "Card from yesterday",
      category_id: "cat-1",
      status: "ready_to_do",
      priority: 0,
      duration: 30,
      todo_date: dateStr(-1),
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
    };
    renderCalendar([...calendarCards, yesterdayCard]);
    const yesterdayCol = screen.getByTestId(`week-day-${dateStr(-1)}`);
    expect(within(yesterdayCol).getByText("Completed yesterday")).toBeInTheDocument();
  });

  it("shows undated cards (date, no time) in that day's unscheduled tray", () => {
    renderCalendar();
    // cal-1 is dated today but has no time → today's unscheduled tray
    const todayTray = screen.getByTestId(`week-unscheduled-${dateStr(0)}`);
    expect(within(todayTray).getByText("Ready card today")).toBeInTheDocument();

    // cal-2 is dated day 5
    const day5Tray = screen.getByTestId(`week-unscheduled-${dateStr(5)}`);
    expect(within(day5Tray).getByText("In progress card day 5")).toBeInTheDocument();
  });

  it("places a timed card in the day's time grid with slot + duration data", () => {
    const timed: Card = {
      id: "timed-1",
      title: "Morning meeting",
      description: "",
      category_id: "cat-1",
      status: "in_progress",
      priority: 0,
      duration: 60,
      todo_date: dateStr(0),
      todo_time: "09:00",
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
    };
    renderCalendar([...calendarCards, timed]);
    const card = screen.getByTestId("week-card-timed-1");
    expect(card).toHaveAttribute("data-slot", "09:00");
    expect(card).toHaveAttribute("data-duration", "60");
    expect(card).toHaveAttribute("data-date", dateStr(0));
    // It sits inside the day's time grid, not the unscheduled tray
    const grid = screen.getByTestId(`week-grid-${dateStr(0)}`);
    expect(within(grid).getByTestId("week-card-timed-1")).toBeInTheDocument();
  });

  it("shows cards without todo_date in the no-date Unscheduled tray", () => {
    renderCalendar();
    const noDate = screen.getByTestId("week-nodate");
    expect(within(noDate).getByText("Unscheduled card")).toBeInTheDocument();
  });

  it("hides brainstorm cards by default", () => {
    renderCalendar();
    expect(screen.queryByText("Brainstorm card")).not.toBeInTheDocument();
  });

  it("hides done cards by default", () => {
    renderCalendar();
    expect(screen.queryByText("Done card")).not.toBeInTheDocument();
  });

  it("shows brainstorm cards when brainstorm status filter is toggled on", async () => {
    const user = userEvent.setup();
    renderCalendar();
    const brainstormToggle = screen.getByRole("checkbox", { name: /brainstorm/i });
    await user.click(brainstormToggle);
    expect(screen.getByText("Brainstorm card")).toBeInTheDocument();
  });

  it("shows done cards when done status filter is toggled on", async () => {
    const user = userEvent.setup();
    renderCalendar();
    const doneToggle = screen.getByRole("checkbox", { name: /done/i });
    await user.click(doneToggle);
    expect(screen.getByText("Done card")).toBeInTheDocument();
  });

  it("filters by category — hides cards from other categories", async () => {
    const user = userEvent.setup();
    renderCalendar();
    const catFilter = screen.getByRole("combobox", { name: /category/i });
    await user.selectOptions(catFilter, "cat-1");
    expect(screen.getByText("Ready card today")).toBeInTheDocument();
    expect(screen.queryByText("In progress card day 5")).not.toBeInTheDocument();
  });

  it("cards scheduled outside the visible window are hidden, not shown as unscheduled", () => {
    const futureCard: Card = {
      id: "future-1",
      title: "Far future card",
      description: "Scheduled 60 days out",
      category_id: "cat-1",
      status: "ready_to_do",
      priority: 0,
      duration: 30,
      todo_date: dateStr(60), // outside the visible window
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
    };
    renderCalendar([...calendarCards, futureCard]);
    expect(screen.queryByText("Far future card")).not.toBeInTheDocument();
    expect(screen.getByTestId("week-nodate")).not.toHaveTextContent("Far future card");
  });

  // ── Drag-to-schedule ─────────────────────────────────────────────────────────

  // jsdom gives zero-size rects; override the target day's grid so slot math lands.
  function mockGridRect(date: string) {
    const grid = screen.getByTestId(`week-grid-${date}`);
    (grid as unknown as { getBoundingClientRect: () => DOMRect }).getBoundingClientRect =
      () => ({
        top: 0,
        bottom: 1536,
        left: 0,
        right: 200,
        width: 200,
        height: 1536,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      });
  }
  const yOfSlot = (slotIdx: number) => slotIdx * 32 + 16;

  it("dragging an unscheduled card onto a time slot schedules it (PUT date + time)", async () => {
    let capturedBody: Record<string, unknown> | undefined;
    server.use(
      http.put("/api/cards/:id", async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(calendarCards[0]);
      })
    );

    const onUpdate = vi.fn();
    localStorage.setItem("token", "mock-token");
    render(
      <CalendarView
        cards={calendarCards}
        categories={mockCategories}
        categoryMap={categoryMap}
        onUpdate={onUpdate}
      />
    );

    mockGridRect(dateStr(0));

    // cal-1 lives in today's unscheduled tray. Pick it up and drop on slot 09:00 (idx 12).
    const card = screen.getByTestId("week-card-cal-1");
    await act(async () => {
      fireEvent.mouseDown(card, { button: 0 });
    });
    await act(async () => {
      fireEvent.mouseMove(window, { clientX: 50, clientY: yOfSlot(12) });
    });
    await act(async () => {
      fireEvent.mouseUp(window);
    });

    await waitFor(() => {
      expect(capturedBody).toMatchObject({ todo_date: dateStr(0), todo_time: "09:00" });
      expect(onUpdate).toHaveBeenCalled();
    });
  });

  it("dragging the bottom resize handle lengthens a timed card's duration", async () => {
    let capturedBody: Record<string, unknown> | undefined;
    server.use(
      http.put("/api/cards/:id", async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(calendarCards[0]);
      })
    );

    const timed: Card = {
      id: "timed-1",
      title: "Morning meeting",
      description: "",
      category_id: "cat-1",
      status: "in_progress",
      priority: 0,
      duration: 30,
      todo_date: dateStr(0),
      todo_time: "09:00",
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
    };

    localStorage.setItem("token", "mock-token");
    render(
      <CalendarView
        cards={[...calendarCards, timed]}
        categories={mockCategories}
        categoryMap={categoryMap}
        onUpdate={vi.fn()}
      />
    );

    mockGridRect(dateStr(0));

    // timed-1 at slot 12 (09:00), 30 min → bottom edge at slot 13.
    const handle = screen.getByTestId("resize-handle-bottom-timed-1");
    await act(async () => {
      fireEvent.mouseDown(handle, { button: 0 });
    });
    // Drag down to slot 15 → spans 12..15 → 4 slots × 15 = 60 min
    await act(async () => {
      fireEvent.mouseMove(window, { clientY: yOfSlot(15) });
    });
    await act(async () => {
      fireEvent.mouseUp(window);
    });

    await waitFor(() => {
      expect(capturedBody).toMatchObject({ duration: 60 });
    });
    // Bottom-edge resize keeps the start time unchanged
    expect(capturedBody).not.toHaveProperty("todo_time");
  });

  // ── Day view active callback ───────────────────────────────────────────────

  it("calls onDayViewActive with selected date when Day button is clicked", async () => {
    const user = userEvent.setup();
    const onDayViewActive = vi.fn();
    localStorage.setItem("token", "mock-token");
    render(
      <CalendarView
        cards={calendarCards}
        categories={mockCategories}
        categoryMap={categoryMap}
        onUpdate={vi.fn()}
        onDayViewActive={onDayViewActive}
      />
    );

    await user.click(screen.getByRole("button", { name: /^day$/i }));
    expect(onDayViewActive).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
  });

  it("calls onDayViewActive with null when returning to week view", async () => {
    const user = userEvent.setup();
    const onDayViewActive = vi.fn();
    localStorage.setItem("token", "mock-token");
    render(
      <CalendarView
        cards={calendarCards}
        categories={mockCategories}
        categoryMap={categoryMap}
        onUpdate={vi.fn()}
        onDayViewActive={onDayViewActive}
      />
    );

    await user.click(screen.getByRole("button", { name: /^day$/i }));
    await user.click(screen.getByRole("button", { name: /week view/i }));
    expect(onDayViewActive).toHaveBeenLastCalledWith(null);
  });

  // ── Weekly Plan Assist ─────────────────────────────────────────────────────

  it("clicking Suggest plan opens the plan review modal", async () => {
    const user = userEvent.setup();
    server.use(
      http.post("/api/ai/suggest-plan", () =>
        HttpResponse.json({
          items: [
            {
              card_id: "cal-5",
              title: "Unscheduled card",
              todo_date: dateStr(1),
              todo_time: "09:00",
              reason: "Free morning slot.",
            },
          ],
        })
      )
    );
    renderCalendar();

    await user.click(screen.getByRole("button", { name: /suggest plan/i }));

    expect(await screen.findByText("Suggested Weekly Plan")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /approve plan/i })).toBeInTheDocument();
  });

  it("shows a notice when there is no plannable work", async () => {
    const user = userEvent.setup();
    server.use(
      http.post("/api/ai/suggest-plan", () => HttpResponse.json({ items: [] }))
    );
    renderCalendar();

    await user.click(screen.getByRole("button", { name: /suggest plan/i }));

    expect(await screen.findByRole("status")).toHaveTextContent(/no .*work to plan/i);
    expect(screen.queryByText("Suggested Weekly Plan")).not.toBeInTheDocument();
  });

  it("calls onDayViewActive with new date when navigating days inside day view (bug 4)", async () => {
    const user = userEvent.setup();
    const onDayViewActive = vi.fn();
    localStorage.setItem("token", "mock-token");
    render(
      <CalendarView
        cards={calendarCards}
        categories={mockCategories}
        categoryMap={categoryMap}
        onUpdate={vi.fn()}
        onDayViewActive={onDayViewActive}
      />
    );

    await user.click(screen.getByRole("button", { name: /^day$/i }));
    const enterCallDate = onDayViewActive.mock.calls[0][0] as string;
    expect(enterCallDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    await user.click(screen.getByRole("button", { name: /next day/i }));

    const nextCallDate = onDayViewActive.mock.calls[onDayViewActive.mock.calls.length - 1][0] as string;
    expect(nextCallDate).not.toBe(enterCallDate);
    expect(nextCallDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
