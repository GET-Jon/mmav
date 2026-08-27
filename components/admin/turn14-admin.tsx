"use client";

import { useState } from "react";

import type { Turn14ConnectionDiagnostics } from "@/lib/turn14/read-only";

export function Turn14Admin({ configured }: { configured: boolean }) {
  const [working, setWorking] = useState(false);
  const [diagnostics, setDiagnostics] = useState<Turn14ConnectionDiagnostics | null>(null);
  const [error, setError] = useState("");

  async function testConnection() {
    setWorking(true);
    setError("");
    try {
      const response = await fetch("/api/admin/turn14/diagnostics", {
        method: "POST",
      });
      const payload = (await response.json()) as {
        error?: string;
        diagnostics?: Turn14ConnectionDiagnostics;
      };
      if (!response.ok || !payload.diagnostics) {
        throw new Error(payload.error || "Connection test failed.");
      }
      setDiagnostics(payload.diagnostics);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Connection test failed.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
              Turn 14 Distribution
            </div>
            <h2 className="mt-1 text-2xl font-black text-slate-950">Read-only API connection</h2>
            <p className="mt-2 max-w-3xl text-sm font-medium leading-6 text-slate-500">
              Test authentication before connecting catalog, fitment, inventory, and pricing data to Parts sourcing.
            </p>
          </div>
          <div className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-black text-emerald-700">
            Ordering disabled
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <div className="rounded-xl bg-slate-50 p-4">
            <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">Credentials</div>
            <div className={`mt-1 text-sm font-black ${configured ? "text-emerald-700" : "text-amber-700"}`}>
              {configured ? "Available to server" : "Not detected"}
            </div>
          </div>
          <div className="rounded-xl bg-slate-50 p-4">
            <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">Mode</div>
            <div className="mt-1 text-sm font-black text-slate-800">Read-only testing</div>
          </div>
          <div className="rounded-xl bg-slate-50 p-4">
            <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">Ordering code</div>
            <div className="mt-1 text-sm font-black text-emerald-700">Not implemented</div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void testConnection()}
          disabled={working}
          className="mt-5 rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-black text-white disabled:opacity-50"
        >
          {working ? "Testing connection…" : "Test Turn 14 Connection"}
        </button>

        {error ? (
          <div className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">{error}</div>
        ) : null}

        {diagnostics ? (
          <div className={`mt-4 rounded-xl px-4 py-4 ${diagnostics.authenticated ? "bg-emerald-50" : "bg-amber-50"}`}>
            <div className={`text-sm font-black ${diagnostics.authenticated ? "text-emerald-800" : "text-amber-800"}`}>
              {diagnostics.authenticated ? "Authentication successful" : "Authentication not successful"}
            </div>
            <div className="mt-1 text-sm font-medium text-slate-600">{diagnostics.message}</div>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs font-bold text-slate-500">
              <span>API: {diagnostics.apiBase}</span>
              {diagnostics.tokenType ? <span>Token: {diagnostics.tokenType}</span> : null}
              {diagnostics.expiresInSeconds ? <span>Expires: {diagnostics.expiresInSeconds}s</span> : null}
              <span>Ordering: disabled</span>
            </div>
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">Safety boundary</div>
        <h3 className="mt-1 text-lg font-black text-slate-950">This phase cannot submit orders</h3>
        <p className="mt-2 max-w-4xl text-sm font-medium leading-6 text-slate-500">
          The Turn 14 integration currently contains only OAuth authentication diagnostics. There are no quote, order, purchase, checkout, fulfillment, or generic write-request methods in the application client. Catalog reads will be added next after authentication is confirmed.
        </p>
      </section>
    </div>
  );
}
