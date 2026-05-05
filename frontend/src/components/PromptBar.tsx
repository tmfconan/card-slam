import { useState, useRef, useEffect } from "react";
import { Category, WorkItem } from "../types";
import api from "../api/client";
import WorkItemConfirm from "./WorkItemConfirm";
import QuickAddCard from "./QuickAddCard";

interface Props {
  categories: Category[];
  onCardsCreated: () => void;
}

// Resolve at call time (not module load) so tests can inject the mock
function getSpeechRecognition(): (new () => SpeechRecognition) | null {
  if (typeof window === "undefined") return null;
  return (
    window.SpeechRecognition ??
    (window as Window & { webkitSpeechRecognition?: new () => SpeechRecognition })
      .webkitSpeechRecognition ??
    null
  );
}

export default function PromptBar({ categories, onCardsCreated }: Props) {
  const [prompt, setPrompt] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [loading, setLoading] = useState(false);
  const [workItems, setWorkItems] = useState<WorkItem[] | null>(null);
  const [error, setError] = useState("");
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const speechSupported = !!getSpeechRecognition();

  // Clean up recognition on unmount
  useEffect(() => {
    return () => { recognitionRef.current?.abort(); };
  }, []);

  const selectedCategory = categories.find((c) => c.id === categoryId);

  const handleSubmit = async () => {
    if (!prompt.trim() || !categoryId) return;
    setLoading(true);
    setError("");
    try {
      const res = await api.post("/ai/parse", {
        prompt: prompt.trim(),
        category_id: categoryId,
      });
      setWorkItems(res.data.items);
    } catch {
      setError("Failed to parse. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmed = () => {
    setWorkItems(null);
    setPrompt("");
    onCardsCreated();
  };

  const toggleVoice = () => {
    const Ctor = getSpeechRecognition();
    if (!Ctor) return;

    if (listening) {
      recognitionRef.current?.stop();
      return;
    }

    const rec = new Ctor();
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = "en-US";

    rec.onresult = (e: SpeechRecognitionEvent) => {
      const transcript = Array.from(e.results)
        .map((r) => r[0].transcript)
        .join("");
      setPrompt(transcript);
    };

    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);

    recognitionRef.current = rec;
    rec.start();
    setListening(true);
  };

  const micLabel = !speechSupported
    ? "Voice input not supported"
    : listening
    ? "Stop listening"
    : "Start voice input";

  return (
    <>
      <div className="bg-white border-b px-3 sm:px-6 py-3 flex-shrink-0">
        <div className="flex items-center gap-2 sm:gap-3">
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="border rounded-lg px-2 sm:px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[110px] sm:min-w-[150px]"
            style={
              selectedCategory
                ? { borderColor: selectedCategory.color, color: selectedCategory.color }
                : {}
            }
          >
            <option value="">Category…</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>

          <div className="flex-1 flex items-center gap-1.5 border rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-blue-500">
            <input
              type="text"
              placeholder="Describe work to do — Claude will break it into cards"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSubmit()}
              disabled={loading}
              className="flex-1 px-3 sm:px-4 py-2 text-sm focus:outline-none disabled:opacity-50 min-w-0"
            />
            {/* Mic button — inline with the text field */}
            <button
              type="button"
              onClick={toggleVoice}
              disabled={!speechSupported}
              aria-label={micLabel}
              title={micLabel}
              className={`px-2.5 py-2 flex-shrink-0 transition-colors ${
                !speechSupported
                  ? "text-gray-300 cursor-not-allowed"
                  : listening
                  ? "text-red-500 animate-pulse"
                  : "text-gray-400 hover:text-blue-500"
              }`}
            >
              {listening ? (
                // Stop / recording indicator
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="4" y="4" width="16" height="16" rx="2" />
                </svg>
              ) : (
                // Microphone
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="2" width="6" height="12" rx="3" />
                  <path d="M5 10a7 7 0 0 0 14 0" />
                  <line x1="12" y1="19" x2="12" y2="22" />
                  <line x1="8" y1="22" x2="16" y2="22" />
                </svg>
              )}
            </button>
          </div>

          <button
            onClick={handleSubmit}
            disabled={!prompt.trim() || !categoryId || loading}
            className="px-3 sm:px-5 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap transition-colors"
          >
            {loading ? "Parsing…" : "Break it down"}
          </button>

          <button
            onClick={() => setShowQuickAdd(true)}
            className="hidden sm:block px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 whitespace-nowrap transition-colors text-gray-700"
          >
            + Direct add
          </button>
        </div>
        {error && <p className="text-red-500 text-xs mt-1.5">{error}</p>}
        {categories.length === 0 && (
          <p className="text-xs text-amber-600 mt-1.5">
            Create a category first before adding cards.
          </p>
        )}
      </div>

      {workItems && (
        <WorkItemConfirm
          items={workItems}
          categoryId={categoryId}
          categories={categories}
          onConfirm={handleConfirmed}
          onCancel={() => setWorkItems(null)}
        />
      )}

      {showQuickAdd && (
        <QuickAddCard
          categories={categories}
          onCardCreated={onCardsCreated}
          onClose={() => setShowQuickAdd(false)}
        />
      )}
    </>
  );
}
