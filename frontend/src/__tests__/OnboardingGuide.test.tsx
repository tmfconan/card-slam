import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../test/server";
import OnboardingGuide from "../components/OnboardingGuide";

const MOCK_STEPS = {
  steps: [
    {
      id: 1,
      title: "Get oriented in the sidebar",
      summary: "The sidebar is your main navigation.",
      location: "Left edge of the screen",
      action: "Look at the sidebar links.",
      expect: "The active page is highlighted.",
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

function renderGuide({ open = true }: { open?: boolean } = {}) {
  localStorage.setItem("token", "mock-token");
  const onClose = vi.fn();
  const result = render(<OnboardingGuide open={open} onClose={onClose} />);
  return { ...result, onClose };
}

describe("OnboardingGuide", () => {
  beforeEach(() => {
    server.use(
      http.get("/api/onboarding/steps", () => HttpResponse.json(MOCK_STEPS))
    );
  });

  it("renders nothing when closed", () => {
    renderGuide({ open: false });
    expect(screen.queryByTestId("onboarding-modal")).not.toBeInTheDocument();
  });

  it("renders the modal heading when open", async () => {
    renderGuide();
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: /getting started/i })
      ).toBeInTheDocument()
    );
    expect(screen.getByTestId("onboarding-modal")).toBeInTheDocument();
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
      expect(
        screen.getByText("Get oriented in the sidebar")
      ).toBeInTheDocument()
    );
    expect(screen.getByText(/step 1 of 3/i)).toBeInTheDocument();
    expect(screen.getByText("The sidebar is your main navigation.")).toBeInTheDocument();
  });

  it("shows the where/what/expect breakdown for each step", async () => {
    renderGuide();
    await waitFor(() =>
      expect(
        screen.getByText("Get oriented in the sidebar")
      ).toBeInTheDocument()
    );
    expect(screen.getByText(/where to look/i)).toBeInTheDocument();
    expect(screen.getByText(/what to click/i)).toBeInTheDocument();
    expect(screen.getByText(/what to expect/i)).toBeInTheDocument();
    expect(screen.getByText("Left edge of the screen")).toBeInTheDocument();
    expect(screen.getByText("Look at the sidebar links.")).toBeInTheDocument();
    expect(screen.getByText("The active page is highlighted.")).toBeInTheDocument();
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
      expect(
        screen.getByText("Get oriented in the sidebar")
      ).toBeInTheDocument()
    );
    await user.click(screen.getByTestId("onboarding-next"));
    expect(screen.getByText("Create your first category")).toBeInTheDocument();
    expect(screen.getByText(/step 2 of 3/i)).toBeInTheDocument();
  });

  it("Previous button moves back after advancing", async () => {
    const user = userEvent.setup();
    renderGuide();
    await waitFor(() =>
      expect(
        screen.getByText("Get oriented in the sidebar")
      ).toBeInTheDocument()
    );
    await user.click(screen.getByTestId("onboarding-next"));
    await user.click(screen.getByTestId("onboarding-prev"));
    expect(
      screen.getByText("Get oriented in the sidebar")
    ).toBeInTheDocument();
  });

  it("Next button on the final step is labelled 'All done' and closes the modal", async () => {
    const user = userEvent.setup();
    const { onClose } = renderGuide();
    await waitFor(() =>
      expect(
        screen.getByText("Get oriented in the sidebar")
      ).toBeInTheDocument()
    );
    await user.click(screen.getByTestId("onboarding-next"));
    await user.click(screen.getByTestId("onboarding-next"));
    expect(
      screen.getByText("Move cards across the Kanban board")
    ).toBeInTheDocument();
    const next = screen.getByTestId("onboarding-next");
    expect(next).toHaveTextContent(/all done/i);
    await user.click(next);
    expect(onClose).toHaveBeenCalled();
  });

  it("progress dots are clickable and jump to a specific step", async () => {
    const user = userEvent.setup();
    renderGuide();
    await waitFor(() =>
      expect(
        screen.getByText("Get oriented in the sidebar")
      ).toBeInTheDocument()
    );
    const dots = screen.getAllByRole("button", { name: /go to step/i });
    expect(dots).toHaveLength(3);
    await user.click(dots[2]);
    expect(
      screen.getByText("Move cards across the Kanban board")
    ).toBeInTheDocument();
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

  it("close button invokes onClose", async () => {
    const user = userEvent.setup();
    const { onClose } = renderGuide();
    await waitFor(() =>
      expect(screen.getByTestId("onboarding-close")).toBeInTheDocument()
    );
    await user.click(screen.getByTestId("onboarding-close"));
    expect(onClose).toHaveBeenCalled();
  });

  it("clicking the backdrop dismisses the modal", async () => {
    const user = userEvent.setup();
    const { onClose } = renderGuide();
    await waitFor(() =>
      expect(screen.getByTestId("onboarding-modal")).toBeInTheDocument()
    );
    await user.click(screen.getByTestId("onboarding-modal"));
    expect(onClose).toHaveBeenCalled();
  });

  it("pressing Escape dismisses the modal", async () => {
    const user = userEvent.setup();
    const { onClose } = renderGuide();
    await waitFor(() =>
      expect(screen.getByTestId("onboarding-modal")).toBeInTheDocument()
    );
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  it("exposes dialog semantics for screen readers", async () => {
    renderGuide();
    await waitFor(() =>
      expect(screen.getByTestId("onboarding-modal")).toBeInTheDocument()
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
  });
});
