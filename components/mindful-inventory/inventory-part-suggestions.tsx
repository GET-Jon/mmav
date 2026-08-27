"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import type { InventoryPartView } from "@/lib/mindful-inventory/parts-transport";
import type { PartSearchSuggestion } from "@/lib/mindful-inventory/part-suggestions";

function confidenceClass(value: PartSearchSuggestion["confidence"]) {
  if (value === "high") return "bg-emerald-50 text-emerald-700";
  if (value === "verify") return "bg-amber-50 text-amber-800";
  return "bg-blue-50 text-blue-700";
}

export function InventoryPartSuggestions({
  vehicleId,
  suggestions,
  parts,
}: {
  vehicleId: string;
  suggestions: PartSearchSuggestion[];
  parts: InventoryPartView[];
}) {
  const router = useRouter();
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const trackedWorkOrders = useMemo(
    () => new Set(parts.filter((part) => part.status !== "cancelled").map((part) => part.workOrderId)),
    [parts],
  );

  async function copyQuery(suggestion: PartSearchSuggestion) {
    await navigator.clipboard.writeText(suggestion.searchQuery);
    setCopiedId(suggestion.workOrderId);
    window.setTimeout(() => setCopiedId((current) => current === suggestion.workOrderId ? null : current), 1400);
  }

  async function addSuggestedPart(suggestion: PartSearchSuggestion) {
    setWorkingId(suggestion.workOrderId);
    setMessage("");
    try {
      const response = await fetch(`/api/mindful/inventory/vehicles/${vehicleId}/parts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workOrderId: suggestion.workOrderId,
          description: suggestion.partName,
          quantity: 1,
          sourceType: "other",
          notes: `Lot Logic suggested sourcing search: ${suggestion.searchQuery}. Verify exact fitment before ordering.`,
        }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Failed to add suggested part.");
      setMessage(`${suggestion.partName} added to Parts as Needed.`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to add suggested part.");
    } finally {
      setWorkingId(null);
    }
  }

  if (suggestions.length === 0) return null;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">Lot Logic Sourcing</div>
          <h2 className="mt-1 text-xl font-black text-slate-950">Suggested Parts & Search Links</h2>
          <p className="mt-1 max-w-3xl text-sm font-medium leading-6 text-slate-500">
            Lot Logic builds fitment-aware searches from the vehicle and each Work Order. These links are starting points, not verified-fit guarantees.
          </p>
        </div>
        <div className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
          Verify fitment before ordering
        </div>
      </div>

      {message ? <div className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700">{message}</div> : null}

      <div className="mt-5 grid gap-3 xl:grid-cols-2">
        {suggestions.map((suggestion) => {
          const tracked = trackedWorkOrders.has(suggestion.workOrderId);
          return (
            <article key={suggestion.workOrderId} className="rounded-2xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">Suggested Part</div>
                  <div className="mt-1 text-base font-black text-slate-950">{suggestion.partName}</div>
                  <div className="mt-1 text-xs font-semibold text-slate-500">For: {suggestion.workOrderTitle}</div>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${confidenceClass(suggestion.confidence)}`}>
                  {suggestion.confidenceLabel}
                </span>
              </div>

              <div className="mt-3 rounded-xl bg-slate-50 px-3 py-3">
                <div className="text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">Vehicle fitment context</div>
                <div className="mt-1 text-xs font-black text-slate-700">{suggestion.fitmentLabel}</div>
                <div className="mt-2 text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">Generated search</div>
                <div className="mt-1 break-words text-xs font-semibold leading-5 text-slate-600">{suggestion.searchQuery}</div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {suggestion.sources.map((source) => (
                  <a
                    key={source.key}
                    href={source.url}
                    target="_blank"
                    rel="noreferrer"
                    title={source.note}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:border-slate-400 hover:bg-slate-50"
                  >
                    {source.label} ↗
                  </a>
                ))}
                <button
                  type="button"
                  onClick={() => void copyQuery(suggestion)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-500 hover:bg-slate-50"
                >
                  {copiedId === suggestion.workOrderId ? "Copied" : "Copy Search"}
                </button>
              </div>

              <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
                <div className="text-[11px] font-semibold text-slate-500">
                  {tracked ? "A part is already tracked for this Work Order." : "Found a likely need? Add it now and fill in the exact listing after sourcing."}
                </div>
                <button
                  type="button"
                  disabled={tracked || workingId === suggestion.workOrderId}
                  onClick={() => void addSuggestedPart(suggestion)}
                  className="shrink-0 rounded-lg bg-slate-950 px-3 py-2 text-xs font-black text-white disabled:bg-slate-200 disabled:text-slate-400"
                >
                  {tracked ? "Part Tracked" : workingId === suggestion.workOrderId ? "Adding..." : "+ Add to Parts"}
                </button>
              </div>
            </article>
          );
        })}
      </div>

      <div className="mt-4 text-[11px] font-semibold leading-5 text-slate-400">
        Turn 14 currently uses a site-specific web search because the dealer catalog is not connected yet. Amazon and eBay open targeted marketplace searches directly.
      </div>
    </section>
  );
}
