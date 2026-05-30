import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../test/server";
import Reports from "../components/Reports";

const MOCK_VELOCITY = {
  lifetime: { total_intended: 10, total_done: 7, completion_rate: 0.7 },
  weekly_cohort: [
    { week: "2026-W18", week_label: "5/4", intended: 5, done: 3, not_done: 2, rate: 0.6 },
    { week: "2026-W19", week_label: "5/11", intended: 4, done: 4, not_done: 0, rate: 1.0 },
  ],
};

const MOCK_BY_CATEGORY = {
  total: [
    { category_id: "cat-1", name: "Frontend", color: "#3b82f6", value: 6 },
    { category_id: "cat-2", name: "Backend", color: "#22c55e", value: 4 },
  ],
  complete: [
    { category_id: "cat-1", name: "Frontend", color: "#3b82f6", value: 3 },
    { category_id: "cat-2", name: "Backend", color: "#22c55e", value: 4 },
  ],
  incomplete: [
    { category_id: "cat-1", name: "Frontend", color: "#3b82f6", value: 3 },
  ],
};

function renderReports() {
  localStorage.setItem("token", "mock-token");
  return render(<Reports />);
}

describe("Reports", () => {
  beforeEach(() => {
    server.use(
      http.get("/api/reports/velocity", () => HttpResponse.json(MOCK_VELOCITY)),
      http.get("/api/reports/by-category", () => HttpResponse.json(MOCK_BY_CATEGORY))
    );
  });

  it("renders the 'Work Report' title", async () => {
    renderReports();
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Work Report" })).toBeInTheDocument()
    );
    expect(screen.queryByText("Velocity Report")).not.toBeInTheDocument();
  });

  it("renders lifetime stats after loading", async () => {
    renderReports();
    await waitFor(() => expect(screen.getByText("10")).toBeInTheDocument());
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText("70%")).toBeInTheDocument();
  });

  it("does not render the 'Cards Completed Per Week' chart", async () => {
    renderReports();
    await waitFor(() => expect(screen.getByText("10")).toBeInTheDocument());
    expect(screen.queryByText(/cards completed per week/i)).not.toBeInTheDocument();
  });

  it("shows a loading state before data arrives", () => {
    server.use(
      http.get("/api/reports/velocity", async () => {
        await new Promise(() => {}); // never resolves
        return HttpResponse.json(MOCK_VELOCITY);
      })
    );
    renderReports();
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it("shows an error when the API fails", async () => {
    server.use(
      http.get("/api/reports/velocity", () =>
        HttpResponse.json({ detail: "error" }, { status: 500 })
      )
    );
    renderReports();
    await waitFor(() =>
      expect(screen.getByText(/failed to load/i)).toBeInTheDocument()
    );
  });

  // ── Bug 3: Week navigation changes the anchor week ─────────────────────────

  it("renders Prev/Next week navigation buttons (bug 3)", async () => {
    renderReports();
    await waitFor(() => expect(screen.getByTestId("reports-week-label")).toBeInTheDocument());
    expect(screen.getByTestId("reports-prev-week")).toBeInTheDocument();
    expect(screen.getByTestId("reports-next-week")).toBeInTheDocument();
  });

  it("Prev week button re-fetches with an earlier ref_date (bug 3)", async () => {
    const user = userEvent.setup();
    const capturedDates: (string | null)[] = [];

    server.use(
      http.get("/api/reports/velocity", ({ request }) => {
        const url = new URL(request.url);
        capturedDates.push(url.searchParams.get("ref_date"));
        return HttpResponse.json(MOCK_VELOCITY);
      })
    );

    renderReports();
    await waitFor(() => expect(screen.getByTestId("reports-prev-week")).toBeInTheDocument());

    const initialDate = capturedDates[capturedDates.length - 1];

    await user.click(screen.getByTestId("reports-prev-week"));

    await waitFor(() => expect(capturedDates.length).toBeGreaterThan(1));
    const prevDate = capturedDates[capturedDates.length - 1];

    // The ref_date sent after clicking Prev should be earlier than the initial date
    expect(new Date(prevDate!).getTime()).toBeLessThan(new Date(initialDate!).getTime());
  });

  it("Next week button is disabled when already at the current week (bug 3)", async () => {
    renderReports();
    await waitFor(() => expect(screen.getByTestId("reports-next-week")).toBeInTheDocument());
    // The initial ref_date is today, so Next should be disabled
    expect(screen.getByTestId("reports-next-week")).toBeDisabled();
  });

  it("Next week becomes enabled after navigating back with Prev (bug 3)", async () => {
    const user = userEvent.setup();
    renderReports();
    await waitFor(() => expect(screen.getByTestId("reports-prev-week")).toBeInTheDocument());

    await user.click(screen.getByTestId("reports-prev-week"));

    await waitFor(() =>
      expect(screen.getByTestId("reports-next-week")).not.toBeDisabled()
    );
  });

  // ── Category pie charts ────────────────────────────────────────────────────

  it("renders the three category pie charts (total, incomplete, complete)", async () => {
    renderReports();
    await waitFor(() =>
      expect(screen.getByTestId("category-pie-total")).toBeInTheDocument()
    );
    expect(screen.getByTestId("category-pie-incomplete")).toBeInTheDocument();
    expect(screen.getByTestId("category-pie-complete")).toBeInTheDocument();
    expect(screen.getByText("Cards by Category")).toBeInTheDocument();
  });

  it("shows the card count for each pie", async () => {
    renderReports();
    // total = 10, incomplete = 3, complete = 7
    await waitFor(() =>
      expect(screen.getByTestId("category-pie-total")).toHaveTextContent("10 cards")
    );
    expect(screen.getByTestId("category-pie-incomplete")).toHaveTextContent("3 cards");
    expect(screen.getByTestId("category-pie-complete")).toHaveTextContent("7 cards");
  });

  it("renders an empty state for a pie with no cards", async () => {
    server.use(
      http.get("/api/reports/by-category", () =>
        HttpResponse.json({ total: [], complete: [], incomplete: [] })
      )
    );
    renderReports();
    await waitFor(() =>
      expect(screen.getByTestId("category-pie-total")).toBeInTheDocument()
    );
    expect(screen.getByTestId("category-pie-total")).toHaveTextContent("No cards");
  });

  it("still renders velocity stats when the category breakdown fails to load", async () => {
    server.use(
      http.get("/api/reports/by-category", () =>
        HttpResponse.json({ detail: "error" }, { status: 500 })
      )
    );
    renderReports();
    await waitFor(() => expect(screen.getByText("10")).toBeInTheDocument());
    expect(screen.queryByText("Cards by Category")).not.toBeInTheDocument();
  });
});
