import { http, HttpResponse } from "msw";
import { Category, Card } from "../types";

export const mockCategories: Category[] = [
  {
    id: "cat-1",
    name: "Frontend",
    color: "#3b82f6",
    created_at: "2024-01-01T00:00:00Z",
  },
  {
    id: "cat-2",
    name: "Backend",
    color: "#22c55e",
    created_at: "2024-01-02T00:00:00Z",
  },
];

export const mockCards: Card[] = [
  {
    id: "card-1",
    title: "Build login page",
    description: "Create login form with email and password",
    category_id: "cat-1",
    status: "brainstorm",
    priority: 0,
    duration: 30,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  },
  {
    id: "card-2",
    title: "Set up database",
    description: "Configure DynamoDB tables",
    category_id: "cat-2",
    status: "in_progress",
    priority: 1,
    duration: 60,
    todo_date: "2026-05-05",
    created_at: "2024-01-02T00:00:00Z",
    updated_at: "2024-01-02T00:00:00Z",
  },
  {
    id: "card-3",
    title: "Write API tests",
    description: "Add pytest coverage for all endpoints",
    category_id: "cat-2",
    status: "done",
    priority: 2,
    duration: 30,
    created_at: "2024-01-03T00:00:00Z",
    updated_at: "2024-01-03T00:00:00Z",
  },
];

export const handlers = [
  http.post("/api/auth/login", () => {
    return HttpResponse.json({ access_token: "mock-token" }, { status: 200 });
  }),

  http.get("/api/categories/", () => {
    return HttpResponse.json(mockCategories);
  }),

  http.post("/api/categories/", async ({ request }) => {
    const body = (await request.json()) as { name: string; color: string };
    const newCat: Category = {
      id: "cat-new",
      name: body.name,
      color: body.color,
      created_at: new Date().toISOString(),
    };
    return HttpResponse.json(newCat, { status: 201 });
  }),

  http.put("/api/categories/:id", async ({ request, params }) => {
    const body = (await request.json()) as Partial<Category>;
    const updated: Category = {
      id: params.id as string,
      name: body.name ?? "Updated",
      color: body.color ?? "#000000",
      created_at: "2024-01-01T00:00:00Z",
    };
    return HttpResponse.json(updated);
  }),

  http.delete("/api/categories/:id", () => {
    return new HttpResponse(null, { status: 204 });
  }),

  http.get("/api/cards/", () => {
    return HttpResponse.json(mockCards);
  }),

  http.post("/api/cards/", async ({ request }) => {
    const body = (await request.json()) as Omit<Card, "id" | "created_at" | "updated_at">;
    const newCard: Card = {
      id: "card-new",
      ...body,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    return HttpResponse.json(newCard, { status: 201 });
  }),

  http.post("/api/cards/batch", async ({ request }) => {
    const bodies = (await request.json()) as Array<Omit<Card, "id" | "created_at" | "updated_at">>;
    const now = new Date().toISOString();
    const cards: Card[] = bodies.map((body, i) => ({
      id: `card-batch-${i}`,
      ...body,
      priority: i,
      created_at: now,
      updated_at: now,
    }));
    return HttpResponse.json(cards, { status: 201 });
  }),

  http.put("/api/cards/:id", async ({ request, params }) => {
    const body = (await request.json()) as Partial<Card>;
    const existing = mockCards.find((c) => c.id === params.id) ?? mockCards[0];
    const updated: Card = {
      ...existing,
      ...body,
      id: params.id as string,
      updated_at: new Date().toISOString(),
    };
    return HttpResponse.json(updated);
  }),

  http.delete("/api/cards/:id", () => {
    return new HttpResponse(null, { status: 204 });
  }),

  http.post("/api/cards/reorder", () => {
    return HttpResponse.json({ ok: true });
  }),

  http.post("/api/cards/batch-status", async ({ request }) => {
    const body = (await request.json()) as { ids: string[]; status: string };
    return HttpResponse.json({ updated: body.ids.length });
  }),

  http.post("/api/ai/parse", () => {
    return HttpResponse.json({
      items: [
        { title: "First work item", description: "Description for the first item" },
        { title: "Second work item", description: "Description for the second item" },
      ],
    });
  }),
];
