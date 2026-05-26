import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../test/server";
import Reports from "../components/Reports";

const MOCK_VELOCITY = {
  lifetime: { total_intended: 10, total_done: 7, completion_rate: 0.7 },
  weekly_throughput: [
    { week: "2026-W18", week_label: "5/4", done: 3 },
    { week: "2026-W19", week_label: "5/11", done: 4 },
  ],
  weekly_cohort: [
    { week: "2026-W18", week_label: "5/4", intended: 5, done: 3, not_done: 2, rate: 0.6 },
    { week: "2026-W19", week_label: "5/11", intended: 4, done: 4, not_done: 0, rate: 1.0 },
  ],
};

function renderReports() {
  localStorage.setItem("token", "mock-token");
  return render(<Reports />);
}

describe("Reports", () => {
  beforeEach(() => {
    server.use(
      http.get("/api/reports/velocity", () => HttpResponse.json(MOCK_VELOCITY))
    );
  });

  it("renders lifetime stats after loading", async () => {
    renderReports();
    await waitFor(() => expect(screen.getByText("10")).toBeInTheDocument());
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText("70%")).toBeInTheDocument();
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
});
