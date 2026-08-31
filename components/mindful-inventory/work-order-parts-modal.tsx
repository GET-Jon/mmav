"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { buildPartSearchSources, type PartSearchSuggestion, type RecommendedPartSuggestion } from "@/lib/mindful-inventory/part-suggestions";
import type { InventoryPartView } from "@/lib/mindful-inventory/parts-transport";

function labelize(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function localDateTime(value: string | null) {
  if (!value) return "";
  const d = new Date(value);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

async function payload(response: Response) {
  const text = await response.text();
  if (!text.trim()) return {} as { error?: string; id?: string };
  try { return JSON.parse(text) as { error?: string; id?: string }; }
  catch { throw new Error(`Request failed (${response.status}).`); }
}

type PurchaseDraft = { supplier: string; price: string; eta: string; url: string };
type Resolution = "in_stock" | "purchased" | "partner_supplied" | "customer_supplied" | "not_required";

const EMPTY_PURCHASE: PurchaseDraft = { supplier: "", price: "", eta: "", url: "" };
const RESOLUTION_OPTIONS: Array<{ value: Resolution; label: string }> = [
  { value: "in_stock", label: "In Stock" },
  { value: "purchased", label: "Purchased" },
  { value: "partner_supplied", label: "Partner Supplied" },
  { value: "customer_supplied", label: "Customer Supplied" },
  { value: "not_required", label: "Not Required" },
];

export function WorkOrderPartsModal({ vehicleId, workOrderId, workOrderTitle, suggestion, parts, open, onClose }: {
  vehicleId: string;
  workOrderId: string;
  workOrderTitle: string;
  suggestion: PartSearchSuggestion;
  parts: InventoryPartView[];
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [recommended, setRecommended] = useState<RecommendedPartSuggestion[]>(suggestion.recommendedParts || []);
  const [normalizedQuery, setNormalizedQuery] = useState(suggestion.searchQuery);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [newPart, setNewPart] = useState("");
  const [purchaseDrafts, setPurchaseDrafts] = useState<Record<string, PurchaseDraft>>({});
  const [addingSuggestionKey, setAddingSuggestionKey] = useState<string | null>(null);
  const [suggestionDraft, setSuggestionDraft] = useState<PurchaseDraft>(EMPTY_PURCHASE);
  const [resolutions, setResolutions] = useState<Record<string, Resolution | null>>({});

  const tracked = useMemo(() => parts.filter((part) => part.workOrderId === workOrderId && part.status !== "cancelled"), [parts, workOrderId]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    async function load() {
      setLoadingSuggestions(true);
      try {
        const [suggestionResponse, resolutionResponse] = await Promise.all([
          fetch(`/api/mindful/inventory/vehicles/${vehicleId}/part-suggestions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ items: [{ workOrderId, workOrderTitle, partName: suggestion.partName, fitmentLabel: suggestion.fitmentLabel }] }),
          }),
          fetch(`/api/mindful/inventory/vehicles/${vehicleId}/parts/resolve?workOrderId=${encodeURIComponent(workOrderId)}`),
        ]);
        const suggestionData = await suggestionResponse.json() as { items?: Array<{ searchQuery: string; recommendedParts?: RecommendedPartSuggestion[] }> };
        if (!cancelled && suggestionResponse.ok && suggestionData.items?.[0]) {
          setNormalizedQuery(suggestionData.items[0].searchQuery || suggestion.searchQuery);
          setRecommended(suggestionData.items[0].recommendedParts || []);
        }
        const resolutionData = await resolutionResponse.json() as { items?: Array<{ partId: string; resolution: Resolution | null }> };
        if (!cancelled && resolutionResponse.ok) {
          setResolutions(Object.fromEntries((resolutionData.items || []).map((item) => [item.partId, item.resolution])));
        }
      } catch {
        // Existing parts and fallback search remain usable.
      } finally {
        if (!cancelled) setLoadingSuggestions(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [open, suggestion.fitmentLabel, suggestion.partName, suggestion.searchQuery, vehicleId, workOrderId, workOrderTitle]);

  if (!open) return null;
  const sourceLinks = buildPartSearchSources(normalizedQuery);

  async function addNeededPart(description: string, searchQuery: string) {
    const clean = description.trim();
    if (!clean) return;
    setWorkingId(`add:${clean}`); setMessage("");
    try {
      const response = await fetch(`/api/mindful/inventory/vehicles/${vehicleId}/parts`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workOrderId, description: clean, quantity: 1, sourceType: "other", notes: `Lot Logic sourcing suggestion: ${searchQuery}. Verify fitment before ordering.` }),
      });
      const data = await payload(response);
      if (!response.ok) throw new Error(data.error || "Failed to add part.");
      setNewPart(""); setMessage(`${clean} added as Needed.`); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Failed to add part."); }
    finally { setWorkingId(null); }
  }

  async function updatePart(partId: string, body: Record<string, unknown>, success: string) {
    setWorkingId(partId); setMessage("");
    try {
      const response = await fetch(`/api/mindful/inventory/vehicles/${vehicleId}/parts`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ partId, ...body }),
      });
      const data = await payload(response);
      if (!response.ok) throw new Error(data.error || "Failed to update part.");
      setMessage(success); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Failed to update part."); }
    finally { setWorkingId(null); }
  }

  async function resolveDependency(part: InventoryPartView, resolution: Resolution) {
    setWorkingId(`resolve:${part.id}`); setMessage("");
    try {
      const response = await fetch(`/api/mindful/inventory/vehicles/${vehicleId}/parts/resolve`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ partId: part.id, resolution }),
      });
      const data = await payload(response);
      if (!response.ok) throw new Error(data.error || "Failed to resolve dependency.");
      setResolutions((current) => ({ ...current, [part.id]: resolution }));
      setMessage(`${part.description}: ${labelize(resolution)}.`);
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Failed to resolve dependency."); }
    finally { setWorkingId(null); }
  }

  async function saveSuggestedPurchase(part: RecommendedPartSuggestion, key: string) {
    setWorkingId(`purchase:${key}`); setMessage("");
    try {
      const createResponse = await fetch(`/api/mindful/inventory/vehicles/${vehicleId}/parts`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workOrderId, description: part.name, quantity: 1, supplier: suggestionDraft.supplier || null, quotedUnitPrice: suggestionDraft.price || null, etaAt: suggestionDraft.eta ? new Date(suggestionDraft.eta).toISOString() : null, sourceUrl: suggestionDraft.url || null, sourceType: suggestionDraft.url ? "marketplace" : "other", notes: `Lot Logic sourcing suggestion: ${part.searchQuery}. Verify fitment before ordering.` }),
      });
      const created = await payload(createResponse);
      if (!createResponse.ok || !created.id) throw new Error(created.error || "Failed to add part.");
      const resolveResponse = await fetch(`/api/mindful/inventory/vehicles/${vehicleId}/parts/resolve`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ partId: created.id, resolution: "purchased" }),
      });
      const resolved = await payload(resolveResponse);
      if (!resolveResponse.ok) throw new Error(resolved.error || "Part was added but could not be marked purchased.");
      setAddingSuggestionKey(null); setSuggestionDraft(EMPTY_PURCHASE); setMessage(`${part.name} saved and marked Purchased.`); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Failed to save purchase."); }
    finally { setWorkingId(null); }
  }

  async function markPurchased(part: InventoryPartView) {
    const draft = purchaseDrafts[part.id] || { supplier: part.supplier || "", price: part.quotedUnitPrice?.toString() || "", eta: localDateTime(part.etaAt), url: part.sourceUrl || "" };
    await updatePart(part.id, { supplier: draft.supplier || null, quotedUnitPrice: draft.price || null, etaAt: draft.eta ? new Date(draft.eta).toISOString() : null, sourceUrl: draft.url || null, sourceType: draft.url ? "marketplace" : part.sourceType }, `${part.description} purchase details saved.`);
    await resolveDependency(part, "purchased");
  }

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
      <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4">
        <div><div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">Work Order Parts</div><h3 className="mt-1 text-xl font-black">{workOrderTitle}</h3><p className="mt-1 text-xs text-slate-500">Resolve required dependencies, source parts, and track arrival for this job.</p></div>
        <button onClick={onClose} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-black">Close</button>
      </div>

      <div className="space-y-5 p-5">
        {message ? <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700">{message}</div> : null}

        <section className="rounded-2xl border border-slate-200 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div><div className="text-[10px] font-black uppercase tracking-[0.1em] text-blue-700">Lot Logic sourcing</div><div className="mt-1 text-sm font-black">{loadingSuggestions ? "Building suggested parts…" : "Suggested parts and searches"}</div><div className="mt-1 text-xs text-slate-500">{normalizedQuery}</div></div>
            <div className="flex flex-wrap gap-2">{sourceLinks.map((source) => <a key={source.key} href={source.url} target="_blank" rel="noreferrer" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700">{source.key === "turn14" ? "Turn 14" : source.label} ↗</a>)}</div>
          </div>
          <div className="mt-4 space-y-2">
            {(recommended.length ? recommended : [{ name: suggestion.partName, need: "possible" as const, searchQuery: normalizedQuery }]).map((part, index) => {
              const alreadyTracked = tracked.some((item) => item.description.trim().toLowerCase() === part.name.trim().toLowerCase());
              const links = buildPartSearchSources(part.searchQuery);
              const rowKey = `${part.name}:${index}`;
              const expanding = addingSuggestionKey === rowKey;
              return <div key={rowKey} className="rounded-xl bg-slate-50 px-4 py-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div><div className="text-sm font-black">{part.name}</div><div className="mt-1 text-[11px] text-slate-500">{part.searchQuery}</div></div>
                  <div className="flex flex-wrap gap-1.5">{links.map((source) => <a key={source.key} href={source.url} target="_blank" rel="noreferrer" className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-black text-slate-600">{source.key === "turn14" ? "Turn 14" : source.label} ↗</a>)}<button disabled={alreadyTracked} onClick={() => { setAddingSuggestionKey(expanding ? null : rowKey); setSuggestionDraft(EMPTY_PURCHASE); }} className="rounded-md bg-slate-950 px-2.5 py-1.5 text-[11px] font-black text-white disabled:bg-slate-200 disabled:text-slate-400">{alreadyTracked ? "Tracked" : expanding ? "Cancel" : "+ Add"}</button></div>
                </div>
                {expanding && !alreadyTracked ? <div className="mt-3 border-t border-slate-200 pt-3"><div className="mb-2 text-[10px] font-black uppercase tracking-[0.08em] text-slate-400">Purchase details</div><div className="grid gap-2 sm:grid-cols-2"><input value={suggestionDraft.supplier} onChange={(e) => setSuggestionDraft((d) => ({ ...d, supplier: e.target.value }))} placeholder="Supplier" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs" /><input value={suggestionDraft.price} onChange={(e) => setSuggestionDraft((d) => ({ ...d, price: e.target.value }))} type="number" min="0" step="0.01" placeholder="Purchase price" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs" /><input value={suggestionDraft.eta} onChange={(e) => setSuggestionDraft((d) => ({ ...d, eta: e.target.value }))} type="datetime-local" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs" /><input value={suggestionDraft.url} onChange={(e) => setSuggestionDraft((d) => ({ ...d, url: e.target.value }))} type="url" placeholder="Part URL (optional)" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs" /></div><div className="mt-2 flex items-center justify-between gap-3"><div className="text-[10px] font-semibold text-slate-400">Order date is recorded automatically when saved.</div><button disabled={workingId === `purchase:${rowKey}`} onClick={() => void saveSuggestedPurchase(part, rowKey)} className="rounded-lg bg-blue-700 px-4 py-2 text-xs font-black text-white disabled:opacity-50">{workingId === `purchase:${rowKey}` ? "Saving…" : "Save & Track"}</button></div></div> : null}
              </div>;
            })}
          </div>
          <form onSubmit={(event: FormEvent) => { event.preventDefault(); void addNeededPart(newPart, `${suggestion.fitmentLabel} ${newPart}`.trim()); }} className="mt-3 flex gap-2"><input value={newPart} onChange={(event) => setNewPart(event.target.value)} placeholder="Add a part Lot Logic missed" className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm" /><button disabled={!newPart.trim()} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-black disabled:opacity-40">Add Part</button></form>
        </section>

        <section>
          <div><div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">Tracked parts</div><div className="mt-1 text-sm font-black">{tracked.length ? `${tracked.length} part${tracked.length === 1 ? "" : "s"}` : "No parts tracked yet"}</div></div>
          <div className="mt-3 space-y-3">
            {tracked.map((part) => {
              const draft = purchaseDrafts[part.id] || { supplier: part.supplier || "", price: part.quotedUnitPrice?.toString() || "", eta: localDateTime(part.etaAt), url: part.sourceUrl || "" };
              const setDraft = (patch: Partial<typeof draft>) => setPurchaseDrafts((current) => ({ ...current, [part.id]: { ...draft, ...patch } }));
              const resolution = resolutions[part.id] || null;
              const unresolved = !resolution && part.status === "needed";
              return <div key={part.id} className="rounded-xl border border-slate-200 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><div className="text-sm font-black">{part.description}</div><div className="mt-1 text-xs text-slate-500">Qty {part.quantity} · {labelize(part.status)}{part.partNumber ? ` · ${part.partNumber}` : ""}</div>{resolution ? <div className="mt-1 text-[11px] font-black text-blue-700">Source: {labelize(resolution)}</div> : null}</div>{part.status !== "received" && part.status !== "installed" && part.status !== "ordered" ? null : part.status === "ordered" ? <span className="rounded-full bg-blue-100 px-3 py-1.5 text-[10px] font-black text-blue-800">Ordered</span> : <span className="rounded-full bg-emerald-100 px-3 py-1.5 text-[10px] font-black text-emerald-800">✓ {labelize(part.status)}</span>}</div>

                {unresolved ? <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3"><div className="text-[10px] font-black uppercase tracking-[0.08em] text-amber-700">Resolve source</div><div className="mt-2 flex flex-wrap gap-2">{RESOLUTION_OPTIONS.map((option) => <button key={option.value} disabled={workingId === `resolve:${part.id}`} onClick={() => void resolveDependency(part, option.value)} className={`rounded-lg px-3 py-2 text-xs font-black ${option.value === "not_required" ? "border border-slate-300 bg-white text-slate-600" : "bg-slate-950 text-white"}`}>{option.label}</button>)}</div></div> : null}

                {resolution === "purchased" || (!resolution && ["needed", "backordered"].includes(part.status)) ? <div className="mt-3 grid gap-2 sm:grid-cols-2"><input value={draft.supplier} onChange={(event) => setDraft({ supplier: event.target.value })} placeholder="Supplier" className="rounded-lg border border-slate-200 px-3 py-2 text-xs" /><input value={draft.price} onChange={(event) => setDraft({ price: event.target.value })} placeholder="Purchase price" type="number" min="0" step="0.01" className="rounded-lg border border-slate-200 px-3 py-2 text-xs" /><input value={draft.eta} onChange={(event) => setDraft({ eta: event.target.value })} type="datetime-local" className="rounded-lg border border-slate-200 px-3 py-2 text-xs" /><input value={draft.url} onChange={(event) => setDraft({ url: event.target.value })} placeholder="Part URL (optional)" type="url" className="rounded-lg border border-slate-200 px-3 py-2 text-xs" /><button disabled={workingId === part.id || workingId === `resolve:${part.id}`} onClick={() => void markPurchased(part)} className="sm:col-span-2 rounded-lg bg-blue-700 px-3 py-2 text-xs font-black text-white">Save Purchase / ETA</button></div> : <div className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-4"><div><span className="font-black">Supplier:</span> {part.supplier || "—"}</div><div><span className="font-black">Price:</span> {part.quotedUnitPrice == null ? "—" : `$${part.quotedUnitPrice}`}</div><div><span className="font-black">ETA:</span> {part.etaAt ? new Date(part.etaAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—"}</div><div>{part.sourceUrl ? <a href={part.sourceUrl} target="_blank" rel="noreferrer" className="font-black text-blue-700">Part link ↗</a> : <span><span className="font-black">Link:</span> —</span>}</div></div>}

                {part.status !== "received" && part.status !== "installed" && resolution === "purchased" ? <button disabled={workingId === part.id} onClick={() => void updatePart(part.id, { status: "received" }, `${part.description} marked received.`)} className="mt-3 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-800">Mark Received</button> : null}
              </div>;
            })}
          </div>
        </section>

        <div className="flex justify-between border-t border-slate-200 pt-4"><a href={`/mindful/inventory/${vehicleId}/parts`} className="text-xs font-black text-slate-500 hover:text-slate-900">Open full Parts / Transport →</a><button onClick={onClose} className="rounded-lg bg-slate-950 px-4 py-2 text-xs font-black text-white">Done</button></div>
      </div>
    </div>
  </div>;
}
