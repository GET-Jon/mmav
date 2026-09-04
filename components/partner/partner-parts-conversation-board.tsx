"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

function money(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
}

type Message = {
  id: string;
  actor_type: "owner" | "partner" | "system";
  message_type: string;
  body: string;
  unit_price: number | string | null;
  source_url: string | null;
  created_at: string;
};

type Item = {
  id: string;
  work_order_id: string;
  workTitle: string;
  vehicleLabel: string;
  description: string;
  quantity: number | string;
  part_number: string | null;
  requirement_status: string;
  partner_offer_unit_price: number | string | null;
  partner_offer_note: string | null;
  fulfillment_method: string | null;
  sourcing_owner: string | null;
  owner_target_unit_price_low: number | string | null;
  owner_target_unit_price_high: number | string | null;
  owner_decision_note: string | null;
  messages: Message[];
};

function direction(item: Item) {
  if (item.requirement_status === "not_required" || item.fulfillment_method === "not_required") return "Owner marked not required";
  if (item.fulfillment_method === "partner_supplied") return "Owner wants you to supply it";
  if (item.fulfillment_method === "mindful_purchase") return "Owner is sourcing it";
  if (item.fulfillment_method === "in_stock") return "Owner has it in stock";
  if (item.fulfillment_method === "customer_supplied") return "Another source is supplying it";
  return "Waiting for Owner sourcing decision";
}

