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
  if (!text.trim()) return {} as { error?: string };
  try { return JSON.parse(text) as { error?: string }; }
  catch { throw new Error(`Request failed (${response.status}).`); }
}

export function WorkOrderPartsModal({
  vehicleId,
  workOrderId,
  workOrderTitle,
  suggestion,
  parts,
  open,
  onClose,
}: {
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
  const [purchaseDrafts, setPurchaseDrafts] = useState<Record<string, { supplier: string; price: string; eta: string }>>({});

  const tracked = useMemo(() => parts.filter((part) => part.workOrderId === workOrderId && part.status !== "cancelled"), [parts, workOrderId]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    async function normalize() {
      setLoadingSuggestions(true);
      try {
        const response = await fetch(`/api/mindful/inventory/vehicles/${vehicleId}/part-suggestions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: [{ workOrderId, workOrderTitle, partName: suggestion.partName, fitmentLabel: suggestion.fitmentLabel }] }),
        });
        const data = await response.json() as { items?: Array<{ searchQuery: string; recommendedParts?: RecommendedPartSuggestion[] }> };
        if (!cancelled && response.ok && data.items?.[0]) {
          setNormalizedQuery(data.items[0].searchQuery || suggestion.searchQuery);
          setRecommended(data.items[0].recommendedParts || []);
        }
      } catch {
        // Fallback suggestion is already usable.
      } finally {
        if (!cancelled) setLoadingSuggestions(false);
      }
    }
    void normalize();
    return () => { cancelled = true; };
  }, [open, suggestion.fitmentLabel, suggestion.partName, suggestion.searchQuery, vehicleId, workOrderId, workOrderTitle]);

  if (!open) return null;

  const sourceLinks = buildPartSearchSources(normalizedQuery);

  async function addPart(description: string, searchQuery: string) {
    const clean = description.trim();
    if (!clean) return;
    setWorkingId(`add:${clean}`);
    setMessage("");
    try {
      const response = await fetch(`/api/mindful/inventory/vehicles/${vehicleId}/parts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workOrderId, description: clean, quantity: 1, sourceType: "other", notes: `Lot Logic sourcing suggestion: ${searchQuery}. Verify fitment before ordering.` }),
      });
      const data = await payload(response);
      if (!response.ok) throw new Error(data.error || "Failed to add part.");
      setNewPart("");
      setMessage(`${clean} added as Needed.`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to add part.");
    } finally { setWorkingId(null); }
  }

  async function updatePart(partId: string, body: Record<string, unknown>, success: string) {
    setWorkingId(partId);
    setMessage("");
    try {
      const response = await fetch(`/api/mindful/inventory/vehicles/${vehicleId}/parts`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partId, ...body }),
      });
      const data = await payload(response);
      if (!response.ok) throw new Error(data.error || "Failed to update part.");
      setMessage(success);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to update part.");
    } finally { setWorkingId(null); }
  }

  async function markPurchased(part: InventoryPartView) {
    const draft = purchaseDrafts[part.id] || { supplier: part.supplier || "", price: part.quotedUnitPrice?.toString() || "", eta: localDateTime(part.etaAt) };
    await updatePart(part.id, {
      status: "ordered",
      supplier: draft.supplier || null,
      quotedUnitPrice: draft.price || null,
      etaAt: draft.eta ? new Date(draft.eta).toISOString() : null,
    }, `${part.description} marked purchased.`);
  }

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
      <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4">
        <div><div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">Work Order Parts</div><h3 className="mt-1 text-xl font-black">{workOrderTitle}</h3><p className="mt-1 text-xs text-slate-500">Source, purchase, and track only the parts for this job.</p></div>
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
              return <div key={`${part.name}:${index}`} className="flex flex-col gap-3 rounded-xl bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div><div className="text-sm font-black">{part.name}</div><div className="mt-1 text-[11px] text-slate-500">{part.searchQuery}</div></div>
                <div className="flex flex-wrap gap-1.5">{links.map((source) => <a key={source.key} href={source.url} target="_blank" rel="noreferrer" className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-black text-slate-600">{source.key === "turn14" ? "Turn 14" : source.label} ↗</a>)}<button disabled={alreadyTracked || workingId === `add:${part.name}`} onClick={() => void addPart(part.name, part.searchQuery)} className="rounded-md bg-slate-950 px-2.5 py-1.5 text-[11px] font-black text-white disabled:bg-slate-200 disabled:text-slate-400">{alreadyTracked ? "Tracked" : "+ Add"}</button></div>
              </div>;
            })}
          </div>
          <form onSubmit={(event: FormEvent) => { event.preventDefault(); void addPart(newPart, `${suggestion.fitmentLabel} ${newPart}`.trim()); }} className="mt-3 flex gap-2">
            <input value={newPart} onChange={(event) => setNewPart(event.target.value)} placeholder="Add a part Lot Logic missed" className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            <button disabled={!newPart.trim()} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-black disabled:opacity-40">Add Part</button>
          </form>
        </section>

        <section>
          <div className="flex items-center justify-between"><div><div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">Tracked parts</div><div className="mt-1 text-sm font-black">{tracked.length ? `${tracked.length} part${tracked.length === 1 ? "" : "s"}` : "No parts tracked yet"}</div></div></div>
          <div className="mt-3 space-y-3">
            {tracked.map((part) => {
              const draft = purchaseDrafts[part.id] || { supplier: part.supplier || "", price: part.quotedUnitPrice?.toString() || "", eta: localDateTime(part.etaAt) };
              const setDraft = (patch: Partial<typeof draft>) => setPurchaseDrafts((current) => ({ ...current, [part.id]: { ...draft, ...patch } }));
              return <div key={part.id} className="rounded-xl border border-slate-200 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><div className="text-sm font-black">{part.description}</div><div className="mt-1 text-xs text-slate-500">Qty {part.quantity} · {labelize(part.status)}{part.partNumber ? ` · ${part.partNumber}` : ""}</div></div><div className="flex gap-2">{part.status !== "received" && part.status !== "installed" ? <button disabled={workingId === part.id} onClick={() => void updatePart(part.id, { status: "received" }, `${part.description} marked received.`)} className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-800">Mark Received</button> : <span className="rounded-full bg-emerald-100 px-3 py-1.5 text-[10px] font-black text-emerald-800">✓ {labelize(part.status)}</span>}</div></div>
                {part.status === "needed" || part.status === "backordered" ? <div className="mt-3 grid gap-2 sm:grid-cols-3"><input value={draft.supplier} onChange={(event) => setDraft({ supplier: event.target.value })} placeholder="Supplier" className="rounded-lg border border-slate-200 px-3 py-2 text-xs" /><input value={draft.price} onChange={(event) => setDraft({ price: event.target.value })} placeholder="Purchase price" type="number" min="0" step="0.01" className="rounded-lg border border-slate-200 px-3 py-2 text-xs" /><input value={draft.eta} onChange={(event) => setDraft({ eta: event.target.value })} type="datetime-local" className="rounded-lg border border-slate-200 px-3 py-2 text-xs" /><button disabled={workingId === part.id} onClick={() => void markPurchased(part)} className="sm:col-span-3 rounded-lg bg-blue-700 px-3 py-2 text-xs font-black text-white">Mark Purchased / Ordered</button></div> : <div className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-3"><div><span className="font-black">Supplier:</span> {part.supplier || "—"}</div><div><span className="font-black">Price:</span> {part.quotedUnitPrice == null ? "—" : `$${part.quotedUnitPrice}`}</div><div><span className="font-black">ETA:</span> {part.etaAt ? new Date(part.etaAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—"}</div></div>}
              </div>;
            })}
          </div>
        </section>

        <div className="flex justify-between border-t border-slate-200 pt-4"><a href={`/mindful/inventory/${vehicleId}/parts`} className="text-xs font-black text-slate-500 hover:text-slate-900">Open full Parts / Transport →</a><button onClick={onClose} className="rounded-lg bg-slate-950 px-4 py-2 text-xs font-black text-white">Done</button></div>
      </div>
    </div>
  </div>;
}
