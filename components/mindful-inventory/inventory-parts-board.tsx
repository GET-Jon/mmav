"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import type { PartRequirementView, PartFulfillmentMethod } from "@/lib/mindful-inventory/part-requirements";
import { buildPartSearchSources, type PartSearchSuggestion } from "@/lib/mindful-inventory/part-suggestions";

function money(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
}
function dateLabel(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function fulfillmentLabel(value: PartFulfillmentMethod | null) {
  if (value === "mindful_purchase") return "Owner sourcing";
  if (value === "partner_supplied") return "Partner supplying";
  if (value === "in_stock") return "In stock";
  if (value === "customer_supplied") return "Other supplied";
  if (value === "not_required") return "Not required";
  return "Needs sourcing decision";
}
function fulfillmentTone(value: PartFulfillmentMethod | null, status: string | null) {
  if (status === "received" || status === "installed" || value === "in_stock") return "bg-emerald-100 text-emerald-800";
  if (status === "ordered") return "bg-blue-100 text-blue-800";
  if (value === "not_required") return "bg-slate-100 text-slate-600";
  if (!value) return "bg-amber-100 text-amber-800";
  return "bg-violet-100 text-violet-800";
}

export function InventoryPartsBoard({ vehicleId, requirements, suggestions }: {
  vehicleId: string;
  requirements: PartRequirementView[];
  suggestions: PartSearchSuggestion[];
}) {
  const router = useRouter();
  const [working, setWorking] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [openId, setOpenId] = useState<string | null>(() => requirements.find((item) => item.requirementStatus !== "not_required" && !item.fulfillmentMethod)?.id || requirements[0]?.id || null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [targets, setTargets] = useState<Record<string, { low: string; high: string }>>(() => Object.fromEntries(requirements.map((item) => [item.id, {
    low: item.ownerTargetUnitPriceLow == null ? "" : String(item.ownerTargetUnitPriceLow),
    high: item.ownerTargetUnitPriceHigh == null ? "" : String(item.ownerTargetUnitPriceHigh),
  }])));
  const [displaySuggestions, setDisplaySuggestions] = useState(suggestions);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);

  useEffect(() => {
    if (!suggestions.length) return;
    let cancelled = false;
    async function improveSuggestions() {
      setSuggestionsLoading(true);
      try {
        const response = await fetch(`/api/mindful/inventory/vehicles/${vehicleId}/part-suggestions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: suggestions.map((item) => ({
            workOrderId: item.workOrderId,
            workOrderTitle: item.workOrderTitle,
            partName: item.partName,
            fitmentLabel: item.fitmentLabel,
          })) }),
        });
        const data = await response.json() as { items?: Array<{ workOrderId: string; partName: string; searchQuery: string; alternateQueries?: string[]; recommendedParts?: PartSearchSuggestion["recommendedParts"] }> };
        if (!cancelled && response.ok && data.items) {
          const byWork = new Map(data.items.map((item) => [item.workOrderId, item]));
          setDisplaySuggestions(suggestions.map((item) => {
            const improved = byWork.get(item.workOrderId);
            if (!improved) return item;
            const query = improved.searchQuery || item.searchQuery;
            return {
              ...item,
              partName: improved.partName || item.partName,
              searchQuery: query,
              alternateQueries: improved.alternateQueries || [],
              recommendedParts: improved.recommendedParts || [],
              sources: buildPartSearchSources(query),
              aiNormalized: true,
            };
          }));
        }
      } finally {
        if (!cancelled) setSuggestionsLoading(false);
      }
    }
    void improveSuggestions();
    return () => { cancelled = true; };
  }, [suggestions, vehicleId]);

  const requirementDescriptionsByWork = useMemo(() => {
    const map = new Map<string, Set<string>>();
    requirements.forEach((item) => {
      if (!item.workOrderId) return;
      const set = map.get(item.workOrderId) || new Set<string>();
      set.add(item.description.toLowerCase().trim());
      map.set(item.workOrderId, set);
    });
    return map;
  }, [requirements]);

  const counts = useMemo(() => {
    const active = requirements.filter((item) => item.requirementStatus !== "not_required");
    return {
      total: active.length,
      decisions: active.filter((item) => !item.fulfillmentMethod).length,
      ordered: active.filter((item) => item.executionStatus === "ordered" || item.executionStatus === "backordered").length,
      ready: active.filter((item) => ["received", "installed"].includes(item.executionStatus || "") || item.fulfillmentMethod === "in_stock").length,
    };
  }, [requirements]);

  async function decide(item: PartRequirementView, fulfillmentMethod: PartFulfillmentMethod, extra: Record<string, unknown> = {}) {
    setWorking(item.id); setMessage("");
    const target = targets[item.id] || { low: "", high: "" };
    try {
      const response = await fetch(`/api/mindful/inventory/vehicles/${vehicleId}/part-requirements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "decision",
          requirementId: item.id,
          requirementStatus: fulfillmentMethod === "not_required" ? "not_required" : "required",
          fulfillmentMethod,
          sourcingOwner: fulfillmentMethod === "partner_supplied" ? "partner" : fulfillmentMethod === "mindful_purchase" ? "owner" : null,
          ownerTargetUnitPriceLow: target.low || null,
          ownerTargetUnitPriceHigh: target.high || null,
          ownerDecisionNote: notes[item.id] || item.ownerDecisionNote || "",
          ...extra,
        }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Could not save the parts decision.");
      setMessage(`${item.description}: ${fulfillmentLabel(fulfillmentMethod)}.`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save the parts decision.");
    } finally { setWorking(null); }
  }

  async function addMessage(item: PartRequirementView, messageType: "note" | "counter" = "note") {
    const text = (notes[item.id] || "").trim();
    if (!text) return;
    setWorking(item.id); setMessage("");
    const target = targets[item.id] || { low: "", high: "" };
    try {
      const response = await fetch(`/api/mindful/inventory/vehicles/${vehicleId}/part-requirements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "message", requirementId: item.id, messageType, message: text, unitPrice: target.high || target.low || null }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Could not add the parts note.");
      setNotes((current) => ({ ...current, [item.id]: "" }));
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not add the parts note.");
    } finally { setWorking(null); }
  }

  async function useSuggestion(suggestion: PartSearchSuggestion, description: string, searchQuery: string) {
    const key = `suggest:${suggestion.workOrderId}:${description}`;
    setWorking(key); setMessage("");
    try {
      const response = await fetch(`/api/mindful/inventory/vehicles/${vehicleId}/part-requirements/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workOrderId: suggestion.workOrderId, description, fitmentQuery: searchQuery, quantity: 1 }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Could not add the suggested part.");
      setMessage(`${description} added for sourcing review.`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not add the suggested part.");
    } finally { setWorking(null); }
  }

  function copyQuery(query: string) {
    void navigator.clipboard?.writeText(query);
    setMessage("Search phrase copied. Paste it into the Turn 14 portal.");
  }

  return <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
    <div className="border-b border-slate-200 px-5 py-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">Parts Board</div>
          <h2 className="mt-1 text-2xl font-black text-slate-950">What the car needs — and who is getting it</h2>
          <p className="mt-2 max-w-3xl text-sm font-medium leading-6 text-slate-500">Mechanic suggestions stay suggestions until you decide. Compare the partner's offer, source it yourself, use stock, or mark it unnecessary. Ordering and receiving happen after that decision.</p>
        </div>
        <div className="grid grid-cols-4 gap-2 text-center">
          <div className="rounded-xl bg-slate-50 px-3 py-2"><div className="text-[10px] font-black uppercase text-slate-400">Needed</div><div className="mt-1 font-black">{counts.total}</div></div>
          <div className="rounded-xl bg-amber-50 px-3 py-2"><div className="text-[10px] font-black uppercase text-amber-700">Decide</div><div className="mt-1 font-black text-amber-900">{counts.decisions}</div></div>
          <div className="rounded-xl bg-blue-50 px-3 py-2"><div className="text-[10px] font-black uppercase text-blue-700">Ordered</div><div className="mt-1 font-black text-blue-900">{counts.ordered}</div></div>
          <div className="rounded-xl bg-emerald-50 px-3 py-2"><div className="text-[10px] font-black uppercase text-emerald-700">Ready</div><div className="mt-1 font-black text-emerald-900">{counts.ready}</div></div>
        </div>
      </div>
      {message ? <div className="mt-4 rounded-xl bg-slate-950 px-4 py-3 text-sm font-bold text-white">{message}</div> : null}
    </div>

    <div className="space-y-3 p-5">
      {requirements.length ? requirements.map((item) => {
        const open = openId === item.id;
        const target = targets[item.id] || { low: "", high: "" };
        const partnerPrice = item.partnerOfferUnitPrice;
        return <article key={item.id} className={`overflow-hidden rounded-2xl border ${item.requirementStatus === "not_required" ? "border-slate-200 bg-slate-50/60" : !item.fulfillmentMethod ? "border-amber-200" : "border-slate-200"}`}>
          <button type="button" onClick={() => setOpenId(open ? null : item.id)} className="flex w-full items-start justify-between gap-4 px-4 py-4 text-left">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-black text-slate-950">{item.description}</h3>
                <span className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-black uppercase text-slate-600">Qty {item.quantity}</span>
                <span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase ${fulfillmentTone(item.fulfillmentMethod, item.executionStatus)}`}>{fulfillmentLabel(item.fulfillmentMethod)}</span>
              </div>
              <div className="mt-1 text-xs font-semibold text-slate-500">For: {item.workTitle}{item.partNumber ? ` · Part # ${item.partNumber}` : ""}</div>
              <div className="mt-1 text-xs font-semibold text-slate-400">{item.origin === "mechanic" ? `Suggested by ${item.suggestedByPartnerName || "mechanic"}` : item.origin === "ai" ? "Suggested by Lot Logic" : "Added by Owner"}</div>
            </div>
            <div className="shrink-0 text-right">
              {partnerPrice != null ? <div className="text-sm font-black text-slate-950">Partner: {money(partnerPrice)}</div> : null}
              {item.executionStatus ? <div className="mt-1 text-[10px] font-black uppercase text-slate-500">{item.executionStatus.replaceAll("_", " ")}{item.etaAt ? ` · ETA ${dateLabel(item.etaAt)}` : ""}</div> : null}
              <div className="mt-2 text-[10px] font-black text-blue-700">{open ? "Collapse" : "Review →"}</div>
            </div>
          </button>

          {open ? <div className="border-t border-slate-100 p-4">
            {item.partnerOfferNote || partnerPrice != null ? <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
              <div className="text-[10px] font-black uppercase tracking-[0.1em] text-blue-700">Partner suggestion</div>
              <div className="mt-1 flex flex-wrap items-baseline gap-2"><div className="font-black text-slate-950">{item.suggestedByPartnerName || "Mechanic"} can source this{partnerPrice != null ? ` for about ${money(partnerPrice)}` : ""}.</div></div>
              {item.partnerOfferNote ? <div className="mt-1 text-sm font-medium text-blue-900">{item.partnerOfferNote}</div> : null}
            </div> : null}

            <div className="mt-4">
              <div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">How should we get it?</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {(item.suggestedByPartnerId || partnerPrice != null) ? <button disabled={working === item.id} onClick={() => void decide(item, "partner_supplied")} className={`rounded-xl border px-3 py-2 text-xs font-black ${item.fulfillmentMethod === "partner_supplied" ? "border-violet-700 bg-violet-700 text-white" : "border-slate-200 bg-white text-slate-700"}`}>{partnerPrice != null ? `Let partner supply · ${money(partnerPrice)}` : "Let partner supply"}</button> : null}
                <button disabled={working === item.id} onClick={() => void decide(item, "mindful_purchase")} className={`rounded-xl border px-3 py-2 text-xs font-black ${item.fulfillmentMethod === "mindful_purchase" ? "border-blue-700 bg-blue-700 text-white" : "border-slate-200 bg-white text-slate-700"}`}>I'll source it</button>
                <button disabled={working === item.id} onClick={() => void decide(item, "in_stock")} className={`rounded-xl border px-3 py-2 text-xs font-black ${item.fulfillmentMethod === "in_stock" ? "border-emerald-700 bg-emerald-700 text-white" : "border-slate-200 bg-white text-slate-700"}`}>Already in stock</button>
                <button disabled={working === item.id} onClick={() => void decide(item, "customer_supplied")} className={`rounded-xl border px-3 py-2 text-xs font-black ${item.fulfillmentMethod === "customer_supplied" ? "border-slate-700 bg-slate-700 text-white" : "border-slate-200 bg-white text-slate-700"}`}>Other supplies it</button>
                <button disabled={working === item.id} onClick={() => void decide(item, "not_required")} className={`rounded-xl border px-3 py-2 text-xs font-black ${item.fulfillmentMethod === "not_required" ? "border-slate-700 bg-slate-700 text-white" : "border-slate-200 bg-white text-slate-500"}`}>Not required</button>
              </div>
            </div>

            {item.fulfillmentMethod === "mindful_purchase" || !item.fulfillmentMethod ? <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">Source it quickly</div>
                  <div className="mt-1 text-sm font-semibold text-slate-700">{item.fitmentQuery || item.description}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {item.sources.map((source) => source.key === "turn14" ? <button key={source.key} type="button" onClick={() => { copyQuery(item.fitmentQuery || item.description); window.open(source.url, "_blank", "noopener,noreferrer"); }} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-black">Turn 14 ↗</button> : <a key={source.key} href={source.url} target="_blank" rel="noreferrer" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-black">{source.label} ↗</a>)}
                </div>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-[140px_140px_1fr_auto]">
                <input inputMode="decimal" value={target.low} onChange={(e) => setTargets((current) => ({ ...current, [item.id]: { ...target, low: e.target.value } }))} placeholder="Target low $" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs" />
                <input inputMode="decimal" value={target.high} onChange={(e) => setTargets((current) => ({ ...current, [item.id]: { ...target, high: e.target.value } }))} placeholder="Target high $" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs" />
                <input value={notes[item.id] || ""} onChange={(e) => setNotes((current) => ({ ...current, [item.id]: e.target.value }))} placeholder="e.g. You can get it for $20; I'll look for $10–15 first." className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs" />
                <button type="button" disabled={working === item.id} onClick={() => void decide(item, "mindful_purchase")} className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-black text-white disabled:opacity-50">Save sourcing plan</button>
              </div>
            </div> : null}

            {item.messages.length ? <div className="mt-4 space-y-2">
              <div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">Parts conversation</div>
              {item.messages.map((entry) => <div key={entry.id} className={`rounded-xl px-3 py-2 text-sm ${entry.actorType === "owner" ? "ml-8 bg-slate-950 text-white" : entry.actorType === "partner" ? "mr-8 bg-blue-50 text-blue-950" : "bg-slate-100 text-slate-700"}`}><div className="text-[9px] font-black uppercase opacity-60">{entry.actorLabel}{entry.unitPrice != null ? ` · ${money(entry.unitPrice)}` : ""}</div><div className="mt-0.5 font-medium">{entry.body}</div>{entry.sourceUrl ? <a href={entry.sourceUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs font-black underline">Open source ↗</a> : null}</div>)}
            </div> : null}

            <div className="mt-3 flex gap-2">
              <input value={notes[item.id] || ""} onChange={(e) => setNotes((current) => ({ ...current, [item.id]: e.target.value }))} placeholder="Add a note or counter suggestion…" className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-xs" />
              <button type="button" disabled={working === item.id || !(notes[item.id] || "").trim()} onClick={() => void addMessage(item, target.low || target.high ? "counter" : "note")} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-black disabled:opacity-40">Send</button>
            </div>
          </div> : null}
        </article>;
      }) : <div className="rounded-2xl border border-dashed border-slate-300 px-5 py-8 text-center"><div className="font-black text-slate-800">No confirmed part requirements yet.</div><div className="mt-1 text-sm text-slate-500">Mechanic suggestions and Lot Logic suggestions will appear here as the Work Plan develops.</div></div>}

      {displaySuggestions.length ? <div className="mt-6 border-t border-slate-200 pt-5">
        <div className="flex items-end justify-between gap-4"><div><div className="text-xs font-black uppercase tracking-[0.1em] text-violet-500">Lot Logic suggestions</div><h3 className="mt-1 text-lg font-black text-slate-950">Possible parts we can tee up for the job</h3><p className="mt-1 text-sm text-slate-500">These are suggestions, not orders. Add one only if it belongs in the parts conversation.</p></div>{suggestionsLoading ? <div className="text-xs font-black text-violet-600">Improving suggestions…</div> : null}</div>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">{displaySuggestions.map((suggestion) => {
          const existingNames = requirementDescriptionsByWork.get(suggestion.workOrderId) || new Set<string>();
          const candidates = suggestion.recommendedParts.length ? suggestion.recommendedParts.map((part) => ({ name: part.name, query: part.searchQuery || `${suggestion.fitmentLabel} ${part.name}` })) : [{ name: suggestion.partName, query: suggestion.searchQuery }];
          const fresh = candidates.filter((candidate) => !existingNames.has(candidate.name.toLowerCase().trim()));
          if (!fresh.length) return null;
          return <div key={suggestion.workOrderId} className="rounded-xl border border-violet-200 bg-violet-50/30 p-4"><div className="text-xs font-black text-slate-500">{suggestion.workOrderTitle}</div><div className="mt-2 space-y-2">{fresh.slice(0, 4).map((candidate) => <div key={candidate.name} className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2"><div className="min-w-0"><div className="truncate text-sm font-black text-slate-900">{candidate.name}</div><div className="truncate text-[10px] font-semibold text-slate-400">{candidate.query}</div></div><button disabled={working === `suggest:${suggestion.workOrderId}:${candidate.name}`} onClick={() => void useSuggestion(suggestion, candidate.name, candidate.query)} className="shrink-0 rounded-lg bg-violet-700 px-3 py-2 text-[10px] font-black text-white">Use suggestion</button></div>)}</div></div>;
        })}</div>
      </div> : null}
    </div>
  </section>;
}