export function PartnerPartsConversationBoard({ workOrderIds }: { workOrderIds: string[] }) {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [drafts, setDrafts] = useState<Record<string, { price: string; note: string; url: string }>>({});
  const [newPartOpen, setNewPartOpen] = useState(false);
  const [newPart, setNewPart] = useState({ workOrderId: workOrderIds[0] || "", description: "", quantity: "1", partNumber: "", price: "", note: "" });

  async function load() {
    try {
      const response = await fetch("/api/partner/parts-conversations", { cache: "no-store" });
      const data = await response.json() as { items?: Item[]; error?: string };
      if (!response.ok) throw new Error(data.error || "Could not load parts conversations.");
      setItems(data.items || []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load parts conversations.");
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, Item[]>();
    items.forEach((item) => {
      const key = `${item.vehicleLabel}||${item.workTitle}||${item.work_order_id}`;
      map.set(key, [...(map.get(key) || []), item]);
    });
    return Array.from(map.entries());
  }, [items]);

  function draft(item: Item) {
    return drafts[item.id] || {
      price: item.partner_offer_unit_price == null ? "" : String(item.partner_offer_unit_price),
      note: item.partner_offer_note || "",
      url: "",
    };
  }

  async function submitOffer(item: Item) {
    const value = draft(item);
    setWorking(item.id); setMessage("");
    try {
      const response = await fetch("/api/partner/parts-conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "offer", requirementId: item.id, unitPrice: value.price || null, note: value.note, sourceUrl: value.url || null }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Could not send parts offer.");
      setMessage("Parts offer sent to the Owner.");
      await load();
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not send parts offer."); }
    finally { setWorking(null); }
  }

  async function sendMessage(item: Item) {
    const value = draft(item);
    if (!value.note.trim()) return;
    setWorking(item.id); setMessage("");
    try {
      const response = await fetch("/api/partner/parts-conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "message", requirementId: item.id, note: value.note, unitPrice: value.price || null, sourceUrl: value.url || null }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Could not send parts note.");
      setDrafts((current) => ({ ...current, [item.id]: { ...value, note: "", url: "" } }));
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not send parts note."); }
    finally { setWorking(null); }
  }

  async function suggestPart() {
    if (!newPart.workOrderId || !newPart.description.trim()) return;
    setWorking("new"); setMessage("");
    try {
      const response = await fetch("/api/partner/parts-conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "suggest",
          workOrderId: newPart.workOrderId,
          description: newPart.description,
          quantity: newPart.quantity,
          partNumber: newPart.partNumber,
          unitPrice: newPart.price || null,
          note: newPart.note,
        }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Could not suggest part.");
      setNewPart({ workOrderId: newPart.workOrderId, description: "", quantity: "1", partNumber: "", price: "", note: "" });
      setNewPartOpen(false);
      setMessage("Part suggestion sent to the Owner.");
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not suggest part."); }
    finally { setWorking(null); }
  }

  if (!workOrderIds.length) return null;

  return <section className="mt-6 rounded-2xl border border-slate-200 bg-white shadow-sm">
    <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
      <div><div className="text-[10px] font-black uppercase tracking-[0.14em] text-blue-600">Parts conversation</div><h2 className="mt-1 text-xl font-black">Parts & sourcing</h2><p className="mt-1 max-w-3xl text-sm text-slate-600">Tell the Owner what the job needs, what you can supply it for, or whether they may want to source it themselves. The Owner makes the final sourcing decision.</p></div>
      <button type="button" onClick={() => setNewPartOpen((value) => !value)} className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white">+ Suggest a Part</button>
    </div>
    <div className="p-5">
      {message ? <div className="mb-4 rounded-xl bg-blue-50 px-4 py-3 text-sm font-bold text-blue-900">{message}</div> : null}
      {newPartOpen ? <div className="mb-5 rounded-xl border border-blue-200 bg-blue-50/40 p-4"><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[1.2fr_1.6fr_90px_140px_140px]">
        <select value={newPart.workOrderId} onChange={(e) => setNewPart((current) => ({ ...current, workOrderId: e.target.value }))} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs">{workOrderIds.map((id) => <option key={id} value={id}>{items.find((item) => item.work_order_id === id)?.workTitle || `Work ${id.slice(0, 8)}`}</option>)}</select>
        <input value={newPart.description} onChange={(e) => setNewPart((current) => ({ ...current, description: e.target.value }))} placeholder="Part needed" className="rounded-lg border border-slate-200 px-3 py-2 text-xs" />
        <input inputMode="decimal" value={newPart.quantity} onChange={(e) => setNewPart((current) => ({ ...current, quantity: e.target.value }))} placeholder="Qty" className="rounded-lg border border-slate-200 px-3 py-2 text-xs" />
        <input value={newPart.partNumber} onChange={(e) => setNewPart((current) => ({ ...current, partNumber: e.target.value }))} placeholder="Part #" className="rounded-lg border border-slate-200 px-3 py-2 text-xs" />
        <input inputMode="decimal" value={newPart.price} onChange={(e) => setNewPart((current) => ({ ...current, price: e.target.value }))} placeholder="I can get for $" className="rounded-lg border border-slate-200 px-3 py-2 text-xs" />
      </div><div className="mt-2 flex gap-2"><input value={newPart.note} onChange={(e) => setNewPart((current) => ({ ...current, note: e.target.value }))} placeholder="e.g. I can get one for $20; you may find it for $10–15 online." className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-xs" /><button disabled={working === "new" || !newPart.description.trim()} onClick={() => void suggestPart()} className="rounded-lg bg-blue-700 px-4 py-2 text-xs font-black text-white disabled:opacity-40">Send suggestion</button></div></div> : null}

      {loading ? <div className="py-6 text-sm font-bold text-slate-500">Loading parts conversations…</div> : null}
      {!loading && !items.length ? <div className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm font-semibold text-slate-500">No part requirements are attached to your assigned work yet. Use “Suggest a Part” when the job needs one.</div> : null}
      <div className="space-y-4">{grouped.map(([key, group]) => <div key={key} className="rounded-xl border border-slate-200"><div className="border-b border-slate-100 bg-slate-50 px-4 py-3"><div className="text-xs font-black text-slate-500">{group[0].vehicleLabel}</div><div className="mt-0.5 font-black">{group[0].workTitle}</div></div><div className="space-y-3 p-4">{group.map((item) => { const value = draft(item); return <div key={item.id} className="rounded-xl border border-slate-200 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="font-black">{item.description} <span className="text-xs text-slate-400">×{item.quantity}</span></div>{item.part_number ? <div className="mt-1 text-xs text-slate-500">Part # {item.part_number}</div> : null}<div className="mt-1 text-xs font-bold text-blue-700">{direction(item)}</div>{item.owner_target_unit_price_low != null || item.owner_target_unit_price_high != null ? <div className="mt-1 text-xs text-slate-500">Owner target: {item.owner_target_unit_price_low != null ? money(Number(item.owner_target_unit_price_low)) : ""}{item.owner_target_unit_price_low != null && item.owner_target_unit_price_high != null ? "–" : ""}{item.owner_target_unit_price_high != null ? money(Number(item.owner_target_unit_price_high)) : ""}</div> : null}</div>{item.partner_offer_unit_price != null ? <div className="rounded-lg bg-blue-50 px-3 py-2 text-sm font-black text-blue-900">Your offer: {money(Number(item.partner_offer_unit_price))}</div> : null}</div>
          {item.messages.length ? <div className="mt-3 space-y-2">{item.messages.map((entry) => <div key={entry.id} className={`rounded-lg px-3 py-2 text-xs ${entry.actor_type === "partner" ? "ml-8 bg-slate-950 text-white" : entry.actor_type === "owner" ? "mr-8 bg-blue-50 text-blue-950" : "bg-slate-100 text-slate-700"}`}><div className="font-black uppercase opacity-60">{entry.actor_type === "partner" ? "You" : entry.actor_type === "owner" ? "Owner" : "Lot Logic"}{entry.unit_price != null ? ` · ${money(Number(entry.unit_price))}` : ""}</div><div className="mt-0.5">{entry.body}</div>{entry.source_url ? <a href={entry.source_url} target="_blank" rel="noreferrer" className="mt-1 inline-block font-black underline">Open source ↗</a> : null}</div>)}</div> : null}
          <div className="mt-3 grid gap-2 sm:grid-cols-[130px_1fr_1fr_auto_auto]"><input inputMode="decimal" value={value.price} onChange={(e) => setDrafts((current) => ({ ...current, [item.id]: { ...value, price: e.target.value } }))} placeholder="Your price $" className="rounded-lg border border-slate-200 px-3 py-2 text-xs" /><input value={value.note} onChange={(e) => setDrafts((current) => ({ ...current, [item.id]: { ...value, note: e.target.value } }))} placeholder="Note to Owner" className="rounded-lg border border-slate-200 px-3 py-2 text-xs" /><input value={value.url} onChange={(e) => setDrafts((current) => ({ ...current, [item.id]: { ...value, url: e.target.value } }))} placeholder="Optional source URL" className="rounded-lg border border-slate-200 px-3 py-2 text-xs" /><button disabled={working === item.id || (!value.price && !value.note.trim())} onClick={() => void submitOffer(item)} className="rounded-lg bg-blue-700 px-3 py-2 text-xs font-black text-white disabled:opacity-40">Send offer</button><button disabled={working === item.id || !value.note.trim()} onClick={() => void sendMessage(item)} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-black disabled:opacity-40">Send note</button></div></div>; })}</div></div>)}</div>
    </div>
  </section>;
}
