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
  http.post("/api/auth/login", async ({ request }) => {
    const body = (await request.json()) as { username?: string };
    const token = body.username === "testuser" ? "mock-user-token" : "mock-admin-token";
    return HttpResponse.json({ access_token: token }, { status: 200 });
  }),

  http.get("/api/auth/captcha", () =>
    HttpResponse.json({ challenge_id: "captcha-1", question: "What is 3 + 4?" })
  ),

  http.get("/api/auth/me", ({ request }) => {
    const auth = request.headers.get("Authorization") ?? "";
    if (auth.includes("mock-user-token")) {
      return HttpResponse.json({ username: "testuser", role: "user", theme: "light" });
    }
    return HttpResponse.json({ username: "admin", role: "admin", theme: "light" });
  }),

  http.put("/api/auth/me/theme", async ({ request }) => {
    const body = (await request.json()) as { theme?: string };
    return HttpResponse.json({ theme: body.theme });
  }),

  // Admin user management
  http.get("/api/admin/users", () =>
    HttpResponse.json([
      { username: "admin", role: "admin", created_at: "2024-01-01T00:00:00Z" },
    ])
  ),
  http.post("/api/admin/users", async ({ request }) => {
    const body = (await request.json()) as { username: string };
    return HttpResponse.json(
      { username: body.username, role: "user", created_at: new Date().toISOString() },
      { status: 201 }
    );
  }),
  http.delete("/api/admin/users/:username", () => new HttpResponse(null, { status: 204 })),

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

  http.get("/api/cards/", ({ request }) => {
    const archived = new URL(request.url).searchParams.get("archived") === "true";
    return HttpResponse.json(
      mockCards.filter((c) => Boolean(c.archived) === archived)
    );
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

  http.post("/api/cards/batch-archive", async ({ request }) => {
    const body = (await request.json()) as { ids: string[]; archived: boolean };
    return HttpResponse.json({ updated: body.ids.length });
  }),

  http.post("/api/cards/batch-delete", async ({ request }) => {
    const body = (await request.json()) as { ids: string[] };
    return HttpResponse.json({ deleted: body.ids.length });
  }),

  http.get("/api/onboarding/steps", () =>
    HttpResponse.json({
      steps: [
        {
          id: 1,
          title: "Sign in to your workspace",
          summary: "Use your credentials on the login screen.",
          location: "/login",
          action: "Enter username and password, click Sign in.",
          expect: "You land on the Kanban board.",
        },
        {
          id: 2,
          title: "Create your first category",
          summary: "Categories color-code your cards.",
          location: "Categories page",
          action: "Click Categories, type a name, pick a color, click Add category.",
          expect: "The new category appears in the list.",
        },
        {
          id: 3,
          title: "Move cards across the Kanban board",
          summary: "Drag cards between columns.",
          location: "Kanban view",
          action: "Drag a card from Brainstorm to Ready to do.",
          expect: "The card snaps into the target column.",
        },
      ],
    })
  ),

  http.get("/api/reports/by-category", () =>
    HttpResponse.json({ total: [], complete: [], incomplete: [] })
  ),

  http.post("/api/ai/parse", () => {
    return HttpResponse.json({
      items: [
        { title: "First work item", description: "Description for the first item" },
        { title: "Second work item", description: "Description for the second item" },
      ],
    });
  }),

  http.post("/api/ai/suggest-plan", () => {
    return HttpResponse.json({
      items: [
        {
          card_id: "card-2",
          title: "Set up database",
          todo_date: "2026-05-05",
          todo_time: "09:00",
          reason: "Ready to do, scheduled first thing.",
        },
      ],
    });
  }),
];
