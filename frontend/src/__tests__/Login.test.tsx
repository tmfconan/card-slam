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
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
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

  it("sign in button is disabled when password is empty", () => {
    renderLogin();
    const button = screen.getByRole("button", { name: /sign in/i });
    expect(button).toBeDisabled();
  });

  it("sign in button is enabled when password is typed", async () => {
    const user = userEvent.setup();
    renderLogin();
    const input = screen.getByPlaceholderText(/enter your password/i);
    await user.type(input, "somepassword");
    const button = screen.getByRole("button", { name: /sign in/i });
    expect(button).not.toBeDisabled();
  });

  it("successful login calls navigate('/')", async () => {
    const user = userEvent.setup();
    renderLogin();
    const input = screen.getByPlaceholderText(/enter your password/i);
    await user.type(input, "correct-password");
    const button = screen.getByRole("button", { name: /sign in/i });
    await user.click(button);
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/");
    });
  });

  it("failed login shows error message", async () => {
    server.use(
      http.post("/api/auth/login", () => {
        return HttpResponse.json({ detail: "Invalid password" }, { status: 401 });
      })
    );
    const user = userEvent.setup();
    renderLogin();
    const input = screen.getByPlaceholderText(/enter your password/i);
    await user.type(input, "wrong-password");
    const button = screen.getByRole("button", { name: /sign in/i });
    await user.click(button);
    await waitFor(() => {
      expect(screen.getByText(/invalid password/i)).toBeInTheDocument();
    });
  });
});
