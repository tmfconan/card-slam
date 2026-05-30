import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../test/server";
import WhatsGoinOn from "../components/WhatsGoinOn";

const MOCK_RESULT = {
  summary: "You have 2 cards scheduled for today and 3 more this week.",
  recommendations: [
    {
      title: "Review the backlog",
      description: "Spend 30 minutes triaging stale cards.",
    },
  ],
};

function renderModal({ open = true }: { open?: boolean } = {}) {
  localStorage.setItem("token", "mock-token");
  const onClose = vi.fn();
  const result = render(<WhatsGoinOn open={open} onClose={onClose} />);
  return { ...result, onClose };
}

describe("WhatsGoinOn", () => {
  beforeEach(() => {
    server.use(
      http.post("/api/ai/whats-goin-on", () => HttpResponse.json(MOCK_RESULT))
    );
  });

  it("renders nothing when closed", () => {
    renderModal({ open: false });
    expect(screen.queryByTestId("whats-goin-on-modal")).not.toBeInTheDocument();
  });

  it("renders the modal heading when open", async () => {
    renderModal();
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: /what's goin' on/i })
      ).toBeInTheDocument()
    );
    expect(screen.getByTestId("whats-goin-on-modal")).toBeInTheDocument();
  });

  it("shows a loading state before data arrives", () => {
    server.use(
      http.post("/api/ai/whats-goin-on", async () => {
        await new Promise(() => {});
        return HttpResponse.json(MOCK_RESULT);
      })
    );
    renderModal();
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it("renders the generated summary", async () => {
    renderModal();
    await waitFor(() =>
      expect(screen.getByTestId("whats-goin-on-summary")).toHaveTextContent(
        /2 cards scheduled for today/i
      )
    );
  });

  it("renders the recommended new cards", async () => {
    renderModal();
    await waitFor(() =>
      expect(screen.getByText("Review the backlog")).toBeInTheDocument()
    );
    expect(screen.getByText(/triaging stale cards/i)).toBeInTheDocument();
  });

  it("omits the recommendations section when there are none", async () => {
    server.use(
      http.post("/api/ai/whats-goin-on", () =>
        HttpResponse.json({ summary: "All quiet.", recommendations: [] })
      )
    );
    renderModal();
    await waitFor(() =>
      expect(screen.getByTestId("whats-goin-on-summary")).toHaveTextContent(
        "All quiet."
      )
    );
    expect(
      screen.queryByTestId("whats-goin-on-recommendations")
    ).not.toBeInTheDocument();
  });

  it("shows an error message when the API fails", async () => {
    server.use(
      http.post("/api/ai/whats-goin-on", () =>
        HttpResponse.json({ detail: "boom" }, { status: 500 })
      )
    );
    renderModal();
    await waitFor(() =>
      expect(screen.getByText(/failed to generate/i)).toBeInTheDocument()
    );
  });

  it("close button invokes onClose", async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal();
    await waitFor(() =>
      expect(screen.getByTestId("whats-goin-on-close")).toBeInTheDocument()
    );
    await user.click(screen.getByTestId("whats-goin-on-close"));
    expect(onClose).toHaveBeenCalled();
  });

  it("the Done button invokes onClose", async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal();
    await waitFor(() =>
      expect(screen.getByTestId("whats-goin-on-done")).toBeInTheDocument()
    );
    await user.click(screen.getByTestId("whats-goin-on-done"));
    expect(onClose).toHaveBeenCalled();
  });

  it("clicking the backdrop dismisses the modal", async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal();
    await waitFor(() =>
      expect(screen.getByTestId("whats-goin-on-modal")).toBeInTheDocument()
    );
    await user.click(screen.getByTestId("whats-goin-on-modal"));
    expect(onClose).toHaveBeenCalled();
  });

  it("pressing Escape dismisses the modal", async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal();
    await waitFor(() =>
      expect(screen.getByTestId("whats-goin-on-modal")).toBeInTheDocument()
    );
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  it("exposes dialog semantics for screen readers", async () => {
    renderModal();
    await waitFor(() =>
      expect(screen.getByTestId("whats-goin-on-modal")).toBeInTheDocument()
    );
    expect(screen.getByRole("dialog")).toHaveAttribute("aria-modal", "true");
  });
});
