import { useState, useEffect } from "react";
import { Category } from "../types";
import api from "../api/client";

interface ZohoCalendarInfo {
  uid: string;
  name: string;
}

interface SyncResult {
  created: number;
  updated: number;
  skipped: number;
}

interface Props {
  categories: Category[];
  onUpdate: () => void;   // refresh cards after a sync
  onClose: () => void;
  // When the modal opens right after the OAuth redirect: "connected" | "error" | null
  oauthReturn?: "connected" | "error" | null;
}

const RANGE_OPTIONS = [
  { days: 7, label: "Next 7 days" },
  { days: 14, label: "Next 14 days" },
  { days: 31, label: "Next 31 days" },
];

export default function ZohoSyncModal({ categories, onUpdate, onClose, oauthReturn }: Props) {
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [calendars, setCalendars] = useState<ZohoCalendarInfo[]>([]);
  const [calendarUid, setCalendarUid] = useState("");
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [days, setDays] = useState(31);
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState(
    oauthReturn === "error" ? "Couldn't connect to Zoho. Please try again." : ""
  );

  // Load connection status (and calendars if already connected) on open.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const status = await api.get("/integrations/zoho/status");
        if (!active) return;
        if (status.data.connected) {
          setConnected(true);
          await loadCalendars(active);
        }
      } catch {
        if (active) setError("Couldn't load Zoho connection status.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadCalendars = async (active = true) => {
    try {
      const res = await api.get("/integrations/zoho/calendars");
      if (!active) return;
      const cals: ZohoCalendarInfo[] = res.data ?? [];
      setCalendars(cals);
      if (cals.length > 0) setCalendarUid((prev) => prev || cals[0].uid);
    } catch {
      if (active) setError("Couldn't load your Zoho calendars.");
    }
  };

  const connect = async () => {
    setError("");
    try {
      const res = await api.get("/integrations/zoho/authorize");
      // Full-page redirect to Zoho consent; we return via the calendar route.
      window.location.href = res.data.url;
    } catch {
      setError("Couldn't start the Zoho connection.");
    }
  };

  const disconnect = async () => {
    await api.post("/integrations/zoho/disconnect");
    setConnected(false);
    setCalendars([]);
    setCalendarUid("");
    setResult(null);
  };

  const sync = async () => {
    if (!calendarUid || !categoryId) return;
    setSyncing(true);
    setError("");
    setResult(null);
    try {
      const res = await api.post("/integrations/zoho/sync", {
        calendar_uid: calendarUid,
        category_id: categoryId,
        days,
      });
      setResult(res.data);
      onUpdate();
    } catch {
      setError("Sync failed. Please try again.");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-md flex flex-col">
        <div className="p-6 border-b dark:border-gray-700">
          <h2 className="text-lg font-semibold">Sync Zoho Calendar</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Import events from a Zoho calendar as cards.
          </p>
        </div>

        <div className="p-6 space-y-4">
          {loading ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>
          ) : !connected ? (
            <div className="space-y-3">
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Connect your Zoho account to import calendar events.
              </p>
              <button
                onClick={connect}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Connect Zoho Calendar
              </button>
            </div>
          ) : (
            <>
              <div>
                <label htmlFor="zoho-calendar" className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                  Calendar
                </label>
                <select
                  id="zoho-calendar"
                  value={calendarUid}
                  onChange={(e) => setCalendarUid(e.target.value)}
                  className="w-full text-sm border rounded-lg px-2 py-1.5 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 focus:outline-none"
                >
                  {calendars.length === 0 && <option value="">No calendars found</option>}
                  {calendars.map((c) => (
                    <option key={c.uid} value={c.uid}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="zoho-category" className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                  Add cards to category
                </label>
                <select
                  id="zoho-category"
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full text-sm border rounded-lg px-2 py-1.5 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 focus:outline-none"
                >
                  {categories.length === 0 && <option value="">No categories</option>}
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="zoho-range" className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                  Import events for
                </label>
                <select
                  id="zoho-range"
                  value={days}
                  onChange={(e) => setDays(Number(e.target.value))}
                  className="w-full text-sm border rounded-lg px-2 py-1.5 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 focus:outline-none"
                >
                  {RANGE_OPTIONS.map((o) => (
                    <option key={o.days} value={o.days}>{o.label}</option>
                  ))}
                </select>
              </div>

              {result && (
                <p className="text-sm text-green-700 dark:text-green-400" role="status">
                  Done — {result.created} created, {result.updated} updated, {result.skipped} unchanged.
                </p>
              )}

              <button
                onClick={disconnect}
                className="text-xs text-gray-400 hover:text-red-500 transition-colors"
              >
                Disconnect Zoho
              </button>
            </>
          )}

          {error && (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">{error}</p>
          )}
        </div>

        <div className="p-6 border-t dark:border-gray-700 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            disabled={syncing}
            className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100 disabled:opacity-50"
          >
            Close
          </button>
          {connected && (
            <button
              onClick={sync}
              disabled={syncing || !calendarUid || !categoryId}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {syncing ? "Syncing…" : "Sync now"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
