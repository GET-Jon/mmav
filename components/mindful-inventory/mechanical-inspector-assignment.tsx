"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import type { InventoryInspectionView } from "@/lib/mindful-inventory/intake-inspection";
import type { MechanicalInspectorOption, MechanicalPartnerStandardHours } from "@/lib/mindful-inventory/mechanical-assignment";

function money(value: number | null) {
  if (value === null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}
function when(value: string | null) {
  if (!value) return "Not scheduled";
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}
function slotLabel(value: string) { return when(value); }
function localInput(value: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${value.getFullYear()}-${p(value.getMonth() + 1)}-${p(value.getDate())}T${p(value.getHours())}:${p(value.getMinutes())}`;
}
const dayKeys: Array<keyof MechanicalPartnerStandardHours> = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
function minutes(value: string) { const [hour, minute] = value.split(":").map(Number); return (hour || 0) * 60 + (minute || 0); }
function availableAt(option: MechanicalInspectorOption, localStart: string) {
  if (!localStart) return true;
  const start = new Date(localStart); if (!Number.isFinite(start.getTime())) return true;
  const durationHours = Math.max(option.typicalDurationHours || 1.5, 0.25);
  const end = new Date(start.getTime() + durationHours * 3600000);
  const hours = option.standardHours?.[dayKeys[start.getDay()]];
  if (hours) {
    if (!hours.enabled) return false;
    const startMinutes = start.getHours() * 60 + start.getMinutes(); const endMinutes = end.getHours() * 60 + end.getMinutes();
    if (startMinutes < minutes(hours.start) || endMinutes > minutes(hours.end) || start.toDateString() !== end.toDateString()) return false;
  }
  return !option.busySlots.some((slot) => start.getTime() < new Date(slot.endAt).getTime() && end.getTime() > new Date(slot.startAt).getTime());
}
function nextAvailableSlots(option: MechanicalInspectorOption, count = 4) {
  const results: string[] = []; const start = new Date(); start.setSeconds(0, 0); const remainder = start.getMinutes() % 15; if (remainder) start.setMinutes(start.getMinutes() + (15 - remainder));
  for (let offset = 0; offset < 10 * 24 * 4 && results.length < count; offset += 1) { const candidate = new Date(start.getTime() + offset * 15 * 60_000); const local = localInput(candidate); if (availableAt(option, local)) results.push(local); }
  return results;
}

type Props = {
  vehicleId: string;
  options: MechanicalInspectorOption[];
  inspection: InventoryInspectionView | null;
  pendingFindingReviews?: number;
  pendingUpgradeReviews?: number;
};

export function MechanicalInspectorAssignment({ vehicleId, options, inspection, pendingFindingReviews = 0, pendingUpgradeReviews = 0 }: Props) {
  const router = useRouter();
  const [requestedStartAt, setRequestedStartAt] = useState(inspection?.requestedStartAt?.slice(0, 16) || "");
  const recommended = useMemo(() => { const available = requestedStartAt ? options.filter((option) => availableAt(option, requestedStartAt)) : options; return available[0] || options[0] || null; }, [options, requestedStartAt]);
  const [partnerId, setPartnerId] = useState(inspection?.performedByPartnerId || recommended?.id || "");
  const selected = options.find((option) => option.id === partnerId) || null;
  const suggestedSlots = useMemo(() => selected ? nextAvailableSlots(selected) : [], [selected]);
  const [fee, setFee] = useState(inspection?.inspectionFee === null || inspection?.inspectionFee === undefined ? (selected?.defaultInspectionFee === null || selected?.defaultInspectionFee === undefined ? "" : String(selected.defaultInspectionFee)) : String(inspection.inspectionFee));
  const [revisionNotes, setRevisionNotes] = useState(""); const [working, setWorking] = useState(false); const [message, setMessage] = useState("");
  const reviewRemaining = pendingFindingReviews + pendingUpgradeReviews;

  async function assign() {
    if (!partnerId) return; setWorking(true); setMessage("");
    try { const response = await fetch(`/api/mindful/inventory/vehicles/${vehicleId}/inspection-assignment`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ partnerId, requestedStartAt: requestedStartAt ? new Date(requestedStartAt).toISOString() : null, inspectionFee: fee }) }); const payload = await response.json(); if (!response.ok) throw new Error(payload.error || "Inspection could not be assigned."); setMessage("Inspection assigned. It is now waiting for the mechanic to confirm."); router.refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Inspection could not be assigned."); } finally { setWorking(false); }
  }
  async function review(decision: "accept" | "revision") {
    setWorking(true); setMessage("");
    try { const response = await fetch(`/api/mindful/inventory/vehicles/${vehicleId}/inspection-assignment`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision, notes: revisionNotes }) }); const payload = await response.json(); if (!response.ok) throw new Error(payload.error || "Inspection review could not be saved."); setMessage(decision === "accept" ? "Inspection accepted. Work Plan can now be built." : "Revision request sent to the inspector."); router.refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Inspection review could not be saved."); } finally { setWorking(false); }
  }

  if (inspection?.status === "submitted") return <section className="rounded-2xl border border-blue-200 bg-blue-50 p-5 shadow-sm">
    <div className="text-xs font-black uppercase tracking-[0.1em] text-blue-600">Owner Review Required</div><h2 className="mt-1 text-xl font-black text-slate-950">Mechanical inspection submitted</h2><p className="mt-1 text-sm text-slate-600">Review the mechanic&apos;s findings and requested upgrades below. Accepting the inspection completes Mechanical; it does not assign resulting work to the inspector.</p>
    {inspection.summary ? <div className="mt-4 rounded-xl border border-blue-100 bg-white px-4 py-3 text-sm text-slate-700"><span className="font-black">Inspector summary:</span> {inspection.summary}</div> : null}
    {reviewRemaining ? <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">Complete the review below before accepting: {pendingFindingReviews} finding{pendingFindingReviews === 1 ? "" : "s"} and {pendingUpgradeReviews} upgrade{pendingUpgradeReviews === 1 ? "" : "s"} still unresolved.</div> : <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-900">All required mechanical review is complete. This inspection is ready to accept.</div>}
    <textarea value={revisionNotes} onChange={(e) => setRevisionNotes(e.target.value)} placeholder="Revision notes if the entire inspection needs another pass" className="mt-4 min-h-20 w-full rounded-xl border border-blue-200 bg-white px-3 py-2 text-sm" />
    <div className="mt-3 flex flex-wrap gap-2"><button disabled={working || reviewRemaining > 0} onClick={() => void review("accept")} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-black text-white disabled:bg-slate-300">Accept Inspection</button><button disabled={working || !revisionNotes.trim()} onClick={() => void review("revision")} className="rounded-xl border border-amber-300 bg-white px-4 py-2.5 text-sm font-black text-amber-800">Request Full Revision</button></div>{message ? <div className="mt-3 text-sm font-bold text-slate-700">{message}</div> : null}
  </section>;

  if (inspection?.performedByPartnerId && !["complete", "cancelled"].includes(inspection.status)) {
    const assigned = options.find((option) => option.id === inspection.performedByPartnerId);
    return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">Mechanical Inspector</div><h2 className="mt-1 text-xl font-black">{assigned?.name || "Assigned mechanic"}</h2><div className="mt-1 text-sm text-slate-500">{inspection.status.replaceAll("_", " ")} · {when(inspection.scheduledStartAt || inspection.requestedStartAt)} · {money(inspection.inspectionFee)}</div></div><span className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-black uppercase text-blue-700">{inspection.status.replaceAll("_", " ")}</span></div>{message ? <div className="mt-3 text-sm font-bold text-slate-700">{message}</div> : null}</section>;
  }
  if (inspection?.status === "complete") return null;

  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">Inspection Setup</div><h2 className="mt-1 text-xl font-black">Assign a mechanical inspector</h2><p className="mt-1 max-w-3xl text-sm text-slate-500">Lot Logic recommends among admin-approved inspectors using their working hours, scheduled inspections, scheduled Work Orders, and current inspection load. The Owner confirms the assignment.</p></div>{recommended ? <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-black text-emerald-700">Recommended: {recommended.name}</span> : null}</div>
    {options.length ? <><div className="mt-4 grid gap-3 lg:grid-cols-[1.4fr_1fr_0.7fr_auto]"><select value={partnerId} onChange={(e) => { const next = options.find((option) => option.id === e.target.value); setPartnerId(e.target.value); setRequestedStartAt(""); if (next?.defaultInspectionFee !== null && next?.defaultInspectionFee !== undefined) setFee(String(next.defaultInspectionFee)); }} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold"><option value="">Choose inspector</option>{options.map((option) => { const available = availableAt(option, requestedStartAt); return <option key={option.id} value={option.id}>{option.name}{recommended?.id === option.id ? " — recommended" : ""}{requestedStartAt ? (available ? " · available" : " · conflict") : ` · ${option.openInspectionCount} open`}</option>; })}</select><input type="datetime-local" step="900" value={requestedStartAt} onChange={(e) => setRequestedStartAt(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold" /><input inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} placeholder="Fee" className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold" /><button disabled={working || !partnerId || !requestedStartAt} onClick={() => void assign()} className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white disabled:bg-slate-300">Assign Inspection</button></div>
      {selected ? <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50/50 px-4 py-3"><div className="text-[10px] font-black uppercase tracking-[0.1em] text-blue-700">Suggested available times</div><div className="mt-2 flex flex-wrap gap-2">{suggestedSlots.map((slot) => <button key={slot} type="button" onClick={() => setRequestedStartAt(slot)} className={`rounded-lg border px-3 py-2 text-xs font-black ${requestedStartAt === slot ? "border-blue-700 bg-blue-700 text-white" : "border-blue-200 bg-white text-blue-900"}`}>{slotLabel(slot)}</button>)}</div><div className="mt-2 text-xs font-semibold text-slate-500">Suggestions use {selected.name}&apos;s working hours, current inspection/work schedule, and typical {selected.typicalDurationHours ?? 1.5} hr inspection duration. Choose one above or enter another 15-minute time.</div></div> : null}</> : <div className="mt-4 rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm font-semibold text-slate-500">No partners are currently marked eligible for mechanical inspections. Enable one in Admin → Partners.</div>}
    {selected ? <div className="mt-3 text-xs font-semibold text-slate-500">{selected.companyName || "Independent partner"}{selected.locationText ? ` · ${selected.locationText}` : ""} · {selected.openInspectionCount} open inspection{selected.openInspectionCount === 1 ? "" : "s"} · typical {selected.typicalDurationHours ?? "—"} hr{requestedStartAt ? ` · ${availableAt(selected, requestedStartAt) ? "available at requested time" : "schedule conflict at requested time"}` : ""}</div> : null}{message ? <div className="mt-3 text-sm font-bold text-slate-700">{message}</div> : null}
  </section>;
}
