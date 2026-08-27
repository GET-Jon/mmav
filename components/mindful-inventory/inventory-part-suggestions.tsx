"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import type { InventoryPartView } from "@/lib/mindful-inventory/parts-transport";
import {
  buildPartSearchSources,
  type PartSearchSuggestion,
} from "@/lib/mindful-inventory/part-suggestions";

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
  const normalizedOnce = useRef(false);
  const [displaySuggestions, setDisplaySuggestions] = useState(suggestions);
  const [aiLoading, setAiLoading] = useState(false);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setDisplaySuggestions(suggestions);
  }, [suggestions]);

  useEffect(() => {
    if (normalizedOnce.current || suggestions.length === 0) return;
    normalizedOnce.current = true;
    let cancelled = false;

    async function normalize() {
      setAiLoading(true);
      try {
        const response = await fetch(`/api/mindful/inventory/vehicles/${vehicleId}/part-suggestions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: suggestions.map((suggestion) => ({
              workOrderId: suggestion.workOrderId,
              workOrderTitle: suggestion.workOrderTitle,
              partName: suggestion.partName,
              fitmentLabel: suggestion.fitmentLabel,
            })),
          }),
        });
        const payload = await response.json() as {
          error?: string;
          items?: Array<{
            workOrderId: string;
            partName: string;
            searchQuery: string;
            alternateQueries?: string[];
          }>;
        };
        if (!response.ok) throw new Error(payload.error || "AI search normalization failed.");
        if (cancelled || !payload.items?.length) return;

        const normalized = new Map(payload.items.map((item) => [item.workOrderId, item]));
        setDisplaySuggestions((current) => current.map((suggestion) => {
          const improved = normalized.get(suggestion.workOrderId);
          if (!improved) return suggestion;
          return {
            ...suggestion,
            partName: improved.partName,
            searchQuery: improved.searchQuery,
            alternateQueries: improved.alternateQueries || [],
            aiNormalized: true,
            sources: buildPartSearchSources(improved.searchQuery),
          };
        }));
      } catch (error) {
        console.warn("Using fallback part searches:", error);
      } finally {
        if (!cancelled) setAiLoading(false);
      }
    }

    void normalize();
    return () => { cancelled = true; };
  }, [suggestions, vehicleId]);

  const trackedWorkOrders = useMemo(
    () => new Set(parts.filter((part) => part.status !== "cancelled").map((part) => part.workOrderId)),
    [parts],
  );

  async function copyText(id: string, text: string) {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    window.setTimeout(() => setCopiedId((current) => current === id ? null : current), 1400);
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

  if (displaySuggestions.length === 0) return null;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">Lot Logic Sourcing</div>
          <h2 className="mt-1 text-xl font-black text-slate-950">Suggested Parts & Search Links</h2>
          <p className="mt-1 max-w-3xl text-sm font-medium leading-6 text-slate-500">
            Lot Logic translates each Work Order into a natural, fitment-aware shopping search. These links are starting points, not verified-fit guarantees.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {aiLoading ? <div className="rounded-xl bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700">Improving searches with AI…</div> : null}
          <div className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">Verify fitment before ordering</div>
        </div>
      </div>

      {message ? <div className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700">{message}</div> : null}

      <div className="mt-5 space-y-3">
        {displaySuggestions.map((suggestion) => {
          const tracked = trackedWorkOrders.has(suggestion.workOrderId);
          return (
            <article key={suggestion.workOrderId} className="rounded-2xl border border-slate-200 p-5">
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(390px,0.9fr)_auto] xl:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <div>
                      <div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">Suggested Part</div>
                      <div className="mt-1 text-base font-black text-slate-950">{suggestion.partName}</div>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${confidenceClass(suggestion.confidence)}`}>
                      {suggestion.confidenceLabel}
                    </span>
                    {suggestion.aiNormalized ? <span className="rounded-full bg-violet-50 px-2.5 py-1 text-[10px] font-black text-violet-700">AI search</span> : null}
                  </div>
                  <div className="mt-1 text-xs font-semibold text-slate-500">For: {suggestion.workOrderTitle}</div>
                </div>

                <div className="rounded-xl bg-slate-50 px-3 py-3">
                  <div className="text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">Suggested search</div>
                  <div className="mt-1 break-words text-sm font-black leading-5 text-slate-700">{suggestion.searchQuery}</div>
                  {suggestion.alternateQueries.length ? (
                    <div className="mt-2 border-t border-slate-200 pt-2">
                      <div className="text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">Also try</div>
                      <div className="mt-1 space-y-1">
                        {suggestion.alternateQueries.map((query, index) => (
                          <div key={query} className="flex items-center justify-between gap-2 text-xs font-semibold text-slate-600">
                            <span>{query}</span>
                            <button type="button" onClick={() => void copyText(`${suggestion.workOrderId}:alt:${index}`, query)} className="shrink-0 font-black text-slate-400 hover:text-slate-700">
                              {copiedId === `${suggestion.workOrderId}:alt:${index}` ? "Copied" : "Copy"}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-2 xl:justify-end">
                  {suggestion.sources.map((source) => (
                    <a key={source.key} href={source.url} target="_blank" rel="noreferrer" title={source.note} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:border-slate-400 hover:bg-slate-50">
                      {source.label} ↗
                    </a>
                  ))}
                  <button type="button" onClick={() => void copyText(suggestion.workOrderId, suggestion.searchQuery)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-500 hover:bg-slate-50">
                    {copiedId === suggestion.workOrderId ? "Copied" : "Copy Search"}
                  </button>
                  <button type="button" disabled={tracked || workingId === suggestion.workOrderId} onClick={() => void addSuggestedPart(suggestion)} className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-black text-white disabled:bg-slate-200 disabled:text-slate-400">
                    {tracked ? "Part Tracked" : workingId === suggestion.workOrderId ? "Adding..." : "+ Add to Parts"}
                  </button>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-[11px] font-semibold text-slate-500">
                <span>Fitment context: {suggestion.fitmentLabel}</span>
                <span>{tracked ? "A part is already tracked for this Work Order." : "Choose a source, find the exact listing, then add the selected part."}</span>
              </div>
            </article>
          );
        })}
      </div>

      <div className="mt-4 text-[11px] font-semibold leading-5 text-slate-400">
        Turn 14 keeps its live catalog inside the dealer portal. Open Turn 14, then use Copy Search to paste the suggested phrase into the portal search. Amazon and eBay open the primary suggested search directly.
      </div>
    </section>
  );
}
