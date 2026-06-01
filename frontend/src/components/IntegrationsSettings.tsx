import { useState, useEffect, useCallback } from "react";
import api from "../api/client";

interface ZohoConfigStatus {
  configured: boolean;
  client_id: string | null;
}

function ZohoCard() {
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(false);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<ZohoConfigStatus>("/integrations/admin/zoho/config");
      setConfigured(data.configured);
      setClientId(data.client_id ?? "");
    } catch {
      setError("Couldn't load Zoho configuration.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientId.trim()) return;
    // A new (not-yet-configured) integration requires the secret.
    if (!configured && !clientSecret) {
      setError("Client secret is required.");
      return;
    }
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      await api.put("/integrations/admin/zoho/config", {
        client_id: clientId.trim(),
        client_secret: clientSecret,   // blank keeps the stored secret
      });
      setClientSecret("");
      setSaved(true);
      await load();
    } catch {
      setError("Couldn't save Zoho configuration.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!confirm("Remove the Zoho credentials? Users won't be able to sync until they're re-entered.")) return;
    await api.delete("/integrations/admin/zoho/config");
    setClientId("");
    setClientSecret("");
    setConfigured(false);
    setSaved(false);
  };

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border dark:border-gray-700 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Zoho Calendar</h3>
        {configured ? (
          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-green-100 text-green-700">
            Configured
          </span>
        ) : (
          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-600">
            Not configured
          </span>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-gray-400 py-2">Loading…</p>
      ) : (
        <form onSubmit={save} className="space-y-3">
          <div>
            <label htmlFor="zoho-client-id" className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              Client ID
            </label>
            <input
              id="zoho-client-id"
              type="text"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              autoComplete="off"
              className="w-full border dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder-gray-500 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label htmlFor="zoho-client-secret" className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              Client Secret
            </label>
            <input
              id="zoho-client-secret"
              type="password"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              autoComplete="new-password"
              placeholder={configured ? "•••••••• (unchanged)" : ""}
              className="w-full border dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder-gray-500 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-400 mt-1">
              Stored encrypted. Leave blank to keep the existing secret.
            </p>
          </div>

          {error && <p className="text-red-500 text-xs">{error}</p>}
          {saved && <p className="text-green-600 text-xs">Saved.</p>}

          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={saving || !clientId.trim()}
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            {configured && (
              <button
                type="button"
                onClick={remove}
                className="text-xs text-gray-400 hover:text-red-500 transition-colors"
              >
                Remove
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}

function ComingSoonCard({ name }: { name: string }) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border dark:border-gray-700 p-5 opacity-60">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">{name}</h3>
        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-600">
          Coming soon
        </span>
      </div>
    </div>
  );
}

export default function IntegrationsSettings() {
  return (
    <div className="p-6 max-w-2xl">
      <h2 className="text-xl font-semibold mb-2">Integrations</h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        Configure calendar provider credentials. Each user connects their own account from the Calendar screen.
      </p>
      <div className="space-y-4">
        <ZohoCard />
        <ComingSoonCard name="Google Calendar" />
        <ComingSoonCard name="Outlook Calendar" />
      </div>
    </div>
  );
}
