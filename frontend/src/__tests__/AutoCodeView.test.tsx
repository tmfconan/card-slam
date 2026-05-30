import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "../test/server";
import AutoCodeView from "../components/AutoCodeView";
import { Card } from "../types";

function frCard(id: string, title: string, status: Card["feature_request_status"]): Card {
  return {
    id,
    title,
    description: "",
    category_id: "cat-1",
    status: "brainstorm",
    priority: 0,
    duration: 30,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
    is_feature_request: true,
    feature_request_status: status,
  };
}

function mockAutoCode(queue: Card[], cards: Card[]) {
  server.use(
    http.get("/api/autocode/queue", () => HttpResponse.json(queue)),
    http.get("/api/autocode/history", () => HttpResponse.json([])),
    http.get("/api/cards", () => HttpResponse.json(cards)),
    http.get("/api/cards/", () => HttpResponse.json(cards))
  );
}

describe("AutoCodeView", () => {
  beforeEach(() => {
    localStorage.setItem("token", "mock-admin-token");
  });

  it("shows 'Waiting for merge' for a queued request while a deploy is unmerged", async () => {
    const queued = frCard("q1", "Queued feature", "queued");
    const deployed = frCard("d1", "Deployed feature", "completed");
    mockAutoCode([queued], [queued, deployed]);

    render(<AutoCodeView />);

    expect(await screen.findByText("Queued feature")).toBeInTheDocument();
    expect(screen.getByText("Waiting for merge")).toBeInTheDocument();
    expect(screen.queryByText("Queued")).not.toBeInTheDocument();
  });

  it("shows 'Queued' when no deployed-but-unmerged request exists", async () => {
    const queued = frCard("q1", "Queued feature", "queued");
    mockAutoCode([queued], [queued]);

    render(<AutoCodeView />);

    expect(await screen.findByText("Queued feature")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Queued")).toBeInTheDocument());
    expect(screen.queryByText("Waiting for merge")).not.toBeInTheDocument();
  });

  it("does not wait when the prior deploy is already merged", async () => {
    const queued = frCard("q1", "Queued feature", "queued");
    const merged = frCard("m1", "Merged feature", "merged");
    mockAutoCode([queued], [queued, merged]);

    render(<AutoCodeView />);

    expect(await screen.findByText("Queued feature")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Queued")).toBeInTheDocument());
    expect(screen.queryByText("Waiting for merge")).not.toBeInTheDocument();
  });
});
