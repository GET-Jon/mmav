"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import type { InventoryPartView } from "@/lib/mindful-inventory/parts-transport";
import {
  buildPartSearchSources,
  type PartSearchSuggestion,
  type RecommendedPartNeed,
} from "@/lib/mindful-inventory/part-suggestions";

function normalizeName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}
function labelize(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
function shortDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "Not entered";
}
function localDate(value: string | null) {
  if (!value) return "";
  const d = new Date(value);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function arrivalIso(value: string) {
  return value ? new Date(`${value}T12:00:00`).toISOString() : null;
}
function money(value: number | null) {
  return value == null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}
function confidenceClass(value: PartSearchSuggestion["confidence"]) {
  if (value === "high") return "bg-emerald-50 text-emerald-700";
  if (value === "verify") return "bg-amber-50 text-amber-800";
  return "bg-blue-50 text-blue-700";
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
function fitmentLabel(value: string) {
  return value
    .replace(/Sport Utility Vehicle \[SUV\]\/Multipurpose Vehicle \[MPV\]/gi, "")
    .replace(/Sport Utility Vehicle|Multipurpose Vehicle/gi, "")
    .replace(/\[[^\]]+\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

type Draft = { supplier: string; price: string; eta: string; url: string; tracking: string };
function draftFromPart(part?: InventoryPartView | null): Draft {
  return {
    supplier: part?.supplier || "",
    price: part?.quotedUnitPrice?.toString() || "",
    eta: localDate(part?.etaAt || null),
    url: part?.sourceUrl || "",
    tracking: part?.trackingReference || "",
  };
}

type QuickResolution = "in_stock" | "partner_supplied" | "customer_supplied" | "not_required";
const quickChoices: Array<{ value: QuickResolution; label: string }> = [
  { value: "in_stock", label: "In Stock" },
  { value: "partner_supplied", label: "Partner Supplied" },
  { value: "customer_supplied", label: "Customer Supplied" },
  { value: "not_required", label: "Not Required" },
];

function mergeSuggestions(current: PartSearchSuggestion[], incoming: PartSearchSuggestion[]) {
  const previousById = new Map(current.map((item) => [item.workOrderId, item]));
  return incoming.map((next) => {
    const previous = previousById.get(next.workOrderId);
    if (!previous) return next;
    const previousParts = previous.recommendedParts || [];
    const nextParts = next.recommendedParts || [];
    return {
      ...previous,
      ...next,
      recommendedParts: nextParts.length >= previousParts.length ? nextParts : previousParts,
      alternateQueries: next.alternateQueries?.length ? next.alternateQueries : previous.alternateQueries,
      aiNormalized: Boolean(previous.aiNormalized || next.aiNormalized),
    };
  });
}

export function InventoryPartSuggestionsV3({ vehicleId, suggestions, parts }: {
  vehicleId: string;
  suggestions: PartSearchSuggestion[];
  parts: InventoryPartView[];
}) {
  const router = useRouter();
  const normalizedWorkOrders = useRef<Set<string>>(new Set());
  const [displaySuggestions, setDisplaySuggestions] = useState(suggestions);
  const [expandedWorkOrders, setExpandedWorkOrders] = useState<Set<string>>(() => new Set(suggestions[0] ? [suggestions[0].workOrderId] : []));
  const [orderKey, setOrderKey] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [otherNames, setOtherNames] = useState<Record<string, string>>({});
  const [working, setWorking] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => setDisplaySuggestions((current) => mergeSuggestions(current, suggestions)), [suggestions]);

  useEffect(() => {
    const pending = suggestions.filter((s) => !normalizedWorkOrders.current.has(s.workOrderId));
    if (!pending.length) return;
    pending.forEach((s) => normalizedWorkOrders.current.add(s.workOrderId));
    let cancelled = false;
    async function normalize() {
      setAiLoading(true);
      try {
        const response = await fetch(`/api/mindful/inventory/vehicles/${vehicleId}/part-suggestions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: pending.map((s) => ({ workOrderId: s.workOrderId, workOrderTitle: s.workOrderTitle, partName: s.partName, fitmentLabel: s.fitmentLabel })) }),
        });
        const data = (await response.json()) as { items?: Array<{ workOrderId: string; partName: string; searchQuery: string; alternateQueries?: string[]; recommendedParts?: PartSearchSuggestion["recommendedParts"] }> };
        if (!cancelled && response.ok && data.items) {
          const byId = new Map(data.items.map((item) => [item.workOrderId, item]));
          setDisplaySuggestions((current) => current.map((s) => {
            const n = byId.get(s.workOrderId);
            if (!n) return s;
            const query = n.searchQuery || s.searchQuery;
            const recommended = n.recommendedParts || [];
            return {
              ...s,
              partName: n.partName || s.partName,
              searchQuery: query,
              alternateQueries: n.alternateQueries?.length ? n.alternateQueries : s.alternateQueries,
              recommendedParts: recommended.length ? recommended : s.recommendedParts,
              sources: buildPartSearchSources(query),
              aiNormalized: true,
            };
          }));
        }
      } finally {
        if (!cancelled) setAiLoading(false);
      }
    }
    void normalize();
    return () => { cancelled = true; };
  }, [suggestions, vehicleId]);

  const activeParts = useMemo(() => parts.filter((p) => p.status !== "cancelled"), [parts]);

  function toggleWorkOrder(id: string) {
    setExpandedWorkOrders((current) => {
      const next = new Set(current);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function createTracked(workOrderId: string, description: string, searchQuery: string, extra: Record<string, unknown> = {}) {
    const response = await fetch(`/api/mindful/inventory/vehicles/${vehicleId}/parts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workOrderId, description, quantity: 1, notes: `Lot Logic sourcing search: ${searchQuery}. Verify exact fitment before ordering.`, ...extra }),
    });
    const data = (await response.json()) as { id?: string; error?: string };
    if (!response.ok || !data.id) throw new Error(data.error || "Failed to track part.");
    return data.id;
  }

  async function resolve(partId: string, resolution: QuickResolution | "purchased") {
    const response = await fetch(`/api/mindful/inventory/vehicles/${vehicleId}/parts/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ partId, resolution }),
    });
    const data = (await response.json()) as { error?: string };
    if (!response.ok) throw new Error(data.error || "Failed to resolve source.");
  }

  async function quickResolve(args: { part?: InventoryPartView | null; workOrderId: string; description: string; searchQuery: string; resolution: QuickResolution }) {
    const key = `quick:${args.workOrderId}:${args.description}:${args.resolution}`;
    setWorking(key); setMessage("");
    try {
      const partId = args.part?.id || await createTracked(args.workOrderId, args.description, args.searchQuery);
      await resolve(partId, args.resolution);
      setMessage(`${args.description}: ${labelize(args.resolution)}.`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to resolve source.");
    } finally { setWorking(null); }
  }

  async function patchStatus(part: InventoryPartView, status: "received" | "backordered") {
    const key = `status:${part.id}:${status}`;
    setWorking(key); setMessage("");
    try {
      const response = await fetch(`/api/mindful/inventory/vehicles/${vehicleId}/parts`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partId: part.id, status }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Failed to update part.");
      setMessage(`${part.description}: ${status === "received" ? "received" : "marked delayed"}.`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to update part.");
    } finally { setWorking(null); }
  }

  async function saveOrder(args: { key: string; part?: InventoryPartView | null; workOrderId: string; description: string; searchQuery: string }) {
    const draft = drafts[args.key] || draftFromPart(args.part);
    setWorking(args.key); setMessage("");
    try {
      let partId = args.part?.id || null;
      const payload = {
        supplier: draft.supplier || null,
        quotedUnitPrice: draft.price || null,
        etaAt: arrivalIso(draft.eta),
        sourceUrl: draft.url || null,
        sourceType: draft.url ? "marketplace" : "other",
        trackingReference: draft.tracking || null,
      };
      if (partId) {
        const response = await fetch(`/api/mindful/inventory/vehicles/${vehicleId}/parts`, {
          method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ partId, ...payload }),
        });
        const data = (await response.json()) as { error?: string };
        if (!response.ok) throw new Error(data.error || "Failed to save order.");
      } else {
        partId = await createTracked(args.workOrderId, args.description, args.searchQuery, payload);
      }
      await resolve(partId, "purchased");
      setMessage(`${args.description}: order saved.`);
      setOrderKey(null);
      setDrafts((current) => { const next = { ...current }; delete next[args.key]; return next; });
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to save order.");
    } finally { setWorking(null); }
  }

  function openOrder(key: string, part?: InventoryPartView | null) {
    setDrafts((current) => ({ ...current, [key]: current[key] || draftFromPart(part) }));
    setOrderKey((current) => current === key ? null : key);
  }

  function renderOrderForm(args: { key: string; part?: InventoryPartView | null; workOrderId: string; description: string; searchQuery: string }) {
    const draft = drafts[args.key] || draftFromPart(args.part);
    const set = (patch: Partial<Draft>) => setDrafts((current) => ({ ...current, [args.key]: { ...(current[args.key] || draftFromPart(args.part)), ...patch } }));
    const sources = buildPartSearchSources(args.searchQuery);
    return <div className="mt-3 border-t border-slate-200 pt-3">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">Find / order from</span>
        {sources.map((source) => <a key={source.key} href={source.url} target="_blank" rel="noreferrer" className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-black text-slate-600">{source.key === "turn14" ? "Turn 14" : source.label} ↗</a>)}
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <label className="grid gap-1"><span className="text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">Supplier</span><input value={draft.supplier} onChange={(e) => set({ supplier: e.target.value })} placeholder="Supplier" className="rounded-lg border border-slate-200 px-3 py-2 text-xs" /></label>
        <label className="grid gap-1"><span className="text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">Price</span><input type="number" min="0" step="0.01" value={draft.price} onChange={(e) => set({ price: e.target.value })} placeholder="Price" className="rounded-lg border border-slate-200 px-3 py-2 text-xs" /></label>
        <label className="grid gap-1"><span className="text-[9px] font-black uppercase tracking-[0.08em] text-amber-700">Expected Arrival</span><input type="date" value={draft.eta} onChange={(e) => set({ eta: e.target.value })} className="rounded-lg border border-amber-200 bg-amber-50/40 px-3 py-2 text-xs" /></label>
        <label className="grid gap-1"><span className="text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">Tracking #</span><input value={draft.tracking} onChange={(e) => set({ tracking: e.target.value })} placeholder="Tracking #" className="rounded-lg border border-slate-200 px-3 py-2 text-xs" /></label>
        <label className="grid gap-1 sm:col-span-2"><span className="text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">Part URL</span><input type="url" value={draft.url} onChange={(e) => set({ url: e.target.value })} placeholder="Exact product URL" className="rounded-lg border border-slate-200 px-3 py-2 text-xs" /></label>
      </div>
      <div className="mt-3 flex justify-end"><button type="button" disabled={working !== null} onClick={() => void saveOrder(args)} className="rounded-lg bg-slate-950 px-4 py-2 text-xs font-black text-white disabled:opacity-50">{working === args.key ? "Saving…" : args.part ? "Save Order Changes" : "Save Order"}</button></div>
    </div>;
  }

  function renderQuickActions(args: { part?: InventoryPartView | null; workOrderId: string; description: string; searchQuery: string; orderKeyValue: string }) {
    return <div className="flex flex-wrap gap-1.5">
      {quickChoices.map((choice) => <button key={choice.value} type="button" disabled={working !== null} onClick={() => void quickResolve({ ...args, resolution: choice.value })} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-black text-slate-700 hover:border-slate-400 disabled:opacity-50">{working === `quick:${args.workOrderId}:${args.description}:${choice.value}` ? "Saving…" : choice.label}</button>)}
      <button type="button" onClick={() => openOrder(args.orderKeyValue, args.part)} className="rounded-full bg-slate-950 px-4 py-1.5 text-[10px] font-black text-white">{orderKey === args.orderKeyValue ? "Close Order" : "Order"}</button>
    </div>;
  }

  function renderTrackedActions(part: InventoryPartView, orderKeyValue: string) {
    if (["ordered", "backordered"].includes(part.status)) {
      return <div className="flex flex-wrap gap-1.5">
        <button type="button" disabled={working !== null} onClick={() => void patchStatus(part, "received")} className="rounded-md bg-emerald-600 px-3 py-1.5 text-[10px] font-black text-white disabled:opacity-50">Mark Received</button>
        {part.status !== "backordered" ? <button type="button" disabled={working !== null} onClick={() => void patchStatus(part, "backordered")} className="rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-[10px] font-black text-amber-800 disabled:opacity-50">Mark Delayed</button> : null}
        <button type="button" onClick={() => openOrder(orderKeyValue, part)} className="rounded-md bg-slate-950 px-3 py-1.5 text-[10px] font-black text-white">{orderKey === orderKeyValue ? "Close" : "Edit"}</button>
      </div>;
    }
    if (["received", "installed"].includes(part.status)) {
      return <button type="button" onClick={() => openOrder(orderKeyValue, part)} className="rounded-md border border-slate-200 px-3 py-1.5 text-[10px] font-black text-slate-600">Edit</button>;
    }
    return null;
  }

  if (!displaySuggestions.length) return null;

  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
    <div className="flex items-end justify-between gap-4"><div><div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">Parts by Work Order</div><h2 className="mt-1 text-xl font-black">Parts & sourcing</h2><p className="mt-1 text-sm font-medium text-slate-500">Resolve each required part at the Work Order: use stock, supplier-provided parts, or order it.</p></div>{aiLoading ? <div className="rounded-xl bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700">Building parts lists…</div> : null}</div>
    {message ? <div className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700">{message}</div> : null}
    <div className="mt-5 space-y-3">
      {displaySuggestions.map((suggestion) => {
        const expanded = expandedWorkOrders.has(suggestion.workOrderId);
        const workParts = activeParts.filter((p) => p.workOrderId === suggestion.workOrderId);
        const suggestedNames = new Set(suggestion.recommendedParts.map((p) => normalizeName(p.name)));
        const unmatched = workParts.filter((p) => !suggestedNames.has(normalizeName(p.description)));
        const attention = workParts.filter((p) => !["received", "installed"].includes(p.status)).length;
        const fitment = fitmentLabel(suggestion.fitmentLabel);
        return <article key={suggestion.workOrderId} className="overflow-hidden rounded-2xl border border-slate-200">
          <button type="button" onClick={() => toggleWorkOrder(suggestion.workOrderId)} className="flex w-full items-center justify-between px-5 py-4 text-left hover:bg-slate-50"><div><div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">Work Order</div><div className="mt-1 text-lg font-black">{suggestion.workOrderTitle}</div><div className="mt-2 flex flex-wrap gap-2"><span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${confidenceClass(suggestion.confidence)}`}>{suggestion.confidenceLabel || "Good starting point"}</span><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black text-slate-600">{suggestion.recommendedParts.length} suggested</span><span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-black text-blue-700">{workParts.length} tracked</span>{attention ? <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-black text-amber-800">{attention} need attention</span> : null}</div></div><span className={`text-2xl font-black text-slate-400 ${expanded ? "rotate-180" : ""}`}>⌄</span></button>
          {expanded ? <div className="space-y-2 border-t border-slate-100 bg-slate-50/50 px-5 py-4">
            {suggestion.recommendedParts.map((rec, index) => {
              const existing = workParts.find((p) => normalizeName(p.description) === normalizeName(rec.name)) || null;
              const key = `${suggestion.workOrderId}:rec:${index}`;
              return <div key={key} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div><div className="flex flex-wrap items-center gap-2"><span className="text-sm font-black">{rec.name}</span><span className={`rounded-full px-2 py-0.5 text-[9px] font-black ${recommendationClass(rec.need)}`}>{recommendationLabel(rec.need)}</span>{existing ? <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[9px] font-black text-blue-700">{labelize(existing.status)}</span> : null}</div><div className="mt-1.5 text-[11px] font-semibold text-slate-500">{existing ? `${existing.supplier || "Source not entered"} · Expected ${shortDate(existing.etaAt)} · ${money(existing.quotedUnitPrice)}` : rec.searchQuery}</div></div><div>{existing ? renderTrackedActions(existing, key) || renderQuickActions({ part: existing, workOrderId: suggestion.workOrderId, description: rec.name, searchQuery: rec.searchQuery, orderKeyValue: key }) : renderQuickActions({ workOrderId: suggestion.workOrderId, description: rec.name, searchQuery: rec.searchQuery, orderKeyValue: key })}</div></div>
                {orderKey === key ? renderOrderForm({ key, part: existing, workOrderId: suggestion.workOrderId, description: rec.name, searchQuery: rec.searchQuery }) : null}
              </div>;
            })}
            {unmatched.map((part) => {
              const key = `${suggestion.workOrderId}:tracked:${part.id}`;
              const query = `${fitment} ${part.description}`.trim();
              return <div key={part.id} className="rounded-xl border border-slate-200 bg-white px-4 py-3"><div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div><div className="flex items-center gap-2"><span className="text-sm font-black">{part.description}</span><span className="rounded-full bg-blue-50 px-2 py-0.5 text-[9px] font-black text-blue-700">{labelize(part.status)}</span></div><div className="mt-1.5 text-[11px] font-semibold text-slate-500">{part.supplier || "Source not entered"} · Expected {shortDate(part.etaAt)} · {money(part.quotedUnitPrice)}</div></div><div>{renderTrackedActions(part, key) || renderQuickActions({ part, workOrderId: suggestion.workOrderId, description: part.description, searchQuery: query, orderKeyValue: key })}</div></div>{orderKey === key ? renderOrderForm({ key, part, workOrderId: suggestion.workOrderId, description: part.description, searchQuery: query }) : null}</div>;
            })}
            <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-3"><div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">Other Part</div><div className="mt-2 flex gap-2"><input value={otherNames[suggestion.workOrderId] || ""} onChange={(e) => setOtherNames((current) => ({ ...current, [suggestion.workOrderId]: e.target.value }))} placeholder="Add a part Lot Logic didn't suggest" className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm" />{(otherNames[suggestion.workOrderId] || "").trim() ? renderQuickActions({ workOrderId: suggestion.workOrderId, description: (otherNames[suggestion.workOrderId] || "").trim(), searchQuery: `${fitment} ${(otherNames[suggestion.workOrderId] || "").trim()}`, orderKeyValue: `${suggestion.workOrderId}:other` }) : null}</div>{orderKey === `${suggestion.workOrderId}:other` && (otherNames[suggestion.workOrderId] || "").trim() ? renderOrderForm({ key: `${suggestion.workOrderId}:other`, workOrderId: suggestion.workOrderId, description: (otherNames[suggestion.workOrderId] || "").trim(), searchQuery: `${fitment} ${(otherNames[suggestion.workOrderId] || "").trim()}` }) : null}</div>
          </div> : null}
        </article>;
      })}
    </div>
  </section>;
}
