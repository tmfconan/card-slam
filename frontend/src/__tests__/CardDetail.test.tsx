import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../test/server";
import CardDetail from "../components/CardDetail";
import { AuthProvider } from "../contexts/AuthContext";
import { Card, Category } from "../types";

const mockCard: Card = {
  id: "card-1",
  title: "Fix the login bug",
  description: "The login form resets on error",
  category_id: "cat-1",
  status: "in_progress",
  priority: 0,
  duration: 60,
  todo_date: "2026-05-05",
  todo_time: "09:00",
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-02T10:00:00Z",
};

const mockCategories: Category[] = [
  { id: "cat-1", name: "Frontend", color: "#3b82f6", created_at: "2024-01-01T00:00:00Z" },
  { id: "cat-2", name: "Backend", color: "#22c55e", created_at: "2024-01-02T00:00:00Z" },
];

function renderDetail(overrides: Partial<Card> = {}) {
  localStorage.setItem("token", "mock-token");
  const onSave = vi.fn();
  const onClose = vi.fn();
  render(
    <AuthProvider>
      <CardDetail
        card={{ ...mockCard, ...overrides }}
        categories={mockCategories}
        onSave={onSave}
        onClose={onClose}
      />
    </AuthProvider>
  );
  return { onSave, onClose };
}

describe("CardDetail", () => {
  it("renders title in an editable input", () => {
    renderDetail();
    expect(screen.getByDisplayValue("Fix the login bug")).toBeInTheDocument();
  });

  it("renders description in an editable textarea", () => {
    renderDetail();
    expect(
      screen.getByDisplayValue("The login form resets on error")
    ).toBeInTheDocument();
  });

  it("renders category selector with current category selected", () => {
    renderDetail();
    const select = screen.getByRole("combobox", {
      name: /category/i,
    }) as HTMLSelectElement;
    expect(select.value).toBe("cat-1");
  });

  it("renders status selector with current status", () => {
    renderDetail();
    const select = screen.getByRole("combobox", {
      name: /status/i,
    }) as HTMLSelectElement;
    expect(select.value).toBe("in_progress");
  });

  it("renders duration input with current value", () => {
    renderDetail();
    const input = screen.getByRole("spinbutton", {
      name: /duration/i,
    }) as HTMLInputElement;
    expect(input.value).toBe("60");
  });

  it("duration input enforces minimum of 15", () => {
    renderDetail();
    const input = screen.getByRole("spinbutton", {
      name: /duration/i,
    }) as HTMLInputElement;
    expect(input.min).toBe("15");
  });

  it("renders todo_time input", () => {
    renderDetail();
    const input = screen.getByLabelText(/time/i) as HTMLInputElement;
    expect(input.value).toBe("09:00");
  });

  it("renders todo_date input", () => {
    renderDetail();
    const input = screen.getByLabelText(/date/i) as HTMLInputElement;
    expect(input.value).toBe("2026-05-05");
  });

  it("shows last-updated date (read-only)", () => {
    renderDetail();
    expect(screen.getByText(/updated/i)).toBeInTheDocument();
    // updated_at = "2024-01-02T10:00:00Z" — date portion should appear somewhere
    expect(screen.getByText(/1\/2\/2024/i)).toBeInTheDocument();
  });

  it("saving calls PUT /api/cards/:id and then onSave", async () => {
    const user = userEvent.setup();
    const { onSave } = renderDetail();

    const titleInput = screen.getByDisplayValue("Fix the login bug");
    await user.clear(titleInput);
    await user.type(titleInput, "Updated title");

    await user.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
  });

  it("cancel button calls onClose without saving", async () => {
    const user = userEvent.setup();
    const { onClose, onSave } = renderDetail();

    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("delete button calls DELETE and then onClose", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    const { onClose } = renderDetail();

    await user.click(screen.getByRole("button", { name: /delete/i }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("shows error if PUT fails", async () => {
    server.use(
      http.put("/api/cards/:id", () =>
        HttpResponse.json({ detail: "Server error" }, { status: 500 })
      )
    );
    const user = userEvent.setup();
    renderDetail();

    await user.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() =>
      expect(screen.getByText(/failed to save/i)).toBeInTheDocument()
    );
  });

  // ── Bug 2: Modal rendered via Portal escapes stacking context ─────────────

  it("modal overlay is rendered as a direct child of document.body (portal) so it isn't clipped by card z-index stacking contexts (bug 2)", () => {
    localStorage.setItem("token", "mock-token");
    const { container } = render(
      <AuthProvider>
        <CardDetail
          card={mockCard}
          categories={mockCategories}
          onSave={vi.fn()}
          onClose={vi.fn()}
        />
      </AuthProvider>
    );
    // The modal must NOT be inside the render container — it's portalled to document.body
    expect(container.querySelector('.fixed.inset-0')).toBeNull();
    // But it IS in document.body
    expect(document.body.querySelector('.fixed.inset-0')).not.toBeNull();
  });
});
