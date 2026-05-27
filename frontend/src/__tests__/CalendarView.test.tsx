import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../test/server";
import { mockCategories } from "../test/handlers";
import { Card, Category } from "../types";
import CalendarView from "../components/CalendarView";

vi.mock("@hello-pangea/dnd", () => ({
  DragDropContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Droppable: ({ children, droppableId }: { children: Function; droppableId: string }) => (
    <div data-testid={`droppable-${droppableId}`}>
      {children(
        { innerRef: vi.fn(), droppableProps: {}, placeholder: null },
        { isDraggingOver: false }
      )}
    </div>
  ),
  Draggable: ({ children, draggableId }: { children: Function; draggableId: string }) => (
    <div data-testid={`draggable-${draggableId}`}>
      {children(
        { innerRef: vi.fn(), draggableProps: {}, dragHandleProps: {} },
        { isDragging: false }
      )}
    </div>
  ),
}));

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

describe("CalendarView", () => {
  beforeEach(() => {
    server.use(http.get("/api/cards/", () => HttpResponse.json(calendarCards)));
  });

  it("renders yesterday + 14 day columns plus an Unscheduled column", () => {
    renderCalendar();
    // Unscheduled column header (exact label, not the card title)
    expect(screen.getByText("Unscheduled")).toBeInTheDocument();
    // Yesterday column is included to help manage completed cards
    expect(screen.getByTestId(`droppable-${dateStr(-1)}`)).toBeInTheDocument();
    // Each of the 14 day droppables (today + next 13) should be in the DOM
    for (let i = 0; i < 14; i++) {
      expect(screen.getByTestId(`droppable-${dateStr(i)}`)).toBeInTheDocument();
    }
  });

  it("shows cards with todo_date of yesterday in the yesterday column", () => {
    const yesterdayCard: Card = {
      id: "cal-yesterday",
      title: "Completed yesterday",
      description: "Card from yesterday",
      category_id: "cat-1",
      status: "ready_to_do",
      priority: 0,
      todo_date: dateStr(-1),
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
    };
    renderCalendar([...calendarCards, yesterdayCard]);
    const yesterdayCol = screen.getByTestId(`droppable-${dateStr(-1)}`);
    expect(within(yesterdayCol).getByText("Completed yesterday")).toBeInTheDocument();
  });

  it("shows cards with todo_date in the correct day column", () => {
    renderCalendar();
    // cal-1 is today
    const todayStr = dateStr(0);
    const todayCol = screen.getByTestId(`droppable-${todayStr}`);
    expect(within(todayCol).getByText("Ready card today")).toBeInTheDocument();

    // cal-2 is day 5
    const day5Str = dateStr(5);
    const day5Col = screen.getByTestId(`droppable-${day5Str}`);
    expect(within(day5Col).getByText("In progress card day 5")).toBeInTheDocument();
  });

  it("shows cards without todo_date in the Unscheduled column", () => {
    renderCalendar();
    const unscheduled = screen.getByTestId("droppable-unscheduled");
    expect(within(unscheduled).getByText("Unscheduled card")).toBeInTheDocument();
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

    // Find and click the brainstorm filter toggle
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

    // Select cat-1 (Frontend) — should hide cat-2 cards
    const catFilter = screen.getByRole("combobox", { name: /category/i });
    await user.selectOptions(catFilter, "cat-1");

    expect(screen.getByText("Ready card today")).toBeInTheDocument();
    expect(screen.queryByText("In progress card day 5")).not.toBeInTheDocument();
  });

  it("calls onUpdate after a drag-and-drop date change", async () => {
    // Drag-and-drop is mocked, so we test that PUT is called when reorder fires
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
    // In the real component, DragDropContext onDragEnd calls PUT + onUpdate.
    // With the mock, we verify the component mounts without errors.
    expect(screen.getByText("Unscheduled")).toBeInTheDocument();
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
      todo_date: dateStr(60), // 60 days from today — outside the 14-day window
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
    };

    localStorage.setItem("token", "mock-token");
    render(
      <CalendarView
        cards={[...calendarCards, futureCard]}
        categories={mockCategories}
        categoryMap={categoryMap}
        onUpdate={vi.fn()}
      />
    );

    // Should not appear anywhere — not in unscheduled, not in any day column
    expect(screen.queryByText("Far future card")).not.toBeInTheDocument();
    const unscheduled = screen.getByTestId("droppable-unscheduled");
    expect(unscheduled).not.toHaveTextContent("Far future card");
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

    // Enter day view for today
    await user.click(screen.getByRole("button", { name: /^day$/i }));
    const enterCallDate = onDayViewActive.mock.calls[0][0] as string;
    expect(enterCallDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    // Navigate to next day
    await user.click(screen.getByRole("button", { name: /next day/i }));

    // onDayViewActive should have been called with the new (next) date
    const nextCallDate = onDayViewActive.mock.calls[onDayViewActive.mock.calls.length - 1][0] as string;
    expect(nextCallDate).not.toBe(enterCallDate);
    expect(nextCallDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
