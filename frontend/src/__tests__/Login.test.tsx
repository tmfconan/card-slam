import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { http, HttpResponse } from "msw";
import { server } from "../test/server";
import { AuthProvider } from "../contexts/AuthContext";
import Login from "../components/Login";

const mockNavigate = vi.fn();

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

function renderLogin() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <Login />
      </AuthProvider>
    </MemoryRouter>
  );
}

describe("Login", () => {
  it("renders the Card Slam title", () => {
    renderLogin();
    expect(screen.getByText("Card Slam")).toBeInTheDocument();
  });

  it("renders a username field", () => {
    renderLogin();
    expect(screen.getByPlaceholderText(/username/i)).toBeInTheDocument();
  });

  it("sign in button is disabled when both fields are empty", () => {
    renderLogin();
    expect(screen.getByRole("button", { name: /sign in/i })).toBeDisabled();
  });

  it("sign in button is disabled when only password is filled", async () => {
    const user = userEvent.setup();
    renderLogin();
    await user.type(screen.getByPlaceholderText(/enter your password/i), "pass");
    expect(screen.getByRole("button", { name: /sign in/i })).toBeDisabled();
  });

  it("sign in button is disabled when only username is filled", async () => {
    const user = userEvent.setup();
    renderLogin();
    await user.type(screen.getByPlaceholderText(/username/i), "admin");
    expect(screen.getByRole("button", { name: /sign in/i })).toBeDisabled();
  });

  it("sign in button is enabled when both username and password are filled", async () => {
    const user = userEvent.setup();
    renderLogin();
    await user.type(screen.getByPlaceholderText(/username/i), "admin");
    await user.type(screen.getByPlaceholderText(/enter your password/i), "pass");
    expect(screen.getByRole("button", { name: /sign in/i })).not.toBeDisabled();
  });

  it("successful login calls navigate('/')", async () => {
    const user = userEvent.setup();
    renderLogin();
    await user.type(screen.getByPlaceholderText(/username/i), "admin");
    await user.type(screen.getByPlaceholderText(/enter your password/i), "correct-password");
    await user.click(screen.getByRole("button", { name: /sign in/i }));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/"));
  });

  it("failed login shows error message", async () => {
    server.use(
      http.post("/api/auth/login", () =>
        HttpResponse.json({ detail: "Invalid credentials" }, { status: 401 })
      )
    );
    const user = userEvent.setup();
    renderLogin();
    await user.type(screen.getByPlaceholderText(/username/i), "admin");
    await user.type(screen.getByPlaceholderText(/enter your password/i), "wrong");
    await user.click(screen.getByRole("button", { name: /sign in/i }));
    await waitFor(() =>
      expect(screen.getByText(/invalid credentials/i)).toBeInTheDocument()
    );
  });
});
