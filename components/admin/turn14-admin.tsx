"use client";

import { useState } from "react";

import type {
  Turn14CatalogProbe,
  Turn14ConnectionDiagnostics,
} from "@/lib/turn14/read-only";

export function Turn14Admin({ configured }: { configured: boolean }) {
  const [working, setWorking] = useState(false);
  const [catalogWorking, setCatalogWorking] = useState(false);
  const [diagnostics, setDiagnostics] = useState<Turn14ConnectionDiagnostics | null>(null);
  const [catalogResult, setCatalogResult] = useState<Turn14CatalogProbe | null>(null);
  const [query, setQuery] = useState("2021 BMW X7 headliner clips");
  const [itemId, setItemId] = useState("");
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

  async function runCatalogTest(mode: "catalog" | "inventory") {
    setCatalogWorking(true);
    setError("");
    setCatalogResult(null);
    try {
      const response = await fetch("/api/admin/turn14/catalog-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, query, itemId }),
      });
      const payload = (await response.json()) as {
        error?: string;
        result?: Turn14CatalogProbe;
      };
      if (!response.ok || !payload.result) {
        throw new Error(payload.error || "Catalog test failed.");
      }
      setCatalogResult(payload.result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Catalog test failed.");
    } finally {
      setCatalogWorking(false);
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Turn 14 Distribution</div>
            <h2 className="mt-1 text-2xl font-black text-slate-950">Read-only API connection</h2>
            <p className="mt-2 max-w-3xl text-sm font-medium leading-6 text-slate-500">
              Test authentication, then inspect catalog and inventory response shapes before connecting Turn 14 data to Parts sourcing.
            </p>
          </div>
          <div className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-black text-emerald-700">Ordering disabled</div>
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
            <div className="mt-1 text-sm font-black text-slate-800">GET-only catalog testing</div>
          </div>
          <div className="rounded-xl bg-slate-50 p-4">
            <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">Ordering code</div>
            <div className="mt-1 text-sm font-black text-emerald-700">Not implemented</div>
          </div>
        </div>

        <button type="button" onClick={() => void testConnection()} disabled={working} className="mt-5 rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-black text-white disabled:opacity-50">
          {working ? "Testing connection…" : "Test Turn 14 Connection"}
        </button>

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
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">Catalog probe</div>
            <h3 className="mt-1 text-xl font-black text-slate-950">Inspect Turn 14 data</h3>
            <p className="mt-1 max-w-3xl text-sm font-medium leading-6 text-slate-500">
              These tests issue authenticated GET requests only. No quote, order, purchase, or checkout request can be submitted from this screen.
            </p>
          </div>
          <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-black text-emerald-700">Read only</span>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 p-4">
            <div className="text-sm font-black text-slate-900">Catalog search probe</div>
            <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
              Starts with Turn 14&apos;s items collection so we can verify the live query contract and inspect returned product fields.
            </p>
            <input value={query} onChange={(event) => setQuery(event.target.value)} className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" placeholder="2021 BMW X7 headliner clips" />
            <button type="button" onClick={() => void runCatalogTest("catalog")} disabled={catalogWorking || !query.trim()} className="mt-3 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white disabled:opacity-40">
              {catalogWorking ? "Running GET…" : "Test catalog GET"}
            </button>
          </div>

          <div className="rounded-2xl border border-slate-200 p-4">
            <div className="text-sm font-black text-slate-900">Inventory-by-item probe</div>
            <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
              Once the catalog response gives us an item ID, paste it here to inspect its real-time inventory response.
            </p>
            <input value={itemId} onChange={(event) => setItemId(event.target.value)} className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" placeholder="Turn 14 item ID" />
            <button type="button" onClick={() => void runCatalogTest("inventory")} disabled={catalogWorking || !itemId.trim()} className="mt-3 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-black text-slate-800 disabled:opacity-40">
              {catalogWorking ? "Running GET…" : "Test inventory GET"}
            </button>
          </div>
        </div>

        {error ? <div className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">{error}</div> : null}

        {catalogResult ? (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${catalogResult.ok ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
                HTTP {catalogResult.status}
              </span>
              <span className="text-xs font-black text-slate-500">GET {catalogResult.endpoint}</span>
              {catalogResult.resultCount !== null ? <span className="text-xs font-bold text-slate-400">{catalogResult.resultCount} returned</span> : null}
            </div>
            <div className="mt-2 text-sm font-semibold text-slate-600">{catalogResult.message}</div>
            <pre className="mt-4 max-h-[520px] overflow-auto rounded-xl bg-slate-950 p-4 text-[11px] leading-5 text-slate-100">{JSON.stringify(catalogResult.data, null, 2)}</pre>
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">Safety boundary</div>
        <h3 className="mt-1 text-lg font-black text-slate-950">This phase cannot submit orders</h3>
        <p className="mt-2 max-w-4xl text-sm font-medium leading-6 text-slate-500">
          The only POST request in the Turn 14 client is the OAuth token exchange required to authenticate. Catalog and inventory tests are GET-only, and there are no quote, order, purchase, checkout, fulfillment, or generic write-request methods in the application client.
        </p>
      </section>
    </div>
  );
}
