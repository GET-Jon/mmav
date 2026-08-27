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

function confidenceLabel(value: PartSearchSuggestion["confidence"]) {
  if (value === "high") return "High confidence";
  if (value === "verify") return "Verify fitment";
  return "Good starting point";
}

function humanFitmentLabel(value: string) {
  return value
    .replace(/Sport Utility Vehicle \[SUV\]\/Multipurpose Vehicle \[MPV\]/gi, "")
    .replace(/Sport Utility Vehicle/gi, "")
    .replace(/Multipurpose Vehicle/gi, "")
    .replace(/\[[^\]]+\]/g, "")
    .replace(/\b\d\.\dL\b/gi, "")
    .replace(/\bI\d\b/gi, "")
    .replace(/\bV\d\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
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
        const response = await fetch(
          `/api/mindful/inventory/vehicles/${vehicleId}/part-suggestions`,
          {
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
          },
        );
        const payload = (await response.json()) as {
          error?: string;
          items?: Array<{
            workOrderId: string;
            partName: string;
            searchQuery: string;
            alternateQueries?: string[];
          }>;
        };
        if (!response.ok) {
          throw new Error(payload.error || "AI search normalization failed.");
        }
        if (cancelled || !payload.items?.length) return;

        const normalized = new Map(
          payload.items.map((item) => [item.workOrderId, item]),
        );
        setDisplaySuggestions((current) =>
          current.map((suggestion) => {
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
          }),
        );
      } catch (error) {
        console.warn("Using fallback part searches:", error);
      } finally {
        if (!cancelled) setAiLoading(false);
      }
    }

    void normalize();
    return () => {
      cancelled = true;
    };
  }, [suggestions, vehicleId]);

  const trackedWorkOrders = useMemo(
    () =>
      new Set(
        parts
          .filter((part) => part.status !== "cancelled")
          .map((part) => part.workOrderId),
      ),
    [parts],
  );

  async function copyText(id: string, text: string) {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    window.setTimeout(
      () => setCopiedId((current) => (current === id ? null : current)),
      1400,
    );
  }

  async function addSuggestedPart(suggestion: PartSearchSuggestion) {
    setWorkingId(suggestion.workOrderId);
    setMessage("");
    try {
      const response = await fetch(
        `/api/mindful/inventory/vehicles/${vehicleId}/parts`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workOrderId: suggestion.workOrderId,
            description: suggestion.partName,
            quantity: 1,
            sourceType: "other",
            notes: `Lot Logic suggested sourcing search: ${suggestion.searchQuery}. Verify exact fitment before ordering.`,
          }),
        },
      );
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "Failed to add suggested part.");
      }
      setMessage(`${suggestion.partName} added to Parts as Needed.`);
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Failed to add suggested part.",
      );
    } finally {
      setWorkingId(null);
    }
  }

  if (displaySuggestions.length === 0) return null;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">
            Lot Logic Sourcing
          </div>
          <h2 className="mt-1 text-xl font-black text-slate-950">
            Suggested Parts & Search Links
          </h2>
          <p className="mt-1 max-w-3xl text-sm font-medium leading-6 text-slate-500">
            Start with the suggested search, open a source, then add the exact part you choose.
          </p>
        </div>
        {aiLoading ? (
          <div className="rounded-xl bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700">
            Improving searches…
          </div>
        ) : null}
      </div>

      {message ? (
        <div className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700">
          {message}
        </div>
      ) : null}

      <div className="mt-5 space-y-3">
        {displaySuggestions.map((suggestion) => {
          const tracked = trackedWorkOrders.has(suggestion.workOrderId);
          const fitment = humanFitmentLabel(suggestion.fitmentLabel);
          const amazon = suggestion.sources.find((source) => source.key === "amazon");
          const ebay = suggestion.sources.find((source) => source.key === "ebay");
          const turn14 = suggestion.sources.find((source) => source.key === "turn14");

          return (
            <article
              key={suggestion.workOrderId}
              className="rounded-2xl border border-slate-200 px-5 py-4"
            >
              <div className="grid gap-4 lg:grid-cols-[minmax(260px,0.8fr)_minmax(360px,1.2fr)_auto] lg:items-center">
                <div className="min-w-0">
                  <div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">
                    Part Need
                  </div>
                  <div className="mt-1 text-lg font-black text-slate-950">
                    {suggestion.partName}
                  </div>
                  <div className="mt-1 text-xs font-semibold text-slate-500">
                    For: {suggestion.workOrderTitle}
                  </div>
                  <div className="mt-2">
                    <span
                      className={`rounded-full px-2.5 py-1 text-[10px] font-black ${confidenceClass(suggestion.confidence)}`}
                    >
                      {confidenceLabel(suggestion.confidence)}
                    </span>
                  </div>
                </div>

                <div className="min-w-0">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">
                      Suggested Search
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        void copyText(suggestion.workOrderId, suggestion.searchQuery)
                      }
                      className="text-[11px] font-black text-slate-400 hover:text-slate-700"
                    >
                      {copiedId === suggestion.workOrderId ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <div className="mt-1 text-sm font-black leading-5 text-slate-800">
                    {suggestion.searchQuery}
                  </div>
                  {suggestion.alternateQueries.length ? (
                    <div className="mt-2 text-xs font-semibold leading-5 text-slate-500">
                      <span className="font-black text-slate-400">Also try:</span>{" "}
                      {suggestion.alternateQueries.slice(0, 2).map((query, index) => (
                        <span key={query}>
                          <button
                            type="button"
                            onClick={() =>
                              void copyText(
                                `${suggestion.workOrderId}:alt:${index}`,
                                query,
                              )
                            }
                            className="hover:text-slate-800"
                          >
                            {copiedId === `${suggestion.workOrderId}:alt:${index}`
                              ? "Copied"
                              : query}
                          </button>
                          {index < Math.min(suggestion.alternateQueries.length, 2) - 1
                            ? " · "
                            : ""}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {fitment ? (
                    <div className="mt-2 text-[11px] font-semibold text-slate-400">
                      Fitment basis: {fitment}
                    </div>
                  ) : null}
                </div>

                <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                  {amazon ? (
                    <a
                      href={amazon.url}
                      target="_blank"
                      rel="noreferrer"
                      title={amazon.note}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:border-slate-400 hover:bg-slate-50"
                    >
                      Amazon ↗
                    </a>
                  ) : null}
                  {ebay ? (
                    <a
                      href={ebay.url}
                      target="_blank"
                      rel="noreferrer"
                      title={ebay.note}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:border-slate-400 hover:bg-slate-50"
                    >
                      eBay ↗
                    </a>
                  ) : null}
                  {turn14 ? (
                    <a
                      href={turn14.url}
                      target="_blank"
                      rel="noreferrer"
                      title={turn14.note}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:border-slate-400 hover:bg-slate-50"
                    >
                      Turn 14 ↗
                    </a>
                  ) : null}
                  <button
                    type="button"
                    disabled={tracked || workingId === suggestion.workOrderId}
                    onClick={() => void addSuggestedPart(suggestion)}
                    className="rounded-lg bg-slate-950 px-4 py-2 text-xs font-black text-white disabled:bg-slate-200 disabled:text-slate-400"
                  >
                    {tracked
                      ? "Part Tracked"
                      : workingId === suggestion.workOrderId
                        ? "Adding..."
                        : "+ Add Part"}
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <div className="mt-4 text-[11px] font-semibold leading-5 text-slate-400">
        Suggested searches are starting points. Verify fitment before ordering. Turn 14 currently opens the dealer portal; direct catalog results will replace this once API access is connected.
      </div>
    </section>
  );
}
