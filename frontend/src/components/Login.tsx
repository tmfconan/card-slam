import { useState, FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import api from "../api/client";

interface Captcha {
  challenge_id: string;
  question: string;
}

// The login error detail can be a plain string (legacy) or a structured object.
interface ErrorDetail {
  message?: string;
  captcha_required?: boolean;
  retry_after?: number;
}

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [captcha, setCaptcha] = useState<Captcha | null>(null);
  const [captchaAnswer, setCaptchaAnswer] = useState("");

  const refreshCaptcha = async () => {
    try {
      const { data } = await api.get<Captcha>("/auth/captcha");
      setCaptcha(data);
      setCaptchaAnswer("");
    } catch {
      // Non-fatal: the next failed attempt will try again.
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(
        username,
        password,
        captcha ? { id: captcha.challenge_id, answer: captchaAnswer } : undefined
      );
      navigate("/");
    } catch (err: unknown) {
      const resp = (err as { response?: { status?: number; data?: { detail?: string | ErrorDetail; captcha_required?: boolean } } })?.response;
      const detail = resp?.data?.detail;
      const detailObj: ErrorDetail | null =
        detail && typeof detail === "object" ? detail : null;
      const captchaRequired =
        detailObj?.captcha_required ?? resp?.data?.captcha_required ?? false;

      if (resp?.status === 429) {
        const retry = detailObj?.retry_after ?? 60;
        setError(
          `Too many failed attempts. Please try again in ${retry} second${
            retry === 1 ? "" : "s"
          }.`
        );
      } else if (resp?.status === 400 && captchaRequired) {
        setError(detailObj?.message ?? "Please complete the captcha.");
      } else {
        setError(
          typeof detail === "string"
            ? detail
            : detailObj?.message ?? "Invalid credentials"
        );
      }

      if (captchaRequired) {
        await refreshCaptcha();
      }
    } finally {
      setLoading(false);
    }
  };

  const submitDisabled =
    !username || !password || loading || (captcha !== null && !captchaAnswer);

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-2xl p-10 w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Card Slam</h1>
          <p className="text-gray-500 text-sm mt-2">Sign in to your workspace</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
              autoComplete="username"
              className="w-full border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Username"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="w-full border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter your password"
            />
          </div>
          {captcha && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {captcha.question}
              </label>
              <input
                type="text"
                value={captchaAnswer}
                onChange={(e) => setCaptchaAnswer(e.target.value)}
                autoComplete="off"
                inputMode="numeric"
                className="w-full border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Captcha answer"
              />
            </div>
          )}
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={submitDisabled}
            className="w-full bg-blue-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
