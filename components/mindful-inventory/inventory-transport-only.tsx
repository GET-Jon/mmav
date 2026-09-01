"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import type { InventoryPartsTransportData, InventoryTransportStatus } from "@/lib/mindful-inventory/parts-transport";

function shortDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
}
function labelize(value: string) { return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
async function parseResponse(response: Response) { const text = await response.text(); if (!text.trim()) return {} as { error?: string }; try { return JSON.parse(text) as { error?: string }; } catch { throw new Error(`Request failed (${response.status}).`); } }

export function InventoryTransportOnly({ vehicleId, data }: { vehicleId: string; data: InventoryPartsTransportData }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [originLocationId, setOriginLocationId] = useState("");
  const [destinationLocationId, setDestinationLocationId] = useState("");
  const [transporterPartnerId, setTransporterPartnerId] = useState("");
  const [externalTransporterName, setExternalTransporterName] = useState("");
  const [pickupScheduledAt, setPickupScheduledAt] = useState("");
  const [expectedDeliveryAt, setExpectedDeliveryAt] = useState("");
  const [quotedCost, setQuotedCost] = useState("");
  const [notes, setNotes] = useState("");
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const locationName = (id: string | null) => data.locations.find((l) => l.id === id)?.name || "Unspecified";
  const partnerName = (id: string | null) => { const p = data.partners.find((item) => item.id === id); return p ? (p.companyName ? `${p.name} · ${p.companyName}` : p.name) : null; };

  async function addTransport(event: FormEvent) {
    event.preventDefault(); setWorkingId("new"); setMessage("");
    try {
      const response = await fetch(`/api/mindful/inventory/vehicles/${vehicleId}/transportation`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ originLocationId: originLocationId || null, destinationLocationId: destinationLocationId || null, transporterPartnerId: transporterPartnerId || null, externalTransporterName: transporterPartnerId ? null : externalTransporterName, pickupScheduledAt: pickupScheduledAt ? new Date(pickupScheduledAt).toISOString() : null, expectedDeliveryAt: expectedDeliveryAt ? new Date(expectedDeliveryAt).toISOString() : null, quotedCost: quotedCost || null, notes }) });
      const payload = await parseResponse(response); if (!response.ok) throw new Error(payload.error || "Failed to request transport.");
      setExpanded(false); setMessage("Transport requested."); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Failed to request transport."); }
    finally { setWorkingId(null); }
  }

  async function updateStatus(id: string, status: InventoryTransportStatus) {
    setWorkingId(id); setMessage("");
    try {
      const response = await fetch(`/api/mindful/inventory/vehicles/${vehicleId}/transportation`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ transportationId: id, status }) });
      const payload = await parseResponse(response); if (!response.ok) throw new Error(payload.error || "Failed to update transport."); setMessage(`Transport marked ${labelize(status)}.`); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Failed to update transport."); }
    finally { setWorkingId(null); }
  }

  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
    <div className="flex items-start justify-between gap-4"><div><div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">Vehicle Logistics</div><h2 className="mt-1 text-xl font-black">Transport</h2><p className="mt-1 text-sm text-slate-500">Vehicle movement stays separate from Work Order parts.</p></div><button onClick={() => setExpanded((v) => !v)} className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white">{expanded ? "Cancel" : "+ Add Transport"}</button></div>
    {message ? <div className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700">{message}</div> : null}
    {expanded ? <form onSubmit={addTransport} className="mt-4 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-3"><select value={originLocationId} onChange={(e) => setOriginLocationId(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"><option value="">Origin</option>{data.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select><select value={destinationLocationId} onChange={(e) => setDestinationLocationId(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"><option value="">Destination</option>{data.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select><select value={transporterPartnerId} onChange={(e) => setTransporterPartnerId(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"><option value="">External transporter</option>{data.partners.map((p) => <option key={p.id} value={p.id}>{p.companyName ? `${p.name} · ${p.companyName}` : p.name}</option>)}</select>{!transporterPartnerId ? <input value={externalTransporterName} onChange={(e) => setExternalTransporterName(e.target.value)} placeholder="Transporter name" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" /> : null}<input type="datetime-local" value={pickupScheduledAt} onChange={(e) => setPickupScheduledAt(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" /><input type="datetime-local" value={expectedDeliveryAt} onChange={(e) => setExpectedDeliveryAt(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" /><input type="number" min="0" step="0.01" value={quotedCost} onChange={(e) => setQuotedCost(e.target.value)} placeholder="Quoted cost" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" /><input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm sm:col-span-2" /><div className="flex justify-end lg:col-span-3"><button disabled={workingId === "new"} className="rounded-lg bg-slate-950 px-4 py-2 text-xs font-black text-white">{workingId === "new" ? "Saving…" : "Save Transport"}</button></div></form> : null}
    <div className="mt-4 space-y-2">{data.transportation.length ? data.transportation.map((t) => <div key={t.id} className="flex flex-col gap-3 rounded-xl border border-slate-200 px-4 py-3 lg:flex-row lg:items-center lg:justify-between"><div><div className="text-sm font-black">{locationName(t.originLocationId)} → {locationName(t.destinationLocationId)}</div><div className="mt-1 text-xs text-slate-500">{partnerName(t.transporterPartnerId) || t.externalTransporterName || "Transporter not assigned"} · Pickup {shortDate(t.pickupScheduledAt)} · ETA {shortDate(t.expectedDeliveryAt)}</div></div><select disabled={workingId === t.id} value={t.status} onChange={(e) => void updateStatus(t.id, e.target.value as InventoryTransportStatus)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold"><option value="requested">Requested</option><option value="booked">Booked</option><option value="awaiting_pickup">Awaiting Pickup</option><option value="in_transit">In Transit</option><option value="delayed">Delayed</option><option value="delivered">Delivered</option><option value="cancelled">Cancelled</option></select></div>) : <div className="rounded-xl border border-dashed border-slate-300 px-4 py-4 text-sm font-semibold text-slate-500">No vehicle transport currently tracked.</div>}</div>
  </section>;
}
