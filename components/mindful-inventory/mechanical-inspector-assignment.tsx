"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import type { InventoryInspectionView } from "@/lib/mindful-inventory/intake-inspection";
import type { MechanicalInspectorOption } from "@/lib/mindful-inventory/mechanical-assignment";

function money(value: number | null) {
  if (value === null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function when(value: string | null) {
  if (!value) return "Not scheduled";
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

export function MechanicalInspectorAssignment({ vehicleId, options, inspection }: { vehicleId: string; options: MechanicalInspectorOption[]; inspection: InventoryInspectionView | null }) {
  const router = useRouter();
  const recommended = useMemo(() => options.find((option) => option.recommended) || options[0] || null, [options]);
  const [partnerId, setPartnerId] = useState(inspection?.performedByPartnerId || recommended?.id || "");
  const selected = options.find((option) => option.id === partnerId) || null;
  const [requestedStartAt, setRequestedStartAt] = useState(inspection?.requestedStartAt?.slice(0, 16) || "");
  const [fee, setFee] = useState(inspection?.inspectionFee === null || inspection?.inspectionFee === undefined ? (selected?.defaultInspectionFee === null || selected?.defaultInspectionFee === undefined ? "" : String(selected.defaultInspectionFee)) : String(inspection.inspectionFee));
  const [revisionNotes, setRevisionNotes] = useState("");
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");

  async function assign() {
    if (!partnerId) return;
    setWorking(true); setMessage("");
    try {
      const response = await fetch(`/api/mindful/inventory/vehicles/${vehicleId}/inspection-assignment`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ partnerId, requestedStartAt: requestedStartAt ? new Date(requestedStartAt).toISOString() : null, inspectionFee: fee }) });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error || "Inspection could not be assigned.");
      setMessage("Inspection assigned. It is now waiting for the mechanic to confirm."); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Inspection could not be assigned."); }
    finally { setWorking(false); }
  }

  async function review(decision: "accept" | "revision") {
    setWorking(true); setMessage("");
    try {
      const response = await fetch(`/api/mindful/inventory/vehicles/${vehicleId}/inspection-assignment`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision, notes: revisionNotes }) });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error || "Inspection review could not be saved.");
      setMessage(decision === "accept" ? "Inspection accepted. Work Plan can now be built." : "Revision request sent to the inspector."); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Inspection review could not be saved."); }
    finally { setWorking(false); }
  }

  if (inspection?.status === "submitted") return <section className="rounded-2xl border border-blue-200 bg-blue-50 p-5 shadow-sm"><div className="text-xs font-black uppercase tracking-[0.1em] text-blue-600">Owner Review Required</div><h2 className="mt-1 text-xl font-black text-slate-950">Mechanical inspection submitted</h2><p className="mt-1 text-sm text-slate-600">Review the mechanic's findings below. Accepting the inspection completes Mechanical; it does not assign the resulting work to the inspector.</p>{inspection.summary ? <div className="mt-4 rounded-xl border border-blue-100 bg-white px-4 py-3 text-sm text-slate-700"><span className="font-black">Inspector summary:</span> {inspection.summary}</div> : null}<textarea value={revisionNotes} onChange={(e) => setRevisionNotes(e.target.value)} placeholder="Revision notes if clarification or another check is needed" className="mt-4 min-h-20 w-full rounded-xl border border-blue-200 bg-white px-3 py-2 text-sm" /><div className="mt-3 flex flex-wrap gap-2"><button disabled={working} onClick={() => void review("accept")} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-black text-white">Accept Inspection</button><button disabled={working || !revisionNotes.trim()} onClick={() => void review("revision")} className="rounded-xl border border-amber-300 bg-white px-4 py-2.5 text-sm font-black text-amber-800">Request Revision</button></div>{message ? <div className="mt-3 text-sm font-bold text-slate-700">{message}</div> : null}</section>;

  if (inspection?.performedByPartnerId && !["complete", "cancelled"].includes(inspection.status)) {
    const assigned = options.find((option) => option.id === inspection.performedByPartnerId);
    return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">Mechanical Inspector</div><h2 className="mt-1 text-xl font-black">{assigned?.name || "Assigned mechanic"}</h2><div className="mt-1 text-sm text-slate-500">{inspection.status.replaceAll("_", " ")} · {when(inspection.scheduledStartAt || inspection.requestedStartAt)} · {money(inspection.inspectionFee)}</div></div><span className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-black uppercase text-blue-700">{inspection.status.replaceAll("_", " ")}</span></div>{message ? <div className="mt-3 text-sm font-bold text-slate-700">{message}</div> : null}</section>;
  }

  if (inspection?.status === "complete") return null;

  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">Inspection Setup</div><h2 className="mt-1 text-xl font-black">Assign a mechanical inspector</h2><p className="mt-1 max-w-3xl text-sm text-slate-500">Lot Logic recommends among admin-approved mechanical inspectors using current inspection load. The Owner confirms the assignment.</p></div>{recommended ? <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-black text-emerald-700">Recommended: {recommended.name}</span> : null}</div>
    {options.length ? <div className="mt-4 grid gap-3 lg:grid-cols-[1.4fr_1fr_0.7fr_auto]"><select value={partnerId} onChange={(e) => { const next = options.find((option) => option.id === e.target.value); setPartnerId(e.target.value); if (next?.defaultInspectionFee !== null && next?.defaultInspectionFee !== undefined) setFee(String(next.defaultInspectionFee)); }} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold"><option value="">Choose inspector</option>{options.map((option) => <option key={option.id} value={option.id}>{option.name}{option.recommended ? " — recommended" : ""} · {option.openInspectionCount} open</option>)}</select><input type="datetime-local" value={requestedStartAt} onChange={(e) => setRequestedStartAt(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold" /><input inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} placeholder="Fee" className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold" /><button disabled={working || !partnerId} onClick={() => void assign()} className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white disabled:bg-slate-300">Assign Inspection</button></div> : <div className="mt-4 rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm font-semibold text-slate-500">No partners are currently marked eligible for mechanical inspections. Enable one in Admin → Partners.</div>}
    {selected ? <div className="mt-3 text-xs font-semibold text-slate-500">{selected.companyName || "Independent partner"}{selected.locationText ? ` · ${selected.locationText}` : ""} · {selected.openInspectionCount} open inspection{selected.openInspectionCount === 1 ? "" : "s"} · typical {selected.typicalDurationHours ?? "—"} hr</div> : null}{message ? <div className="mt-3 text-sm font-bold text-slate-700">{message}</div> : null}
  </section>;
}
