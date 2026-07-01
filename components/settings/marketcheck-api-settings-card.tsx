"use client";

import { useEffect, useState } from "react";
import {
  MARKETCHECK_API_CONTROLS_STORAGE_KEY,
  defaultMarketCheckApiControls,
  normalizeMarketCheckApiControls,
  type MarketCheckApiControls,
} from "@/lib/marketcheck/api-controls";

function numberFromInput(value: string) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return parsed;
}

export function MarketCheckApiSettingsCard() {
  const [controls, setControls] = useState<MarketCheckApiControls>(
    defaultMarketCheckApiControls
  );
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

  return (
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
  );
}
