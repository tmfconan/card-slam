import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../test/server";
import OnboardingGuide from "../components/OnboardingGuide";

const MOCK_STEPS = {
  steps: [
    {
      id: 1,
      title: "Sign in to your workspace",
      summary: "Use your credentials.",
      location: "/login",
      action: "Enter username and password.",
      expect: "You land on the Kanban board.",
    },
    {
      id: 2,
      title: "Create your first category",
      summary: "Categories color-code your cards.",
      location: "Categories page",
      action: "Type a name, pick a color, click Add category.",
      expect: "The new category appears.",
    },
    {
      id: 3,
      title: "Move cards across the Kanban board",
      summary: "Drag cards between columns.",
      location: "Kanban view",
      action: "Drag a card to a new column.",
      expect: "The card snaps into place.",
    },
  ],
};

function renderGuide() {
  localStorage.setItem("token", "mock-token");
  return render(<OnboardingGuide />);
}

describe("OnboardingGuide", () => {
  beforeEach(() => {
    server.use(
      http.get("/api/onboarding/steps", () => HttpResponse.json(MOCK_STEPS))
    );
  });

  it("renders the page heading", async () => {
    renderGuide();
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /getting started/i })).toBeInTheDocument()
    );
  });

  it("shows a loading state before data arrives", () => {
    server.use(
      http.get("/api/onboarding/steps", async () => {
        await new Promise(() => {});
        return HttpResponse.json(MOCK_STEPS);
      })
    );
    renderGuide();
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it("renders the first step after loading", async () => {
    renderGuide();
    await waitFor(() =>
      expect(screen.getByText("Sign in to your workspace")).toBeInTheDocument()
    );
    expect(screen.getByText(/step 1 of 3/i)).toBeInTheDocument();
    expect(screen.getByText("Use your credentials.")).toBeInTheDocument();
  });

  it("shows the where/what/expect breakdown for each step", async () => {
    renderGuide();
    await waitFor(() =>
      expect(screen.getByText("Sign in to your workspace")).toBeInTheDocument()
    );
    expect(screen.getByText(/where to look/i)).toBeInTheDocument();
    expect(screen.getByText(/what to click/i)).toBeInTheDocument();
    expect(screen.getByText(/what to expect/i)).toBeInTheDocument();
    expect(screen.getByText("/login")).toBeInTheDocument();
    expect(screen.getByText("Enter username and password.")).toBeInTheDocument();
    expect(screen.getByText("You land on the Kanban board.")).toBeInTheDocument();
  });

  it("Previous button is disabled on the first step", async () => {
    renderGuide();
    await waitFor(() =>
      expect(screen.getByTestId("onboarding-prev")).toBeInTheDocument()
    );
    expect(screen.getByTestId("onboarding-prev")).toBeDisabled();
  });

  it("Next button advances to the second step", async () => {
    const user = userEvent.setup();
    renderGuide();
    await waitFor(() =>
      expect(screen.getByText("Sign in to your workspace")).toBeInTheDocument()
    );
    await user.click(screen.getByTestId("onboarding-next"));
    expect(screen.getByText("Create your first category")).toBeInTheDocument();
    expect(screen.getByText(/step 2 of 3/i)).toBeInTheDocument();
  });

  it("Previous button moves back after advancing", async () => {
    const user = userEvent.setup();
    renderGuide();
    await waitFor(() =>
      expect(screen.getByText("Sign in to your workspace")).toBeInTheDocument()
    );
    await user.click(screen.getByTestId("onboarding-next"));
    await user.click(screen.getByTestId("onboarding-prev"));
    expect(screen.getByText("Sign in to your workspace")).toBeInTheDocument();
  });

  it("Next button is disabled on the final step and shows 'All done'", async () => {
    const user = userEvent.setup();
    renderGuide();
    await waitFor(() =>
      expect(screen.getByText("Sign in to your workspace")).toBeInTheDocument()
    );
    await user.click(screen.getByTestId("onboarding-next"));
    await user.click(screen.getByTestId("onboarding-next"));
    expect(screen.getByText("Move cards across the Kanban board")).toBeInTheDocument();
    const next = screen.getByTestId("onboarding-next");
    expect(next).toBeDisabled();
    expect(next).toHaveTextContent(/all done/i);
  });

  it("progress dots are clickable and jump to a specific step", async () => {
    const user = userEvent.setup();
    renderGuide();
    await waitFor(() =>
      expect(screen.getByText("Sign in to your workspace")).toBeInTheDocument()
    );
    const dots = screen.getAllByRole("button", { name: /go to step/i });
    expect(dots).toHaveLength(3);
    await user.click(dots[2]);
    expect(screen.getByText("Move cards across the Kanban board")).toBeInTheDocument();
  });

  it("shows an error message when the API fails", async () => {
    server.use(
      http.get("/api/onboarding/steps", () =>
        HttpResponse.json({ detail: "boom" }, { status: 500 })
      )
    );
    renderGuide();
    await waitFor(() =>
      expect(screen.getByText(/failed to load/i)).toBeInTheDocument()
    );
  });
});
