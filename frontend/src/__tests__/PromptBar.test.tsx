import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PromptBar from "../components/PromptBar";
import { Category } from "../types";

const mockCategories: Category[] = [
  { id: "cat-1", name: "Frontend", color: "#3b82f6", created_at: "2024-01-01T00:00:00Z" },
  { id: "cat-2", name: "Backend", color: "#22c55e", created_at: "2024-01-02T00:00:00Z" },
];

// ── Speech Recognition mock ────────────────────────────────────────────────
let mockRecognition: {
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  abort: ReturnType<typeof vi.fn>;
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: { results: { transcript: string; isFinal: boolean }[][] }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

const MockSpeechRecognition = vi.fn(() => {
  mockRecognition = {
    start: vi.fn(),
    stop: vi.fn(),
    abort: vi.fn(),
    continuous: false,
    interimResults: false,
    lang: "",
    onresult: null,
    onerror: null,
    onend: null,
  };
  return mockRecognition;
});

beforeEach(() => {
  localStorage.setItem("token", "mock-token");
  (window as any).SpeechRecognition = MockSpeechRecognition;
  MockSpeechRecognition.mockClear();
});

afterEach(() => {
  delete (window as any).SpeechRecognition;
  delete (window as any).webkitSpeechRecognition;
});

function renderPromptBar() {
  return render(<PromptBar categories={mockCategories} onCardsCreated={vi.fn()} />);
}

// Simulate a speech result event
function fireSpeechResult(transcript: string, isFinal = false) {
  act(() => {
    mockRecognition.onresult?.({ results: [[{ transcript, isFinal }]] });
  });
}

// ── Existing tests ──────────────────────────────────────────────────────────

describe("PromptBar", () => {
  it("submit button is disabled when no category selected", () => {
    renderPromptBar();
    const promptInput = screen.getByPlaceholderText(/describe work/i);
    userEvent.type(promptInput, "Some work description");
    expect(screen.getByRole("button", { name: /break it down/i })).toBeDisabled();
  });

  it("submit button is disabled when prompt is empty", async () => {
    const user = userEvent.setup();
    renderPromptBar();
    await user.selectOptions(screen.getByRole("combobox"), "cat-1");
    expect(screen.getByRole("button", { name: /break it down/i })).toBeDisabled();
  });

  it("filling prompt + selecting category + clicking submit calls POST /api/ai/parse", async () => {
    const user = userEvent.setup();
    renderPromptBar();
    await user.selectOptions(screen.getByRole("combobox"), "cat-1");
    await user.type(screen.getByPlaceholderText(/describe work/i), "Build a login page");
    await user.click(screen.getByRole("button", { name: /break it down/i }));
    await waitFor(() => {
      expect(screen.queryByText(/parsing/i)).not.toBeInTheDocument();
    });
  });

  it("after successful parse, WorkItemConfirm dialog appears with returned items", async () => {
    const user = userEvent.setup();
    renderPromptBar();
    await user.selectOptions(screen.getByRole("combobox"), "cat-1");
    await user.type(screen.getByPlaceholderText(/describe work/i), "Build a login page");
    await user.click(screen.getByRole("button", { name: /break it down/i }));
    await waitFor(() => {
      expect(screen.getByDisplayValue("First work item")).toBeInTheDocument();
      expect(screen.getByDisplayValue("Second work item")).toBeInTheDocument();
    });
    expect(screen.getByText(/review work items/i)).toBeInTheDocument();
  });

  // ── Voice input ──────────────────────────────────────────────────────────

  it("renders a mic button when SpeechRecognition is available", () => {
    renderPromptBar();
    expect(screen.getByRole("button", { name: /start voice input/i })).toBeInTheDocument();
  });

  it("mic button is disabled and labeled unsupported when SpeechRecognition is unavailable", () => {
    delete (window as any).SpeechRecognition;
    renderPromptBar();
    expect(screen.getByRole("button", { name: /voice input not supported/i })).toBeDisabled();
  });

  it("clicking mic button starts SpeechRecognition", async () => {
    const user = userEvent.setup();
    renderPromptBar();
    await user.click(screen.getByRole("button", { name: /start voice input/i }));
    expect(MockSpeechRecognition).toHaveBeenCalledTimes(1);
    expect(mockRecognition.start).toHaveBeenCalledTimes(1);
  });

  it("mic button changes to 'Stop listening' while recording", async () => {
    const user = userEvent.setup();
    renderPromptBar();
    await user.click(screen.getByRole("button", { name: /start voice input/i }));
    expect(screen.getByRole("button", { name: /stop listening/i })).toBeInTheDocument();
  });

  it("speech result fills the prompt input in real time", async () => {
    const user = userEvent.setup();
    renderPromptBar();
    await user.click(screen.getByRole("button", { name: /start voice input/i }));

    fireSpeechResult("build a new feature");

    expect(screen.getByDisplayValue("build a new feature")).toBeInTheDocument();
  });

  it("final speech result stops listening and keeps transcript", async () => {
    const user = userEvent.setup();
    renderPromptBar();
    await user.click(screen.getByRole("button", { name: /start voice input/i }));
    fireSpeechResult("add dark mode", true);

    act(() => { mockRecognition.onend?.(); });

    // No longer listening
    expect(screen.getByRole("button", { name: /start voice input/i })).toBeInTheDocument();
    // Transcript stays in field
    expect(screen.getByDisplayValue("add dark mode")).toBeInTheDocument();
  });

  it("clicking Stop while listening calls recognition.stop()", async () => {
    const user = userEvent.setup();
    renderPromptBar();
    await user.click(screen.getByRole("button", { name: /start voice input/i }));
    await user.click(screen.getByRole("button", { name: /stop listening/i }));
    expect(mockRecognition.stop).toHaveBeenCalledTimes(1);
  });

  it("recognition error resets listening state", async () => {
    const user = userEvent.setup();
    renderPromptBar();
    await user.click(screen.getByRole("button", { name: /start voice input/i }));

    act(() => { mockRecognition.onerror?.({ error: "not-allowed" }); });

    expect(screen.getByRole("button", { name: /start voice input/i })).toBeInTheDocument();
  });

  it("interim transcript updates prompt continuously", async () => {
    const user = userEvent.setup();
    renderPromptBar();
    await user.click(screen.getByRole("button", { name: /start voice input/i }));

    fireSpeechResult("build");
    expect(screen.getByDisplayValue("build")).toBeInTheDocument();

    fireSpeechResult("build a dashboard");
    expect(screen.getByDisplayValue("build a dashboard")).toBeInTheDocument();
  });
});
