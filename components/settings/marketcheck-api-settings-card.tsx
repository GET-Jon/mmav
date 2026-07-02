"use client";

import { useEffect, useState } from "react";
import {
  MARKETCHECK_API_CONTROLS_STORAGE_KEY,
  MARKETCHECK_LAST_API_USAGE_STORAGE_KEY,
  defaultMarketCheckApiControls,
  normalizeMarketCheckApiControls,
  type MarketCheckApiControls,
} from "@/lib/marketcheck/api-controls";

type MarketCheckSearchLogRow = {
  attemptName?: string;
  label?: string;
  region?: string;
  market?: string;
  zip?: string;
  status?: number;
  found?: number;
  foundCount?: number;
  totalFound?: number;
  numFound?: number;
  returned?: number;
  returnedCount?: number;
  listingCount?: number;
  usable?: number;
  usableCount?: number;
  usableCompCount?: number;
  usableComps?: number;
  cumulativeUsableComps?: number;
};

type LastApiUsage = {
  apiCallsMade?: number;
  cacheHit?: boolean;
  stopReason?: string;
  usableCompCount?: number;
  failedStatus?: number;
  retryAfter?: string | null;
  savedAt?: string;
  searchLog?: MarketCheckSearchLogRow[];
};

function numberFromInput(value: string) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return parsed;
}

function formatSavedAt(value?: string) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleString();
}


function pickNumber(...values: Array<number | undefined>) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }

  return 0;
}

