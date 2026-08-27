"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import type { InventoryPartView } from "@/lib/mindful-inventory/parts-transport";
import {
  buildPartSearchSources,
  type PartSearchSuggestion,
  type RecommendedPartNeed,
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

function recommendationLabel(value: RecommendedPartNeed) {
  if (value === "likely_required") return "Likely required";
  if (value === "consumable") return "Consumable";
  return "Possible";
}

function recommendationClass(value: RecommendedPartNeed) {
  if (value === "likely_required") return "bg-emerald-50 text-emerald-700";
  if (value === "consumable") return "bg-violet-50 text-violet-700";
  return "bg-slate-100 text-slate-600";
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

function normalizedPartName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
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
  const [expandedWorkOrders, setExpandedWorkOrders] = useState<Set<string>>(
    new Set(),
  );
  const [otherParts, setOtherParts] = useState<Record<string, string>>({});

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
            recommendedParts?: Array<{
              name: string;
              need: RecommendedPartNeed;
              searchQuery: string;
            }>;
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
              recommendedParts: improved.recommendedParts || [],
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

  const trackedParts = useMemo(() => {
    const active = parts.filter((part) => part.status !== "cancelled");
    return new Set(
      active.map(
        (part) => `${part.workOrderId}:${normalizedPartName(part.description)}`,
      ),
    );
  }, [parts]);

  async function copyText(id: string, text: string) {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    window.setTimeout(
      () => setCopiedId((current) => (current === id ? null : current)),
      1400,
    );
  }

  function toggleWorkOrder(workOrderId: string) {
    setExpandedWorkOrders((current) => {
      const next = new Set(current);
      if (next.has(workOrderId)) next.delete(workOrderId);
      else next.add(workOrderId);
      return next;
    });
  }

  async function addPart(
    workOrderId: string,
    description: string,
    searchQuery: string,
    workingKey: string,
  ) {
    setWorkingId(workingKey);
    setMessage("");
    try {
      const response = await fetch(
        `/api/mindful/inventory/vehicles/${vehicleId}/parts`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workOrderId,
            description,
            quantity: 1,
            sourceType: "other",
            notes: `Lot Logic recommended sourcing search: ${searchQuery}. Verify exact fitment before ordering.`,
          }),
        },
      );
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "Failed to add part.");
      }
      setMessage(`${description} added to Parts as Needed.`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to add part.");
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
            Recommended Parts
          </h2>
          <p className="mt-1 max-w-3xl text-sm font-medium leading-6 text-slate-500">
            Open a Work Order to review suggested parts, source them, or add something Lot Logic missed.
          </p>
        </div>
        {aiLoading ? (
          <div className="rounded-xl bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700">
            Building parts lists…
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
          const expanded = expandedWorkOrders.has(suggestion.workOrderId);
          const fitment = humanFitmentLabel(suggestion.fitmentLabel);
          const trackedCount = parts.filter(
            (part) =>
              part.workOrderId === suggestion.workOrderId &&
              part.status !== "cancelled",
          ).length;
          const otherPart = otherParts[suggestion.workOrderId] || "";
          const otherSearch = `${fitment} ${otherPart}`.replace(/\s+/g, " ").trim();
          const otherSources = otherSearch
            ? buildPartSearchSources(otherSearch)
            : [];

          return (
            <article
              key={suggestion.workOrderId}
              className="overflow-hidden rounded-2xl border border-slate-200"
            >
              <button
                type="button"
                onClick={() => toggleWorkOrder(suggestion.workOrderId)}
                className="flex w-full items-center justify-between gap-4 bg-white px-5 py-4 text-left hover:bg-slate-50"
                aria-expanded={expanded}
              >
                <div className="min-w-0">
                  <div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">
                    Work Order
                  </div>
                  <div className="mt-1 text-lg font-black text-slate-950">
                    {suggestion.workOrderTitle}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-1 text-[10px] font-black ${confidenceClass(suggestion.confidence)}`}
                    >
                      {confidenceLabel(suggestion.confidence)}
                    </span>
                    {suggestion.recommendedParts.length ? (
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black text-slate-600">
                        {suggestion.recommendedParts.length} suggested
                      </span>
                    ) : null}
                    {trackedCount ? (
                      <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-black text-blue-700">
                        {trackedCount} tracked
                      </span>
                    ) : null}
                  </div>
                </div>

                <span
                  className={`shrink-0 text-2xl font-black text-slate-400 transition-transform ${expanded ? "rotate-180" : ""}`}
                  aria-hidden="true"
                >
                  ⌄
                </span>
              </button>

              {expanded ? (
                <div className="border-t border-slate-100 bg-slate-50/50 px-5 py-4">
                  <div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">
                    Suggested Parts
                  </div>

                  {suggestion.recommendedParts.length ? (
                    <div className="mt-2 space-y-2">
                      {suggestion.recommendedParts.map((part, index) => {
                        const key = `${suggestion.workOrderId}:${normalizedPartName(part.name)}`;
                        const tracked = trackedParts.has(key);
                        const rowKey = `${suggestion.workOrderId}:recommended:${index}`;
                        const sources = buildPartSearchSources(part.searchQuery);
                        const recAmazon = sources.find((source) => source.key === "amazon");
                        const recEbay = sources.find((source) => source.key === "ebay");
                        const recTurn14 = sources.find((source) => source.key === "turn14");
                        const copyKey = `${suggestion.workOrderId}:copy:${index}`;

                        return (
                          <div
                            key={`${part.name}:${index}`}
                            className="rounded-xl border border-slate-200 bg-white px-4 py-3"
                          >
                            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-sm font-black text-slate-900">
                                    {part.name}
                                  </span>
                                  <span
                                    className={`rounded-full px-2 py-0.5 text-[9px] font-black ${recommendationClass(part.need)}`}
                                  >
                                    {recommendationLabel(part.need)}
                                  </span>
                                </div>
                                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-slate-500">
                                  <span>{part.searchQuery}</span>
                                  <button
                                    type="button"
                                    onClick={() => void copyText(copyKey, part.searchQuery)}
                                    className="font-black text-slate-400 hover:text-slate-700"
                                  >
                                    {copiedId === copyKey ? "Copied" : "Copy search"}
                                  </button>
                                </div>
                              </div>

                              <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                                {recAmazon ? (
                                  <a href={recAmazon.url} target="_blank" rel="noreferrer" className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-black text-slate-600">Amazon ↗</a>
                                ) : null}
                                {recEbay ? (
                                  <a href={recEbay.url} target="_blank" rel="noreferrer" className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-black text-slate-600">eBay ↗</a>
                                ) : null}
                                {recTurn14 ? (
                                  <a href={recTurn14.url} target="_blank" rel="noreferrer" className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-black text-slate-600">Turn 14 ↗</a>
                                ) : null}
                                <button
                                  type="button"
                                  disabled={tracked || workingId === rowKey}
                                  onClick={() => void addPart(suggestion.workOrderId, part.name, part.searchQuery, rowKey)}
                                  className="rounded-md bg-slate-900 px-2.5 py-1.5 text-[11px] font-black text-white disabled:bg-slate-200 disabled:text-slate-400"
                                >
                                  {tracked ? "Tracked" : workingId === rowKey ? "Adding..." : "+ Add"}
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="mt-2 rounded-xl border border-dashed border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-500">
                      Lot Logic did not identify a specific part for this Work Order.
                    </div>
                  )}

                  <div className="mt-3 rounded-xl border border-dashed border-slate-300 bg-white px-4 py-3">
                    <div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">
                      Other Part
                    </div>
                    <div className="mt-2 flex flex-col gap-2 lg:flex-row lg:items-center">
                      <input
                        value={otherPart}
                        onChange={(event) =>
                          setOtherParts((current) => ({
                            ...current,
                            [suggestion.workOrderId]: event.target.value,
                          }))
                        }
                        placeholder="Add a part Lot Logic didn't suggest"
                        className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-none focus:border-slate-400"
                      />
                      {otherSearch ? (
                        <div className="flex flex-wrap gap-1.5">
                          {otherSources.find((source) => source.key === "amazon") ? (
                            <a href={otherSources.find((source) => source.key === "amazon")?.url} target="_blank" rel="noreferrer" className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-black text-slate-600">Amazon ↗</a>
                          ) : null}
                          {otherSources.find((source) => source.key === "ebay") ? (
                            <a href={otherSources.find((source) => source.key === "ebay")?.url} target="_blank" rel="noreferrer" className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-black text-slate-600">eBay ↗</a>
                          ) : null}
                          {otherSources.find((source) => source.key === "turn14") ? (
                            <a href={otherSources.find((source) => source.key === "turn14")?.url} target="_blank" rel="noreferrer" className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-black text-slate-600">Turn 14 ↗</a>
                          ) : null}
                          <button
                            type="button"
                            disabled={!otherPart.trim() || workingId === `${suggestion.workOrderId}:other`}
                            onClick={() =>
                              void addPart(
                                suggestion.workOrderId,
                                otherPart.trim(),
                                otherSearch,
                                `${suggestion.workOrderId}:other`,
                              ).then(() =>
                                setOtherParts((current) => ({
                                  ...current,
                                  [suggestion.workOrderId]: "",
                                })),
                              )
                            }
                            className="rounded-md bg-slate-900 px-2.5 py-1.5 text-[11px] font-black text-white disabled:bg-slate-200 disabled:text-slate-400"
                          >
                            {workingId === `${suggestion.workOrderId}:other` ? "Adding..." : "+ Add"}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>

      <div className="mt-4 text-[11px] font-semibold leading-5 text-slate-400">
        Recommendations are planning suggestions, not verified-fit guarantees. Add only the items you intend to source. Turn 14 currently opens the dealer portal; direct catalog results will replace this once API access is connected.
      </div>
    </section>
  );
}
