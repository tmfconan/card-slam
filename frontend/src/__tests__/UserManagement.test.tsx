import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../test/server";
import UserManagement from "../components/UserManagement";

const mockUsers = [
  { username: "admin", role: "admin", created_at: "2024-01-01T00:00:00Z" },
  { username: "alice", role: "user", created_at: "2024-02-01T00:00:00Z" },
];

function renderUserManagement() {
  localStorage.setItem("token", "mock-admin-token");
  return render(<UserManagement />);
}

describe("UserManagement", () => {
  beforeEach(() => {
    server.use(
      http.get("/api/admin/users", () => HttpResponse.json(mockUsers))
    );
  });

  it("renders the user list", async () => {
    renderUserManagement();
    // "admin" appears twice per admin row (username + role badge) — use getAllByText
    await waitFor(() => {
      expect(screen.getAllByText("admin").length).toBeGreaterThan(0);
      expect(screen.getByText("alice")).toBeInTheDocument();
    });
  });

  it("shows role badge for each user", async () => {
    renderUserManagement();
    await waitFor(() => {
      // "admin" appears as username AND role badge — getAllByText handles that
      expect(screen.getAllByText("admin").length).toBeGreaterThan(0);
    });
    const rows = screen.getAllByRole("row");
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });

  it("admin row has no delete button (cannot delete admin)", async () => {
    renderUserManagement();
    await waitFor(() => expect(screen.getAllByText("admin").length).toBeGreaterThan(0));
    // The username cell has font-medium — find that specific td
    const adminNameCell = screen
      .getAllByText("admin")
      .find((el) => el.classList.contains("font-medium"));
    const adminRow = adminNameCell?.closest("tr");
    expect(adminRow).not.toHaveTextContent("Delete");
  });

  it("non-admin rows have a delete button", async () => {
    renderUserManagement();
    await waitFor(() => expect(screen.getByText("alice")).toBeInTheDocument());
    const aliceRow = screen.getByText("alice").closest("tr");
    expect(within(aliceRow!).getByRole("button", { name: /delete/i })).toBeInTheDocument();
  });

  it("create user form has username and password fields", () => {
    renderUserManagement();
    expect(screen.getByPlaceholderText(/username/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/password/i)).toBeInTheDocument();
  });

  it("create button is disabled when fields are empty", () => {
    renderUserManagement();
    expect(screen.getByRole("button", { name: /create user/i })).toBeDisabled();
  });

  it("submitting the create form calls POST /api/admin/users", async () => {
    let capturedBody: unknown;
    server.use(
      http.post("/api/admin/users", async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json(
          { username: "newuser", role: "user", created_at: new Date().toISOString() },
          { status: 201 }
        );
      })
    );

    const user = userEvent.setup();
    renderUserManagement();

    await user.type(screen.getByPlaceholderText(/username/i), "newuser");
    await user.type(screen.getByPlaceholderText(/password/i), "pass123");
    await user.click(screen.getByRole("button", { name: /create user/i }));

    await waitFor(() =>
      expect(capturedBody).toMatchObject({ username: "newuser", password: "pass123" })
    );
  });

  it("deleting a user calls DELETE /api/admin/users/:username", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    let deletedUsername = "";
    server.use(
      http.delete("/api/admin/users/:username", ({ params }) => {
        deletedUsername = params.username as string;
        return new HttpResponse(null, { status: 204 });
      })
    );

    const user = userEvent.setup();
    renderUserManagement();

    await waitFor(() => expect(screen.getByText("alice")).toBeInTheDocument());
    const aliceRow = screen.getByText("alice").closest("tr");
    await user.click(within(aliceRow!).getByRole("button", { name: /delete/i }));

    await waitFor(() => expect(deletedUsername).toBe("alice"));
  });

  it("refreshes the user list after creating a user", async () => {
    let listCallCount = 0;
    server.use(
      http.get("/api/admin/users", () => {
        listCallCount++;
        return HttpResponse.json(mockUsers);
      }),
      http.post("/api/admin/users", async () =>
        HttpResponse.json(
          { username: "bob", role: "user", created_at: new Date().toISOString() },
          { status: 201 }
        )
      )
    );

    const user = userEvent.setup();
    renderUserManagement();
    await waitFor(() => expect(listCallCount).toBeGreaterThanOrEqual(1));

    await user.type(screen.getByPlaceholderText(/username/i), "bob");
    await user.type(screen.getByPlaceholderText(/password/i), "pass");
    await user.click(screen.getByRole("button", { name: /create user/i }));

    await waitFor(() => expect(listCallCount).toBeGreaterThanOrEqual(2));
  });
});
