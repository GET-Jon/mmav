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
function normalizedPartName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
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
function localDate(value: string | null) {
  if (!value) return "";
  const d = new Date(value);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function shortDate(value: string | null) {
  return value
    ? new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : "Not entered";
}
function arrivalIso(value: string) {
  if (!value) return null;
  return new Date(`${value}T12:00:00`).toISOString();
}
function money(value: number | null) {
  return value == null
    ? "—"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      }).format(value);
}
function labelize(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

type Draft = {
  supplier: string;
  price: string;
  eta: string;
  url: string;
  tracking: string;
  status: string;
};

function draftFromPart(part?: InventoryPartView | null): Draft {
  return {
    supplier: part?.supplier || "",
    price: part?.quotedUnitPrice?.toString() || "",
    eta: localDate(part?.etaAt || null),
    url: part?.sourceUrl || "",
    tracking: part?.trackingReference || "",
    status: part?.status || "needed",
  };
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
  const [message, setMessage] = useState("");
  const [expandedWorkOrders, setExpandedWorkOrders] = useState<Set<string>>(() => {
    const attention = suggestions.find((s) =>
      parts.some(
        (p) =>
          p.workOrderId === s.workOrderId &&
          p.status !== "cancelled" &&
          !["received", "installed"].includes(p.status),
      ),
    );
    return new Set(
      attention
        ? [attention.workOrderId]
        : suggestions[0]
          ? [suggestions[0].workOrderId]
          : [],
    );
  });
  const [expandedPartKey, setExpandedPartKey] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [otherNames, setOtherNames] = useState<Record<string, string>>({});

  useEffect(() => setDisplaySuggestions(suggestions), [suggestions]);

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
              items: suggestions.map((s) => ({
                workOrderId: s.workOrderId,
                workOrderTitle: s.workOrderTitle,
                partName: s.partName,
                fitmentLabel: s.fitmentLabel,
              })),
            }),
          },
        );
        const data = (await response.json()) as {
          items?: Array<{
            workOrderId: string;
            partName: string;
            searchQuery: string;
            alternateQueries?: string[];
            recommendedParts?: PartSearchSuggestion["recommendedParts"];
          }>;
        };

        if (!cancelled && response.ok && data.items) {
          const byId = new Map(data.items.map((item) => [item.workOrderId, item]));
          setDisplaySuggestions((current) =>
            current.map((s) => {
              const n = byId.get(s.workOrderId);
              if (!n) return s;
              const normalizedRecommendations = n.recommendedParts || [];
              const searchQuery = n.searchQuery || s.searchQuery;
              return {
                ...s,
                partName: n.partName || s.partName,
                searchQuery,
                alternateQueries:
                  n.alternateQueries?.length ? n.alternateQueries : s.alternateQueries,
                recommendedParts:
                  normalizedRecommendations.length > 0
                    ? normalizedRecommendations
                    : s.recommendedParts,
                sources: buildPartSearchSources(searchQuery),
                aiNormalized: true,
              };
            }),
          );
        }
      } catch (error) {
        console.warn("Using fallback part suggestions:", error);
      } finally {
        if (!cancelled) setAiLoading(false);
      }
    }

    void normalize();
    return () => {
      cancelled = true;
    };
  }, [suggestions, vehicleId]);

  const activeParts = useMemo(
    () => parts.filter((p) => p.status !== "cancelled"),
    [parts],
  );

  function toggleWorkOrder(id: string) {
    setExpandedWorkOrders((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openEditor(key: string, part?: InventoryPartView | null) {
    setDrafts((current) => ({
      ...current,
      [key]: current[key] || draftFromPart(part),
    }));
    setExpandedPartKey((current) => (current === key ? null : key));
  }

  async function savePart(
    workOrderId: string,
    description: string,
    searchQuery: string,
    key: string,
    existing?: InventoryPartView | null,
  ) {
    const draft = drafts[key] || draftFromPart(existing);
    setWorkingId(key);
    setMessage("");
    try {
      const body = {
        supplier: draft.supplier || null,
        quotedUnitPrice: draft.price || null,
        etaAt: arrivalIso(draft.eta),
        sourceUrl: draft.url || null,
        sourceType: draft.url ? "marketplace" : "other",
        trackingReference: draft.tracking || null,
        status: draft.status,
      };
      const response = await fetch(
        `/api/mindful/inventory/vehicles/${vehicleId}/parts`,
        {
          method: existing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            existing
              ? { partId: existing.id, ...body }
              : {
                  workOrderId,
                  description,
                  quantity: 1,
                  notes: `Lot Logic sourcing search: ${searchQuery}. Verify exact fitment before ordering.`,
                  ...body,
                },
          ),
        },
      );
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Failed to save part.");
      setMessage(`${description} ${existing ? "updated" : "added and tracked"}.`);
      setExpandedPartKey(null);
      setDrafts((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to save part.");
    } finally {
      setWorkingId(null);
    }
  }

  function renderEditor({
    partKey,
    part,
    workOrderId,
    description,
    searchQuery,
  }: {
    partKey: string;
    part?: InventoryPartView | null;
    workOrderId: string;
    description: string;
    searchQuery: string;
  }) {
    const draft = drafts[partKey] || draftFromPart(part);
    const set = (patch: Partial<Draft>) =>
      setDrafts((current) => ({
        ...current,
        [partKey]: {
          ...(current[partKey] || draftFromPart(part)),
          ...patch,
        },
      }));

    return (
      <div className="mt-3 border-t border-slate-200 pt-3">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <label className="grid gap-1">
            <span className="text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">Supplier</span>
            <input value={draft.supplier} onChange={(e) => set({ supplier: e.target.value })} placeholder="Supplier" className="rounded-lg border border-slate-200 px-3 py-2 text-xs" />
          </label>
          <label className="grid gap-1">
            <span className="text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">Price</span>
            <input type="number" min="0" step="0.01" value={draft.price} onChange={(e) => set({ price: e.target.value })} placeholder="Price" className="rounded-lg border border-slate-200 px-3 py-2 text-xs" />
          </label>
          <label className="grid gap-1">
            <span className="text-[9px] font-black uppercase tracking-[0.08em] text-amber-700">Expected Arrival</span>
            <input type="date" value={draft.eta} onChange={(e) => set({ eta: e.target.value })} className="rounded-lg border border-amber-200 bg-amber-50/40 px-3 py-2 text-xs" />
          </label>
          <label className="grid gap-1">
            <span className="text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">Tracking #</span>
            <input value={draft.tracking} onChange={(e) => set({ tracking: e.target.value })} placeholder="Tracking #" className="rounded-lg border border-slate-200 px-3 py-2 text-xs" />
          </label>
          <label className="grid gap-1">
            <span className="text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">Part URL</span>
            <input type="url" value={draft.url} onChange={(e) => set({ url: e.target.value })} placeholder="Part URL" className="rounded-lg border border-slate-200 px-3 py-2 text-xs" />
          </label>
          <label className="grid gap-1">
            <span className="text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">Status</span>
            <select value={draft.status} onChange={(e) => set({ status: e.target.value })} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold">
              <option value="needed">Needed</option>
              <option value="ordered">Ordered</option>
              <option value="backordered">Backordered</option>
              <option value="received">Received</option>
              <option value="installed">Installed</option>
            </select>
          </label>
        </div>
        {!draft.eta && ["ordered", "backordered"].includes(draft.status) ? (
          <div className="mt-2 text-[11px] font-bold text-amber-700">
            Add an Expected Arrival so Active Work and alerts can show when this part should arrive.
          </div>
        ) : null}
        <div className="mt-3 flex justify-end">
          <button disabled={workingId === partKey} onClick={() => void savePart(workOrderId, description, searchQuery, partKey, part)} className="rounded-lg bg-slate-950 px-4 py-2 text-xs font-black text-white disabled:opacity-50">
            {workingId === partKey ? "Saving…" : part ? "Save Changes" : "Save & Track"}
          </button>
        </div>
      </div>
    );
  }

  if (!displaySuggestions.length) return null;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">Parts by Work Order</div>
          <h2 className="mt-1 text-xl font-black">Parts & sourcing</h2>
          <p className="mt-1 text-sm font-medium text-slate-500">Each Work Order contains its suggested and tracked parts. Add, edit, source, and update arrival details in place.</p>
        </div>
        {aiLoading ? <div className="rounded-xl bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700">Building parts lists…</div> : null}
      </div>

      {message ? <div className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700">{message}</div> : null}

      <div className="mt-5 space-y-3">
        {displaySuggestions.map((suggestion) => {
          const expanded = expandedWorkOrders.has(suggestion.workOrderId);
          const fitment = humanFitmentLabel(suggestion.fitmentLabel);
          const workParts = activeParts.filter((p) => p.workOrderId === suggestion.workOrderId);
          const suggestedNames = new Set(suggestion.recommendedParts.map((p) => normalizedPartName(p.name)));
          const unmatchedTracked = workParts.filter((p) => !suggestedNames.has(normalizedPartName(p.description)));
          const attention = workParts.filter((p) => !["received", "installed"].includes(p.status)).length;

          return (
            <article key={suggestion.workOrderId} className="overflow-hidden rounded-2xl border border-slate-200">
              <button type="button" onClick={() => toggleWorkOrder(suggestion.workOrderId)} className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left hover:bg-slate-50">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">Work Order</div>
                  <div className="mt-1 text-lg font-black">{suggestion.workOrderTitle}</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${confidenceClass(suggestion.confidence)}`}>{confidenceLabel(suggestion.confidence)}</span>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black text-slate-600">{suggestion.recommendedParts.length} suggested</span>
                    <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-black text-blue-700">{workParts.length} tracked</span>
                    {attention ? <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-black text-amber-800">{attention} need attention</span> : null}
                  </div>
                </div>
                <span className={`text-2xl font-black text-slate-400 transition-transform ${expanded ? "rotate-180" : ""}`}>⌄</span>
              </button>

              {expanded ? (
                <div className="border-t border-slate-100 bg-slate-50/50 px-5 py-4">
                  <div className="space-y-2">
                    {suggestion.recommendedParts.map((rec, index) => {
                      const existing = workParts.find((p) => normalizedPartName(p.description) === normalizedPartName(rec.name)) || null;
                      const partKey = `${suggestion.workOrderId}:rec:${index}`;
                      const sources = buildPartSearchSources(rec.searchQuery);
                      const editing = expandedPartKey === partKey;

                      return (
                        <div key={partKey} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-black">{rec.name}</span>
                                <span className={`rounded-full px-2 py-0.5 text-[9px] font-black ${recommendationClass(rec.need)}`}>{recommendationLabel(rec.need)}</span>
                                {existing ? <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[9px] font-black text-blue-700">{labelize(existing.status)}</span> : null}
                              </div>
                              <div className="mt-1.5 text-[11px] font-semibold text-slate-500">
                                {existing ? `${existing.supplier || "Source not entered"} · Expected ${shortDate(existing.etaAt)} · ${money(existing.quotedUnitPrice)}` : rec.searchQuery}
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {sources.map((s) => (
                                <a key={s.key} href={s.url} target="_blank" rel="noreferrer" className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-black text-slate-600">
                                  {s.key === "turn14" ? "Turn 14" : s.label} ↗
                                </a>
                              ))}
                              <button onClick={() => openEditor(partKey, existing)} className="rounded-md bg-slate-950 px-3 py-1.5 text-[11px] font-black text-white">
                                {editing ? "Close" : existing ? "Edit" : "+ Add"}
                              </button>
                            </div>
                          </div>
                          {editing ? renderEditor({ partKey, part: existing, workOrderId: suggestion.workOrderId, description: rec.name, searchQuery: rec.searchQuery }) : null}
                        </div>
                      );
                    })}

                    {unmatchedTracked.map((part) => {
                      const partKey = `${suggestion.workOrderId}:tracked:${part.id}`;
                      const editing = expandedPartKey === partKey;
                      const query = `${fitment} ${part.description}`.trim();
                      return (
                        <div key={part.id} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-black">{part.description}</span>
                                <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[9px] font-black text-blue-700">{labelize(part.status)}</span>
                              </div>
                              <div className="mt-1.5 text-[11px] font-semibold text-slate-500">
                                {part.supplier || "Source not entered"} · Expected {shortDate(part.etaAt)} · {money(part.quotedUnitPrice)}
                              </div>
                            </div>
                            <button onClick={() => openEditor(partKey, part)} className="rounded-md bg-slate-950 px-3 py-1.5 text-[11px] font-black text-white">
                              {editing ? "Close" : "Edit"}
                            </button>
                          </div>
                          {editing ? renderEditor({ partKey, part, workOrderId: suggestion.workOrderId, description: part.description, searchQuery: query }) : null}
                        </div>
                      );
                    })}

                    <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-3">
                      <div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">Other Part</div>
                      <div className="mt-2 flex gap-2">
                        <input value={otherNames[suggestion.workOrderId] || ""} onChange={(e) => setOtherNames((current) => ({ ...current, [suggestion.workOrderId]: e.target.value }))} placeholder="Add a part Lot Logic didn't suggest" className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                        <button disabled={!(otherNames[suggestion.workOrderId] || "").trim()} onClick={() => { const key = `${suggestion.workOrderId}:other`; setDrafts((current) => ({ ...current, [key]: current[key] || draftFromPart(null) })); setExpandedPartKey(key); }} className="rounded-lg bg-slate-950 px-4 py-2 text-xs font-black text-white disabled:bg-slate-200">
                          + Add
                        </button>
                      </div>
                      {expandedPartKey === `${suggestion.workOrderId}:other` && (otherNames[suggestion.workOrderId] || "").trim()
                        ? renderEditor({
                            partKey: `${suggestion.workOrderId}:other`,
                            workOrderId: suggestion.workOrderId,
                            description: (otherNames[suggestion.workOrderId] || "").trim(),
                            searchQuery: `${fitment} ${(otherNames[suggestion.workOrderId] || "").trim()}`,
                          })
                        : null}
                    </div>
                  </div>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