export function MarketCheckApiSettingsCard() {
  const [controls, setControls] = useState<MarketCheckApiControls>(
    defaultMarketCheckApiControls
  );
  const [lastApiUsage, setLastApiUsage] = useState<LastApiUsage | null>(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(
        MARKETCHECK_API_CONTROLS_STORAGE_KEY
      );

      if (stored) {
        setControls(normalizeMarketCheckApiControls(JSON.parse(stored)));
      }
    } catch {
      setControls(defaultMarketCheckApiControls);
    }

    try {
      const storedLastRun = window.localStorage.getItem(
        MARKETCHECK_LAST_API_USAGE_STORAGE_KEY
      );

      if (storedLastRun) {
        setLastApiUsage(JSON.parse(storedLastRun));
      }
    } catch {
      setLastApiUsage(null);
    }
  }, []);

  function updateControls(next: Partial<MarketCheckApiControls>) {
    const normalized = normalizeMarketCheckApiControls({
      ...controls,
      ...next,
    });

    setControls(normalized);

    window.localStorage.setItem(
      MARKETCHECK_API_CONTROLS_STORAGE_KEY,
      JSON.stringify(normalized)
    );

    setStatus("Saved for this browser.");
  }

  function resetControls() {
    setControls(defaultMarketCheckApiControls);

    window.localStorage.setItem(
      MARKETCHECK_API_CONTROLS_STORAGE_KEY,
      JSON.stringify(defaultMarketCheckApiControls)
    );

    setStatus("Reset to safe defaults.");
  }

  function clearLastRun() {
    window.localStorage.removeItem(MARKETCHECK_LAST_API_USAGE_STORAGE_KEY);
    setLastApiUsage(null);
    setStatus("Last MarketCheck run cleared.");
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-5 flex flex-col justify-between gap-3 md:flex-row md:items-start">
          <div>
            <h2 className="text-xl font-bold">MarketCheck API Usage</h2>
            <p className="mt-1 max-w-3xl text-sm text-slate-600">
              Controls for live MarketCheck lookup behavior. These settings are
              intentionally conservative to avoid unnecessary API calls.
            </p>
          </div>

          <button
            type="button"
            onClick={resetControls}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            Reset Safe Defaults
          </button>
        </div>

        <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
          These controls are stored locally in this browser for now. Company-level
          database-backed API settings can be added next.
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <span>
              <span className="block text-xs font-black uppercase tracking-wide text-slate-500">
                Live Lookup
              </span>
              <span className="mt-1 block text-sm font-semibold text-slate-700">
                Allow live MarketCheck calls
              </span>
            </span>

            <input
              type="checkbox"
              checked={controls.liveLookupEnabled}
              onChange={(event) =>
                updateControls({
                  liveLookupEnabled: event.target.checked,
                })
              }
            />
          </label>

          <label className="block rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="text-xs font-black uppercase tracking-wide text-slate-500">
              Max API Calls
            </div>
            <input
              type="number"
              min={1}
              max={10}
              value={controls.maxApiCallsPerSearch}
              onChange={(event) =>
                updateControls({
                  maxApiCallsPerSearch: numberFromInput(event.target.value),
                })
              }
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-right text-sm font-bold text-slate-900 shadow-sm outline-none"
            />
          </label>

          <label className="block rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="text-xs font-black uppercase tracking-wide text-slate-500">
              Stop After Usable Comps
            </div>
            <input
              type="number"
              min={1}
              max={50}
              value={controls.minUsableCompsToStop}
              onChange={(event) =>
                updateControls({
                  minUsableCompsToStop: numberFromInput(event.target.value),
                })
              }
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-right text-sm font-bold text-slate-900 shadow-sm outline-none"
            />
          </label>

          <label className="block rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="text-xs font-black uppercase tracking-wide text-slate-500">
              Minimum Initial Regions
            </div>
            <input
              type="number"
              min={1}
              max={10}
              value={controls.minInitialRegions}
              onChange={(event) =>
                updateControls({
                  minInitialRegions: numberFromInput(event.target.value),
                })
              }
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-right text-sm font-bold text-slate-900 shadow-sm outline-none"
            />
          </label>
        </div>

        {status ? (
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
            {status}
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-col justify-between gap-3 md:flex-row md:items-start">
          <div>
            <h2 className="text-xl font-bold">Last MarketCheck Run</h2>
            <p className="mt-1 text-sm text-slate-600">
              Browser-local audit trail for the most recent MarketCheck comp pull. This does not clear the active evaluator results.
            </p>
          </div>

          <button
            type="button"
            onClick={clearLastRun}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            Clear Saved API Log
          </button>
        </div>

        {lastApiUsage ? (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800">
              <span>
                Saved{" "}
                <span className="font-bold">
                  {formatSavedAt(lastApiUsage.savedAt)}
                </span>
              </span>
              <span>
                Cache{" "}
                <span className="font-bold">
                  {lastApiUsage.cacheHit ? "Hit" : "Miss"}
                </span>
              </span>
              <span>
                API calls{" "}
                <span className="font-bold">
                  {lastApiUsage.apiCallsMade ?? 0}
                </span>
              </span>
              <span>
                Usable comps{" "}
                <span className="font-bold">
                  {lastApiUsage.usableCompCount ?? 0}
                </span>
              </span>
            </div>

            {lastApiUsage.stopReason ? (
              <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-800">
                {lastApiUsage.stopReason}
                <span className="ml-2 font-semibold text-slate-500">
                  The API can return more usable comps than the stop threshold in a single call.
                </span>
              </div>
            ) : null}

            {lastApiUsage.searchLog?.length ? (
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-3">Attempt</th>
                      <th className="px-3 py-3">Region</th>
                      <th className="px-3 py-3">Status</th>
                      <th className="px-3 py-3">Found</th>
                      <th className="px-3 py-3">Returned</th>
                      <th className="px-3 py-3">Usable</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lastApiUsage.searchLog.map((row, index) => (
                      <tr key={`${row.attemptName || row.label || "attempt"}-${index}`} className="border-t border-slate-100">
                        <td className="px-3 py-3 font-bold text-slate-800">
                          {row.attemptName || row.label || "MarketCheck search"}
                        </td>
                        <td className="px-3 py-3 text-slate-700">
                          {row.region || row.market || row.zip || "—"}
                        </td>
                        <td className="px-3 py-3">
                          {row.status ? (
                            <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-bold text-emerald-700">
                              {row.status}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-3 py-3">
                          {pickNumber(
                            row.found,
                            row.foundCount,
                            row.totalFound,
                            row.numFound
                          )}
                        </td>
                        <td className="px-3 py-3">
                          {pickNumber(
                            row.returned,
                            row.returnedCount,
                            row.listingCount
                          )}
                        </td>
                        <td className="px-3 py-3">
                          {pickNumber(
                            row.usable,
                            row.usableCount,
                            row.usableCompCount,
                            row.usableComps
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600">
                No search log saved yet.
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600">
            No MarketCheck run saved yet.
          </div>
        )}
      </section>
    </div>
  );
}
