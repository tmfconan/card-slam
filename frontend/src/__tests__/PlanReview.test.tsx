import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../test/server";
import PlanReview from "../components/PlanReview";
import { PlanItem } from "../types";

const mockItems: PlanItem[] = [
  {
    card_id: "card-1",
    title: "Build login page",
    todo_date: "2026-05-05",
    todo_time: "09:00",
    reason: "Ready to do, scheduled first.",
  },
  {
    card_id: "card-2",
    title: "Set up database",
    todo_date: "2026-05-06",
    todo_time: "10:30",
    reason: "Depends on login.",
  },
];

describe("PlanReview", () => {
  beforeEach(() => {
    localStorage.setItem("token", "mock-token");
  });

  it("renders each suggested item with its title and time", () => {
    render(
      <PlanReview items={mockItems} onApprove={vi.fn()} onReject={vi.fn()} />
    );
    expect(screen.getByText("Build login page")).toBeInTheDocument();
    expect(screen.getByText("Set up database")).toBeInTheDocument();
    expect(screen.getByText(/at 09:00/)).toBeInTheDocument();
    expect(screen.getByText(/at 10:30/)).toBeInTheDocument();
  });

  it("clicking Reject calls onReject and does not apply", async () => {
    const user = userEvent.setup();
    const onReject = vi.fn();
    render(
      <PlanReview items={mockItems} onApprove={vi.fn()} onReject={onReject} />
    );
    await user.click(screen.getByRole("button", { name: /reject/i }));
    expect(onReject).toHaveBeenCalled();
  });

  it("approving applies each suggestion via PUT and calls onApprove", async () => {
    const user = userEvent.setup();
    const onApprove = vi.fn();
    const puts: Record<string, unknown> = {};
    server.use(
      http.put("/api/cards/:id", async ({ request, params }) => {
        puts[params.id as string] = await request.json();
        return HttpResponse.json({ id: params.id });
      })
    );

    render(
      <PlanReview items={mockItems} onApprove={onApprove} onReject={vi.fn()} />
    );
    await user.click(screen.getByRole("button", { name: /approve plan/i }));

    await waitFor(() => expect(onApprove).toHaveBeenCalled());
    expect(puts["card-1"]).toEqual({ todo_date: "2026-05-05", todo_time: "09:00" });
    expect(puts["card-2"]).toEqual({ todo_date: "2026-05-06", todo_time: "10:30" });
  });

  it("unchecking an item excludes it from the applied plan", async () => {
    const user = userEvent.setup();
    const onApprove = vi.fn();
    const putIds: string[] = [];
    server.use(
      http.put("/api/cards/:id", ({ params }) => {
        putIds.push(params.id as string);
        return HttpResponse.json({ id: params.id });
      })
    );

    render(
      <PlanReview items={mockItems} onApprove={onApprove} onReject={vi.fn()} />
    );
    await user.click(screen.getByRole("checkbox", { name: /include set up database/i }));
    await user.click(screen.getByRole("button", { name: /approve plan/i }));

    await waitFor(() => expect(onApprove).toHaveBeenCalled());
    expect(putIds).toEqual(["card-1"]);
  });
});
