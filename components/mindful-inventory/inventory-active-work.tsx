"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import type {
  InventorySchedulingLocationOption,
  InventorySchedulingResourceOption,
  InventoryWorkOrderView,
} from "@/lib/mindful-inventory/active-work";
import { suggestedPerformerForWork, type InventoryPerformerOption } from "@/lib/mindful-inventory/performers";

function money(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}
function labelize(value: string) { return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function hours(minutes: number | null | undefined) { return minutes == null ? "—" : `${Math.round((minutes / 60) * 10) / 10} hr`; }
function dayKey(value: string | null) {
  if (!value) return "unscheduled";
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function dayLabel(value: string) { return new Date(`${value}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }); }
function timeLabel(value: string | null) { return value ? new Date(value).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "Time TBD"; }
function dateTimeLabel(value: string | null) { return value ? new Date(value).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "Not scheduled"; }
function localInput(value: string | null) {
  if (!value) return "";
  const d = new Date(value);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function statusClass(status: InventoryWorkOrderView["status"]) {
  if (status === "complete") return "bg-emerald-100 text-emerald-700";
  if (status === "in_progress") return "bg-blue-100 text-blue-700";
  if (status === "scheduled") return "bg-violet-100 text-violet-700";
  if (status === "blocked") return "bg-amber-100 text-amber-800";
  if (status === "cancelled") return "bg-slate-200 text-slate-500";
  return "bg-slate-100 text-slate-700";
}
function performerKey(work: InventoryWorkOrderView) {
  if (work.assignedPartnerId) return `partner:${work.assignedPartnerId}`;
  if (work.assignedUserId) return `user:${work.assignedUserId}`;
  return "unassigned";
}

type VehicleContext = {
  year: number;
  make: string;
  model: string;
  trim: string | null;
  vin: string | null;
  stockNumber: string | null;
};

export function InventoryActiveWork({ vehicleId, vehicle, workOrders, performerOptions, locationOptions, resourceOptions }: {
  vehicleId: string;
  vehicle: VehicleContext;
  workOrders: InventoryWorkOrderView[];
  performerOptions: InventoryPerformerOption[];
  locationOptions: InventorySchedulingLocationOption[];
  resourceOptions: InventorySchedulingResourceOption[];
}) {
  const router = useRouter();
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [scheduleDrafts, setScheduleDrafts] = useState<Record<string, string>>({});
  const [scheduleMessages, setScheduleMessages] = useState<Record<string, { type: "success" | "error"; text: string }>>({});
  const [emailPartnerId, setEmailPartnerId] = useState<string | null>(null);
  const [copyMessage, setCopyMessage] = useState("");

  const completed = workOrders.filter((work) => work.status === "complete" || work.status === "cancelled").length;
  const activeBudget = workOrders.reduce((sum, work) => sum + work.approvedBudget, 0);
  const totalLabor = workOrders.reduce((sum, work) => sum + (work.estimatedLaborMinutes || 0), 0);
  const openWork = workOrders.filter((work) => !["complete", "cancelled"].includes(work.status));
  const awaitingPartnerCount = openWork.filter((work) => work.partnerConfirmationStatus === "awaiting_partner").length;
  const unscheduledCount = openWork.filter((work) => !work.scheduledStartAt && work.partnerConfirmationStatus !== "awaiting_partner").length;
  const unassignedCount = openWork.filter((work) => !work.performerName).length;
  const locationTbdCount = openWork.filter((work) => !work.locationId).length;
  const blockedCount = openWork.filter((work) => work.status === "blocked").length;
  const scheduleReady = unscheduledCount === 0 && awaitingPartnerCount === 0 && unassignedCount === 0 && locationTbdCount === 0 && blockedCount === 0;
  const forecastReady = [...workOrders].filter((w) => w.scheduledEndAt && w.status !== "cancelled").sort((a,b) => new Date(b.scheduledEndAt!).getTime()-new Date(a.scheduledEndAt!).getTime())[0]?.scheduledEndAt || null;
  const nextWork = [...workOrders].filter((w) => !["complete","cancelled"].includes(w.status)).sort((a,b) => {
    if (a.status === "in_progress" && b.status !== "in_progress") return -1;
    if (b.status === "in_progress" && a.status !== "in_progress") return 1;
    const aTime = a.scheduledStartAt || a.proposedStartAt;
    const bTime = b.scheduledStartAt || b.proposedStartAt;
    if (!aTime) return 1; if (!bTime) return -1;
    return new Date(aTime).getTime()-new Date(bTime).getTime();
  })[0] || null;

  const grouped = useMemo(() => {
    const map = new Map<string, InventoryWorkOrderView[]>();
    [...workOrders].sort((a,b) => (a.scheduledStartAt ? new Date(a.scheduledStartAt).getTime() : Number.MAX_SAFE_INTEGER) - (b.scheduledStartAt ? new Date(b.scheduledStartAt).getTime() : Number.MAX_SAFE_INTEGER)).forEach((work) => {
      const key = dayKey(work.scheduledStartAt); map.set(key, [...(map.get(key) || []), work]);
    });
    return Array.from(map.entries());
  }, [workOrders]);

  const emailWork = useMemo(() => workOrders
    .filter((work) => work.assignedPartnerId === emailPartnerId && work.partnerConfirmationStatus === "awaiting_partner")
    .sort((a, b) => new Date(a.proposedStartAt || 0).getTime() - new Date(b.proposedStartAt || 0).getTime()), [workOrders, emailPartnerId]);
  const emailAnchor = emailWork[0] || null;
  const vehicleLabel = [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(" ");
  const earliestProposal = emailWork.map((work) => work.proposedStartAt).filter(Boolean).sort()[0] || null;
  const latestProposalEnd = emailWork.map((work) => work.proposedEndAt).filter(Boolean).sort().at(-1) || null;
  const emailSubject = emailAnchor ? `${vehicleLabel} — service scheduling request` : "";
  const emailBody = emailAnchor ? [
    `Hi ${emailAnchor.performerName?.split(" · ")[0] || "there"},`,
    "",
    `We'd like to coordinate the following work for our ${vehicleLabel}${vehicle.vin ? ` (VIN ${vehicle.vin})` : vehicle.stockNumber ? ` (Stock #${vehicle.stockNumber})` : ""}:`,
    "",
    ...emailWork.map((work) => `• ${work.title}${work.description ? ` — ${work.description}` : ""}${work.estimatedElapsedMinutes ? ` (${hours(work.estimatedElapsedMinutes)} estimated turnaround)` : ""}`),
    "",
    earliestProposal ? `Would ${dateTimeLabel(earliestProposal)}${latestProposalEnd ? ` through about ${dateTimeLabel(latestProposalEnd)}` : ""} work for you? If not, please let us know the nearest time that does.` : "Please let us know your next available time for this work.",
    "",
    "Thank you,",
    "Mindful Motor Co.",
  ].join("\n") : "";

  async function copyText(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopyMessage(`${label} copied.`);
    } catch {
      setCopyMessage(`Could not copy ${label.toLowerCase()}.`);
    }
  }

  async function patchWork(workOrderId: string, body: Record<string, unknown>, success: string) {
    setWorkingId(workOrderId); setMessage("");
    try {
      const response = await fetch(`/api/mindful/inventory/work-orders/${workOrderId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Failed to update Work Order.");
      setMessage(success); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Failed to update Work Order."); }
    finally { setWorkingId(null); }
  }

  async function scheduleWork(workOrderId: string, value: string) {
    if (!value) return;
    setWorkingId(workOrderId); setMessage("");
    setScheduleMessages((current) => { const next = { ...current }; delete next[workOrderId]; return next; });
    try {
      const response = await fetch(`/api/mindful/inventory/work-orders/${workOrderId}/schedule`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scheduledStartAt: new Date(value).toISOString() }) });
      const payload = await response.json() as { error?: string; warning?: string };
      if (!response.ok) throw new Error(payload.error || "Failed to schedule Work Order.");
      setScheduleDrafts((current) => { const next = { ...current }; delete next[workOrderId]; return next; });
      const successText = payload.warning || "Schedule updated.";
      setScheduleMessages((current) => ({ ...current, [workOrderId]: { type: "success", text: successText } }));
      setMessage(successText); router.refresh();
    } catch (error) {
      const errorText = error instanceof Error ? error.message : "Failed to schedule Work Order.";
      setScheduleMessages((current) => ({ ...current, [workOrderId]: { type: "error", text: errorText } }));
      setMessage(errorText);
    } finally { setWorkingId(null); }
  }

  if (workOrders.length === 0) return <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">Active Work</div><h2 className="mt-1 text-2xl font-black">No Work Orders yet</h2><p className="mt-2 text-sm text-slate-500">Approve the Work Plan first. Activation creates Work Orders and a suggested execution schedule.</p><button onClick={() => router.push(`/mindful/inventory/${vehicleId}/car-plan`)} className="mt-5 rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white">Open Work Plan →</button></section>;

  return <div className="space-y-4">
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">Active Work · Vehicle Timeline</div><Link href="/mindful/inventory/schedule" className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-black text-slate-700">Cross-vehicle Schedule →</Link></div>
        {nextWork ? <div className="mt-4 rounded-2xl bg-slate-950 p-4 text-white"><div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">{nextWork.status === "in_progress" ? "Happening now" : nextWork.partnerConfirmationStatus === "awaiting_partner" ? "Awaiting partner confirmation" : "Next on this car"}</div><div className="mt-1 text-xl font-black">{nextWork.title}</div><div className="mt-1 text-sm font-semibold text-slate-300">{dateTimeLabel(nextWork.scheduledStartAt || nextWork.proposedStartAt)} · {nextWork.performerName || "Partner / technician not assigned"}</div><div className="mt-1 text-xs font-bold text-slate-400">{nextWork.locationName || "Location TBD"}{nextWork.resourceName ? ` · ${nextWork.resourceName}` : ""}</div></div> : <div className="mt-4 text-lg font-black">All authorized work is complete.</div>}</div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:min-w-[470px]"><div className="rounded-xl bg-slate-50 px-3 py-2.5"><div className="text-[9px] font-black uppercase text-slate-400">Progress</div><div className="text-base font-black">{completed}/{workOrders.length}</div></div><div className="rounded-xl bg-slate-50 px-3 py-2.5"><div className="text-[9px] font-black uppercase text-slate-400">Forecast Ready</div><div className="text-sm font-black">{forecastReady ? new Date(forecastReady).toLocaleDateString("en-US", { month:"short", day:"numeric" }) : "TBD"}</div></div><div className="rounded-xl bg-blue-50 px-3 py-2.5"><div className="text-[9px] font-black uppercase text-blue-500">Labor</div><div className="text-base font-black text-blue-800">{hours(totalLabor)}</div></div><div className="rounded-xl bg-slate-950 px-3 py-2.5 text-white"><div className="text-[9px] font-black uppercase text-slate-400">Budget</div><div className="text-base font-black">{money(activeBudget)}</div></div></div>
      </div>{message ? <div className="mt-3 text-sm font-bold text-slate-600">{message}</div> : null}
    </section>

    {openWork.length > 0 ? <section className={`rounded-2xl border px-4 py-3 ${scheduleReady ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div><div className={`text-[10px] font-black uppercase tracking-[0.1em] ${scheduleReady ? "text-emerald-700" : "text-amber-700"}`}>Schedule readiness</div><div className="mt-0.5 text-sm font-black text-slate-900">{scheduleReady ? "Execution schedule is fully assigned." : awaitingPartnerCount ? "Some work is waiting on outside-partner confirmation." : "This car still has scheduling gaps."}</div></div>
        <div className="flex flex-wrap gap-2">
          <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${unscheduledCount ? "bg-amber-100 text-amber-800" : "bg-white/70 text-slate-500"}`}>{unscheduledCount} unscheduled</span>
          {awaitingPartnerCount ? <span className="rounded-full bg-blue-100 px-2.5 py-1 text-[10px] font-black text-blue-800">{awaitingPartnerCount} awaiting partner</span> : null}
          <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${unassignedCount ? "bg-amber-100 text-amber-800" : "bg-white/70 text-slate-500"}`}>{unassignedCount} unassigned</span>
          <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${locationTbdCount ? "bg-amber-100 text-amber-800" : "bg-white/70 text-slate-500"}`}>{locationTbdCount} location TBD</span>
          {blockedCount ? <span className="rounded-full bg-red-100 px-2.5 py-1 text-[10px] font-black text-red-700">{blockedCount} blocked</span> : null}
        </div>
      </div>
    </section> : null}

    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-200 bg-slate-50 px-4 py-3"><h3 className="text-sm font-black">Execution calendar</h3><p className="mt-0.5 text-[11px] text-slate-500">Lot Logic suggests the partner, location/resource, and timing. Outside-partner times remain proposals until you confirm them.</p></div>
      <div className="divide-y divide-slate-200">{grouped.map(([key, items]) => <div key={key} className="grid lg:grid-cols-[150px_minmax(0,1fr)]"><div className="border-r border-slate-200 bg-slate-50 px-4 py-4"><div className="text-[10px] font-black uppercase text-slate-400">{key === "unscheduled" ? "Needs confirmation / slot" : "Scheduled"}</div><div className="mt-1 text-sm font-black">{key === "unscheduled" ? "Unscheduled" : dayLabel(key)}</div></div><div className="divide-y divide-slate-100">{items.map((work) => {
        const isDone = work.status === "complete" || work.status === "cancelled";
        const awaitingPartner = work.partnerConfirmationStatus === "awaiting_partner";
        const suggestion = !work.performerName ? suggestedPerformerForWork(work, performerOptions) : null;
        const filteredResources = resourceOptions.filter((r) => !work.locationId || r.locationId === work.locationId);
        const missing: string[] = [];
        if (!isDone && !work.scheduledStartAt && !awaitingPartner) missing.push("time");
        if (!isDone && !work.performerName) missing.push("partner / technician");
        if (!isDone && !work.locationId) missing.push("location");
        const savedScheduleValue = localInput(work.scheduledStartAt || work.proposedStartAt);
        const scheduleDraftValue = scheduleDrafts[work.id] ?? savedScheduleValue;
        const scheduleChanged = scheduleDraftValue !== savedScheduleValue;
        const scheduleMessage = scheduleMessages[work.id];
        return <article key={work.id} className={`grid gap-3 px-4 py-4 xl:grid-cols-[105px_minmax(0,1fr)_390px_auto] xl:items-center ${isDone ? "bg-slate-50/60" : awaitingPartner ? "bg-blue-50/30" : ""}`}>
          <div><div className="text-sm font-black">{awaitingPartner ? "Proposed" : timeLabel(work.scheduledStartAt)}</div>{awaitingPartner && work.proposedStartAt ? <><div className="mt-1 text-[11px] font-black text-blue-800">{dateTimeLabel(work.proposedStartAt)}</div>{work.proposedEndAt ? <div className="text-[10px] font-bold text-blue-600">to {timeLabel(work.proposedEndAt)}</div> : null}</> : work.scheduledEndAt ? <div className="text-[10px] font-bold text-slate-400">to {timeLabel(work.scheduledEndAt)}</div> : null}{work.scheduleSource === "suggested" ? <span className="mt-1 inline-flex rounded-full bg-violet-50 px-2 py-0.5 text-[9px] font-black uppercase text-violet-700">Suggested</span> : null}</div>
          <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${awaitingPartner ? "bg-blue-100 text-blue-800" : statusClass(work.status)}`}>{awaitingPartner ? "Awaiting Partner" : labelize(work.status)}</span><h4 className="text-sm font-black sm:text-base">{work.title}</h4>{missing.length ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-black uppercase text-amber-800">Needs {missing.join(" + ")}</span> : null}</div>{work.description ? <p className="mt-1 truncate text-xs text-slate-500">{work.description}</p> : null}<div className="mt-2 flex flex-wrap gap-3 text-[11px] font-bold text-slate-500"><span>{labelize(work.category)}</span><span>{money(work.approvedBudget)}</span><span>Labor {hours(work.estimatedLaborMinutes)}</span></div></div>
          <div className={`grid gap-2 rounded-xl border p-3 sm:grid-cols-2 ${scheduleMessage?.type === "error" ? "border-red-300 bg-red-50/50" : awaitingPartner ? "border-blue-200 bg-blue-50/60" : "border-slate-200 bg-slate-50"}`}>
            <div className="sm:col-span-2 flex items-center justify-between"><div className="text-[9px] font-black uppercase text-slate-400">Execution assignment</div>{suggestion ? <button disabled={isDone || workingId===work.id} onClick={() => void patchWork(work.id,{ performerKey:suggestion.key },`Assigned ${suggestion.displayName}.`)} className="rounded-full bg-blue-50 px-2 py-0.5 text-[9px] font-black text-blue-700">Suggest {suggestion.displayName}</button> : null}</div>
            <select disabled={isDone || workingId===work.id} value={performerKey(work)} onChange={(e)=>void patchWork(work.id,{ performerKey:e.target.value },"Partner / technician updated.")} className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs font-bold"><option value="unassigned">Needs assignment</option><optgroup label="Partners">{performerOptions.filter(o=>o.type==="partner").map(o=><option key={o.key} value={o.key}>{o.displayName}{o.secondaryLabel ? ` · ${o.secondaryLabel}`:""}</option>)}</optgroup><optgroup label="Mindful Team">{performerOptions.filter(o=>o.type==="internal").map(o=><option key={o.key} value={o.key}>{o.displayName}</option>)}</optgroup></select>
            <select disabled={isDone || workingId===work.id} value={work.locationId || ""} onChange={(e)=>void patchWork(work.id,{ locationId:e.target.value || null },"Location updated.")} className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs font-bold"><option value="">Location TBD</option>{locationOptions.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select>
            <select disabled={isDone || workingId===work.id || !work.locationId} value={work.resourceId || ""} onChange={(e)=>void patchWork(work.id,{ resourceId:e.target.value || null },"Resource updated.")} className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs font-bold"><option value="">No resource</option>{filteredResources.map(o=><option key={o.id} value={o.id}>{o.name} · {labelize(o.resourceType)}</option>)}</select>
            <input disabled={isDone || workingId===work.id} type="datetime-local" value={scheduleDraftValue} onChange={(e)=>{ setScheduleDrafts((current)=>({ ...current, [work.id]: e.target.value })); setScheduleMessages((current)=>{ const next={...current}; delete next[work.id]; return next; }); }} className={`rounded-lg border bg-white px-2 py-2 text-xs font-bold ${scheduleChanged ? "border-blue-400 ring-1 ring-blue-100" : "border-slate-200"}`} />
            <button disabled={isDone || workingId===work.id || !scheduleDraftValue || (!scheduleChanged && !awaitingPartner)} onClick={()=>void scheduleWork(work.id,scheduleDraftValue)} className="sm:col-span-2 rounded-lg bg-slate-950 px-3 py-2 text-xs font-black text-white disabled:bg-slate-200 disabled:text-slate-400">{workingId===work.id ? "Saving..." : awaitingPartner ? "Confirm Schedule" : scheduleChanged ? "Save Schedule" : "Schedule Saved"}</button>
            {scheduleMessage ? <div role="alert" className={`sm:col-span-2 rounded-lg border px-3 py-2 text-xs font-bold ${scheduleMessage.type === "error" ? "border-red-200 bg-red-100 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{scheduleMessage.type === "error" ? "Could not save: " : ""}{scheduleMessage.text}</div> : null}
          </div>
          <div className="flex flex-col gap-2">{awaitingPartner && work.assignedPartnerId ? <button type="button" onClick={() => { setEmailPartnerId(work.assignedPartnerId); setCopyMessage(""); }} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-black text-blue-800">Email Partner</button> : null}{!isDone && !awaitingPartner && work.status !== "in_progress" ? <button disabled={workingId===work.id} onClick={()=>void patchWork(work.id,{status:"in_progress"},"Work started.")} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-black">Start</button> : null}{work.status === "in_progress" ? <button disabled={workingId===work.id} onClick={()=>void patchWork(work.id,{status:"complete"},"Work completed.")} className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-black text-white">Complete</button> : null}</div>
        </article>;
      })}</div></div>)}</div>
    </section>

    {completed === workOrders.length ? <section className="flex justify-between rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3"><div><span className="text-xs font-black uppercase text-emerald-700">Execution Complete</span><span className="ml-3 text-sm font-bold text-slate-700">All authorized work is complete. Next: Final QC.</span></div><button onClick={()=>router.push(`/mindful/inventory/${vehicleId}/qc`)} className="rounded-lg bg-slate-950 px-4 py-2 text-xs font-black text-white">Open Final QC →</button></section> : null}

    {emailAnchor ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4" role="dialog" aria-modal="true" onMouseDown={(event) => { if (event.currentTarget === event.target) setEmailPartnerId(null); }}>
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4"><div><div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">Partner outreach</div><h2 className="mt-1 text-xl font-black text-slate-950">Email {emailAnchor.performerName}</h2><div className="mt-1 text-sm font-semibold text-slate-500">{emailWork.length} work item{emailWork.length === 1 ? "" : "s"} bundled into one request.</div></div><button type="button" onClick={() => setEmailPartnerId(null)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-black text-slate-500">Close</button></div>
        <div className="space-y-4 p-5">
          <div><div className="mb-1 text-[10px] font-black uppercase tracking-[0.08em] text-slate-400">Partner email</div><div className="flex gap-2"><input readOnly value={emailAnchor.partnerEmail || "No email saved for this partner"} onFocus={(event) => event.currentTarget.select()} className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-800"/><button type="button" disabled={!emailAnchor.partnerEmail} onClick={() => void copyText(emailAnchor.partnerEmail || "", "Email address")} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-black text-slate-700 disabled:opacity-40">Copy Email</button></div></div>
          <div><div className="mb-1 text-[10px] font-black uppercase tracking-[0.08em] text-slate-400">Subject</div><input readOnly value={emailSubject} onFocus={(event) => event.currentTarget.select()} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-800"/></div>
          <div><div className="mb-1 text-[10px] font-black uppercase tracking-[0.08em] text-slate-400">Message</div><textarea readOnly value={emailBody} onFocus={(event) => event.currentTarget.select()} className="min-h-[300px] w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm leading-6 text-slate-800"/></div>
          <div className="flex flex-wrap items-center justify-between gap-3"><div className="text-xs font-bold text-slate-500">{copyMessage}</div><div className="flex gap-2"><button type="button" onClick={() => void copyText(emailSubject, "Subject")} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-black text-slate-700">Copy Subject</button><button type="button" onClick={() => void copyText(emailBody, "Message")} className="rounded-lg bg-slate-950 px-4 py-2 text-xs font-black text-white">Copy Message</button></div></div>
        </div>
      </div>
    </div> : null}
  </div>;
}
