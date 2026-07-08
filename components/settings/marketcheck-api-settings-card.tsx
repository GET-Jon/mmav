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

type ApiSettingsResponse = {
  controls?: Partial<MarketCheckApiControls>;
  source?: string;
  error?: string;
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

function readLocalControls() {
  try {
    const stored = window.localStorage.getItem(
      MARKETCHECK_API_CONTROLS_STORAGE_KEY
    );

    if (stored) {
      return normalizeMarketCheckApiControls(JSON.parse(stored));
    }
  } catch {}

  return defaultMarketCheckApiControls;
}

function writeLocalControls(controls: MarketCheckApiControls) {
  try {
    window.localStorage.setItem(
      MARKETCHECK_API_CONTROLS_STORAGE_KEY,
      JSON.stringify(controls)
    );
  } catch {}
}

function readLocalLastRun() {
  try {
    const storedLastRun = window.localStorage.getItem(
      MARKETCHECK_LAST_API_USAGE_STORAGE_KEY
    );

    if (storedLastRun) {
      return JSON.parse(storedLastRun) as LastApiUsage;
    }
  } catch {}

  return null;
}

export function MarketCheckApiSettingsCard() {
  const [controls, setControls] = useState<MarketCheckApiControls>(
    defaultMarketCheckApiControls
  );
  const [lastApiUsage, setLastApiUsage] = useState<LastApiUsage | null>(null);
  const [status, setStatus] = useState("");
  const [settingsSource, setSettingsSource] = useState<
    "loading" | "database" | "local" | "defaults"
  >("loading");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadSettings() {
      await Promise.resolve();

      const localControls = readLocalControls();
      const localLastRun = readLocalLastRun();

      if (!cancelled) {
        setControls(localControls);
        setLastApiUsage(localLastRun);
        setSettingsSource("local");
      }

      try {
        const response = await fetch("/api/company/api-settings", {
          method: "GET",
          headers: {
            Accept: "application/json",
          },
        });

        const data = (await response.json()) as ApiSettingsResponse;

        if (!response.ok) {
          throw new Error(data.error || "Could not load user API settings.");
        }

        const databaseControls = normalizeMarketCheckApiControls(data.controls);

        writeLocalControls(databaseControls);

        if (!cancelled) {
          setControls(databaseControls);
          setSettingsSource(data.source === "database" ? "database" : "defaults");
          setStatus(
            data.source === "database"
              ? "Loaded company API settings."
              : "Loaded safe defaults. Save once to create company API settings."
          );
        }
      } catch (error) {
        if (!cancelled) {
          setSettingsSource("local");
          setStatus(
            error instanceof Error
              ? `Using browser fallback. ${error.message}`
              : "Using browser fallback. User API settings could not be loaded."
          );
        }
      }
    }

    void loadSettings();

    return () => {
      cancelled = true;
    };
  }, []);

  async function saveControls(nextControls: MarketCheckApiControls) {
    setSaving(true);

    try {
      const response = await fetch("/api/company/api-settings", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(nextControls),
      });

      const data = (await response.json()) as ApiSettingsResponse;

      if (!response.ok) {
        throw new Error(data.error || "Could not save user API settings.");
      }

      const savedControls = normalizeMarketCheckApiControls(data.controls);

      setControls(savedControls);
      writeLocalControls(savedControls);
      setSettingsSource("database");
      setStatus("Saved user API settings.");
    } catch (error) {
      writeLocalControls(nextControls);
      setSettingsSource("local");
      setStatus(
        error instanceof Error
          ? `Saved for this browser only. ${error.message}`
          : "Saved for this browser only. User API settings could not be updated."
      );
    } finally {
      setSaving(false);
    }
  }

  function updateControls(next: Partial<MarketCheckApiControls>) {
    const normalized = normalizeMarketCheckApiControls({
      ...controls,
      ...next,
    });

    setControls(normalized);
    writeLocalControls(normalized);
    setStatus("Saving user API settings...");
    void saveControls(normalized);
  }

  function resetControls() {
    setControls(defaultMarketCheckApiControls);
    writeLocalControls(defaultMarketCheckApiControls);
    setStatus("Saving safe defaults...");
    void saveControls(defaultMarketCheckApiControls);
  }

  function clearLastRun() {
    window.localStorage.removeItem(MARKETCHECK_LAST_API_USAGE_STORAGE_KEY);
    setLastApiUsage(null);
    setStatus("Last MarketCheck run cleared.");
  }

  const sourceLabel =
    settingsSource === "database"
      ? "Company database"
      : settingsSource === "defaults"
      ? "Safe defaults"
      : settingsSource === "loading"
      ? "Loading"
      : "Browser fallback";

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
            disabled={saving}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Reset Safe Defaults
          </button>
        </div>

        <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
          Source: {sourceLabel}. Changes are saved for your user profile,
          with browser fallback retained for safety.
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
              Browser-local audit trail for the most recent MarketCheck comp
              pull. Durable company usage history is the next v3 step.
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
                  The API can return more usable comps than the stop threshold
                  in a single call.
                </span>
              </div>
            ) : null}

            {(lastApiUsage as any).filterDiagnostics ? (
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <h3 className="text-base font-bold text-slate-950">
                  Comp Filtering Diagnostics
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Explains why returned MarketCheck listings did or did not become usable comps.
                </p>

                <div className="mt-4 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                  <div className="rounded-xl bg-slate-50 px-3 py-3">
                    <div className="text-xs font-black uppercase tracking-wide text-slate-500">
                      Returned
                    </div>
                    <div className="mt-1 text-lg font-black text-slate-950">
                      {(lastApiUsage as any).filterDiagnostics.returnedListings ?? 0}
                    </div>
                  </div>

                  <div className="rounded-xl bg-slate-50 px-3 py-3">
                    <div className="text-xs font-black uppercase tracking-wide text-slate-500">
                      Mapped
                    </div>
                    <div className="mt-1 text-lg font-black text-slate-950">
                      {(lastApiUsage as any).filterDiagnostics.mappedListings ?? 0}
                    </div>
                  </div>

                  <div className="rounded-xl bg-slate-50 px-3 py-3">
                    <div className="text-xs font-black uppercase tracking-wide text-slate-500">
                      Usable
                    </div>
                    <div className="mt-1 text-lg font-black text-emerald-700">
                      {(lastApiUsage as any).filterDiagnostics.usableListings ?? 0}
                    </div>
                  </div>

                  <div className="rounded-xl bg-slate-50 px-3 py-3">
                    <div className="text-xs font-black uppercase tracking-wide text-slate-500">
                      Rejected
                    </div>
                    <div className="mt-1 text-lg font-black text-red-700">
                      {(lastApiUsage as any).filterDiagnostics.rejectedListings ?? 0}
                    </div>
                  </div>
                </div>

                <div className="mt-4 rounded-xl border border-slate-200">
                  <div className="grid grid-cols-2 gap-0 divide-x divide-slate-200 text-sm md:grid-cols-4">
                    <div className="px-3 py-3">
                      <div className="text-xs font-black uppercase tracking-wide text-slate-500">
                        Fuel mismatch
                      </div>
                      <div className="mt-1 font-black text-slate-950">
                        {(lastApiUsage as any).filterDiagnostics.rejectionCounts?.fuelMismatch ?? 0}
                      </div>
                    </div>

                    <div className="px-3 py-3">
                      <div className="text-xs font-black uppercase tracking-wide text-slate-500">
                        Missing price/mileage
                      </div>
                      <div className="mt-1 font-black text-slate-950">
                        {(lastApiUsage as any).filterDiagnostics.rejectionCounts?.missingPriceOrMileage ?? 0}
                      </div>
                    </div>

                    <div className="px-3 py-3">
                      <div className="text-xs font-black uppercase tracking-wide text-slate-500">
                        Quality below threshold
                      </div>
                      <div className="mt-1 font-black text-slate-950">
                        {(lastApiUsage as any).filterDiagnostics.rejectionCounts?.qualityBelowThreshold ?? 0}
                      </div>
                    </div>

                    <div className="px-3 py-3">
                      <div className="text-xs font-black uppercase tracking-wide text-slate-500">
                        Other
                      </div>
                      <div className="mt-1 font-black text-slate-950">
                        {(lastApiUsage as any).filterDiagnostics.rejectionCounts?.other ?? 0}
                      </div>
                    </div>
                  </div>
                </div>

                {(lastApiUsage as any).filterDiagnostics.sampleRejectedListings?.length ? (
                  <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
                    <div className="bg-slate-50 px-3 py-3 text-xs font-black uppercase tracking-wide text-slate-500">
                      Sample rejected listings
                    </div>

                    <div className="divide-y divide-slate-100">
                      {(lastApiUsage as any).filterDiagnostics.sampleRejectedListings.map(
                        (listing: any, index: number) => (
                          <div key={`${listing.title || "listing"}-${index}`} className="px-3 py-3 text-sm">
                            <div className="font-bold text-slate-950">
                              {listing.title || "Untitled listing"}
                            </div>
                            <div className="mt-1 text-slate-600">
                              {[listing.year, listing.make, listing.model, listing.trim]
                                .filter(Boolean)
                                .join(" ")}
                            </div>
                            <div className="mt-1 flex flex-wrap gap-3 text-xs font-semibold text-slate-500">
                              <span>Fuel: {listing.fuelType || "—"}</span>
                              <span>Price: {listing.price ? `$${Number(listing.price).toLocaleString()}` : "—"}</span>
                              <span>Mileage: {listing.mileage ? Number(listing.mileage).toLocaleString() : "—"}</span>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {(listing.rejectedReasons || []).map((reason: string) => (
                                <span
                                  key={reason}
                                  className="rounded-full bg-red-50 px-2 py-1 text-xs font-bold text-red-700"
                                >
                                  {reason}
                                </span>
                              ))}
                            </div>
                          </div>
                        )
                      )}
                    </div>
                  </div>
                ) : null}
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
                      <tr
                        key={`${row.attemptName || row.label || "attempt"}-${index}`}
                        className="border-t border-slate-100"
                      >
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
