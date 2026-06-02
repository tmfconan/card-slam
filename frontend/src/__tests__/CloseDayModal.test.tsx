import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../test/server";
import CloseDayModal from "../components/CloseDayModal";

const DAY = "2026-06-02";

function renderModal(onSaved = vi.fn(), onClose = vi.fn()) {
  localStorage.setItem("token", "mock-token");
  render(<CloseDayModal date={DAY} onClose={onClose} onSaved={onSaved} />);
  return { onSaved, onClose };
}

describe("CloseDayModal", () => {
  beforeEach(() => {
    // Default: day not closed yet.
    server.use(
      http.get("/api/dayclose/:date", () =>
        HttpResponse.json({ detail: "Day not closed yet" }, { status: 404 })
      )
    );
  });

  it("renders the modal with a required learning field", () => {
    renderModal();
    expect(screen.getByTestId("close-day-modal")).toBeInTheDocument();
    expect(screen.getByText("Close the Day")).toBeInTheDocument();
    expect(screen.getByLabelText(/what did you learn today/i)).toBeInTheDocument();
  });

  it("disables the save button until a learning is entered", async () => {
    const user = userEvent.setup();
    renderModal();
    const saveBtn = screen.getByRole("button", { name: /close the day/i });
    expect(saveBtn).toBeDisabled();

    await user.type(screen.getByLabelText(/what did you learn today/i), "Batch work.");
    expect(saveBtn).toBeEnabled();
  });

  it("generates an AI summary with completed/incomplete breakdown", async () => {
    const user = userEvent.setup();
    server.use(
      http.post("/api/dayclose/summary", () =>
        HttpResponse.json({
          summary: "You finished one card and left one open.",
          completed: ["Write API tests"],
          incomplete: ["Set up database"],
        })
      )
    );
    renderModal();

    await user.click(screen.getByRole("button", { name: /generate summary/i }));

    expect(await screen.findByTestId("close-day-summary")).toHaveTextContent(
      /finished one card/i
    );
    expect(screen.getByTestId("close-day-completed")).toHaveTextContent("Write API tests");
    expect(screen.getByTestId("close-day-incomplete")).toHaveTextContent("Set up database");
  });

  it("saves the closure and calls onSaved + onClose", async () => {
    const user = userEvent.setup();
    let posted: any = null;
    server.use(
      http.post("/api/dayclose", async ({ request }) => {
        posted = await request.json();
        return HttpResponse.json(
          { date: DAY, learning: posted.learning, ai_summary: "", created_at: "", updated_at: "" },
          { status: 201 }
        );
      })
    );
    const { onSaved, onClose } = renderModal();

    await user.type(screen.getByLabelText(/what did you learn today/i), "Plan mornings.");
    await user.click(screen.getByRole("button", { name: /close the day/i }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(onClose).toHaveBeenCalled();
    expect(posted.learning).toBe("Plan mornings.");
    expect(posted.date).toBe(DAY);
  });

  it("prefills from an existing closure", async () => {
    server.use(
      http.get("/api/dayclose/:date", () =>
        HttpResponse.json({
          date: DAY,
          learning: "Saved learning.",
          ai_summary: "Saved summary.",
          created_at: "2026-06-02T00:00:00Z",
          updated_at: "2026-06-02T00:00:00Z",
        })
      )
    );
    renderModal();

    expect(await screen.findByDisplayValue("Saved learning.")).toBeInTheDocument();
    expect(screen.getByTestId("close-day-summary")).toHaveTextContent("Saved summary.");
  });

  it("shows an error if summary generation fails", async () => {
    const user = userEvent.setup();
    server.use(
      http.post("/api/dayclose/summary", () => new HttpResponse(null, { status: 502 }))
    );
    renderModal();

    await user.click(screen.getByRole("button", { name: /generate summary/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't generate/i);
  });
});
