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

export function InventoryActiveWork({ vehicleId, workOrders, performerOptions, locationOptions, resourceOptions }: {
  vehicleId: string;
  workOrders: InventoryWorkOrderView[];
  performerOptions: InventoryPerformerOption[];
  locationOptions: InventorySchedulingLocationOption[];
  resourceOptions: InventorySchedulingResourceOption[];
}) {
  const router = useRouter();
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [scheduleDrafts, setScheduleDrafts] = useState<Record<string, string>>({});
  const completed = workOrders.filter((work) => work.status === "complete" || work.status === "cancelled").length;
  const activeBudget = workOrders.reduce((sum, work) => sum + work.approvedBudget, 0);
  const totalLabor = workOrders.reduce((sum, work) => sum + (work.estimatedLaborMinutes || 0), 0);
  const openWork = workOrders.filter((work) => !["complete", "cancelled"].includes(work.status));
  const unscheduledCount = openWork.filter((work) => !work.scheduledStartAt).length;
  const unassignedCount = openWork.filter((work) => !work.performerName).length;
  const locationTbdCount = openWork.filter((work) => !work.locationId).length;
  const blockedCount = openWork.filter((work) => work.status === "blocked").length;
  const scheduleReady = unscheduledCount === 0 && unassignedCount === 0 && locationTbdCount === 0 && blockedCount === 0;
  const forecastReady = [...workOrders].filter((w) => w.scheduledEndAt && w.status !== "cancelled").sort((a,b) => new Date(b.scheduledEndAt!).getTime()-new Date(a.scheduledEndAt!).getTime())[0]?.scheduledEndAt || null;
  const nextWork = [...workOrders].filter((w) => !["complete","cancelled"].includes(w.status)).sort((a,b) => {
    if (a.status === "in_progress" && b.status !== "in_progress") return -1;
    if (b.status === "in_progress" && a.status !== "in_progress") return 1;
    if (!a.scheduledStartAt) return 1; if (!b.scheduledStartAt) return -1;
    return new Date(a.scheduledStartAt).getTime()-new Date(b.scheduledStartAt).getTime();
  })[0] || null;

  const grouped = useMemo(() => {
    const map = new Map<string, InventoryWorkOrderView[]>();
    [...workOrders].sort((a,b) => (a.scheduledStartAt ? new Date(a.scheduledStartAt).getTime() : Number.MAX_SAFE_INTEGER) - (b.scheduledStartAt ? new Date(b.scheduledStartAt).getTime() : Number.MAX_SAFE_INTEGER)).forEach((work) => {
      const key = dayKey(work.scheduledStartAt); map.set(key, [...(map.get(key) || []), work]);
    });
    return Array.from(map.entries());
  }, [workOrders]);

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
    try {
      const response = await fetch(`/api/mindful/inventory/work-orders/${workOrderId}/schedule`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scheduledStartAt: new Date(value).toISOString() }) });
      const payload = await response.json() as { error?: string; warning?: string };
      if (!response.ok) throw new Error(payload.error || "Failed to schedule Work Order.");
      setScheduleDrafts((current) => {
        const next = { ...current };
        delete next[workOrderId];
        return next;
      });
      setMessage(payload.warning || "Schedule updated."); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Failed to schedule Work Order."); }
    finally { setWorkingId(null); }
  }

  if (workOrders.length === 0) return <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">Active Work</div><h2 className="mt-1 text-2xl font-black">No Work Orders yet</h2><p className="mt-2 text-sm text-slate-500">Approve the Work Plan first. Activation creates Work Orders and a suggested execution schedule.</p><button onClick={() => router.push(`/mindful/inventory/${vehicleId}/car-plan`)} className="mt-5 rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white">Open Work Plan →</button></section>;

  return <div className="space-y-4">
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">Active Work · Vehicle Timeline</div><Link href="/mindful/inventory/schedule" className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-black text-slate-700">Cross-vehicle Schedule →</Link></div>
        {nextWork ? <div className="mt-4 rounded-2xl bg-slate-950 p-4 text-white"><div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">{nextWork.status === "in_progress" ? "Happening now" : "Next on this car"}</div><div className="mt-1 text-xl font-black">{nextWork.title}</div><div className="mt-1 text-sm font-semibold text-slate-300">{dateTimeLabel(nextWork.scheduledStartAt)} · {nextWork.performerName || "Performer not assigned"}</div><div className="mt-1 text-xs font-bold text-slate-400">{nextWork.locationName || "Location TBD"}{nextWork.resourceName ? ` · ${nextWork.resourceName}` : ""}</div></div> : <div className="mt-4 text-lg font-black">All authorized work is complete.</div>}</div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:min-w-[470px]"><div className="rounded-xl bg-slate-50 px-3 py-2.5"><div className="text-[9px] font-black uppercase text-slate-400">Progress</div><div className="text-base font-black">{completed}/{workOrders.length}</div></div><div className="rounded-xl bg-slate-50 px-3 py-2.5"><div className="text-[9px] font-black uppercase text-slate-400">Forecast Ready</div><div className="text-sm font-black">{forecastReady ? new Date(forecastReady).toLocaleDateString("en-US", { month:"short", day:"numeric" }) : "TBD"}</div></div><div className="rounded-xl bg-blue-50 px-3 py-2.5"><div className="text-[9px] font-black uppercase text-blue-500">Labor</div><div className="text-base font-black text-blue-800">{hours(totalLabor)}</div></div><div className="rounded-xl bg-slate-950 px-3 py-2.5 text-white"><div className="text-[9px] font-black uppercase text-slate-400">Budget</div><div className="text-base font-black">{money(activeBudget)}</div></div></div>
      </div>{message ? <div className="mt-3 text-sm font-bold text-slate-600">{message}</div> : null}
    </section>

    {openWork.length > 0 ? <section className={`rounded-2xl border px-4 py-3 ${scheduleReady ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div><div className={`text-[10px] font-black uppercase tracking-[0.1em] ${scheduleReady ? "text-emerald-700" : "text-amber-700"}`}>Schedule readiness</div><div className="mt-0.5 text-sm font-black text-slate-900">{scheduleReady ? "Execution schedule is fully assigned." : "This car still has scheduling gaps."}</div></div>
        <div className="flex flex-wrap gap-2">
          <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${unscheduledCount ? "bg-amber-100 text-amber-800" : "bg-white/70 text-slate-500"}`}>{unscheduledCount} unscheduled</span>
          <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${unassignedCount ? "bg-amber-100 text-amber-800" : "bg-white/70 text-slate-500"}`}>{unassignedCount} unassigned</span>
          <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${locationTbdCount ? "bg-amber-100 text-amber-800" : "bg-white/70 text-slate-500"}`}>{locationTbdCount} location TBD</span>
          {blockedCount ? <span className="rounded-full bg-red-100 px-2.5 py-1 text-[10px] font-black text-red-700">{blockedCount} blocked</span> : null}
        </div>
      </div>
    </section> : null}

    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-200 bg-slate-50 px-4 py-3"><h3 className="text-sm font-black">Execution calendar</h3><p className="mt-0.5 text-[11px] text-slate-500">Set who, where, resource, and start time. Use Save Schedule to commit time changes. Start only means work has actually begun.</p></div>
      <div className="divide-y divide-slate-200">{grouped.map(([key, items]) => <div key={key} className="grid lg:grid-cols-[150px_minmax(0,1fr)]"><div className="border-r border-slate-200 bg-slate-50 px-4 py-4"><div className="text-[10px] font-black uppercase text-slate-400">{key === "unscheduled" ? "Needs slot" : "Scheduled"}</div><div className="mt-1 text-sm font-black">{key === "unscheduled" ? "Unscheduled" : dayLabel(key)}</div></div><div className="divide-y divide-slate-100">{items.map((work) => {
        const isDone = work.status === "complete" || work.status === "cancelled";
        const suggestion = !work.performerName ? suggestedPerformerForWork(work, performerOptions) : null;
        const filteredResources = resourceOptions.filter((r) => !work.locationId || r.locationId === work.locationId);
        const missing: string[] = [];
        if (!isDone && !work.scheduledStartAt) missing.push("time");
        if (!isDone && !work.performerName) missing.push("performer");
        if (!isDone && !work.locationId) missing.push("location");
        const savedScheduleValue = localInput(work.scheduledStartAt);
        const scheduleDraftValue = scheduleDrafts[work.id] ?? savedScheduleValue;
        const scheduleChanged = scheduleDraftValue !== savedScheduleValue;
        return <article key={work.id} className={`grid gap-3 px-4 py-4 xl:grid-cols-[105px_minmax(0,1fr)_390px_auto] xl:items-center ${isDone ? "bg-slate-50/60" : ""}`}>
          <div><div className="text-sm font-black">{timeLabel(work.scheduledStartAt)}</div>{work.scheduledEndAt ? <div className="text-[10px] font-bold text-slate-400">to {timeLabel(work.scheduledEndAt)}</div> : null}{work.scheduleSource === "suggested" ? <span className="mt-1 inline-flex rounded-full bg-violet-50 px-2 py-0.5 text-[9px] font-black uppercase text-violet-700">Suggested</span> : null}</div>
          <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${statusClass(work.status)}`}>{labelize(work.status)}</span><h4 className="text-sm font-black sm:text-base">{work.title}</h4>{missing.length ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-black uppercase text-amber-800">Needs {missing.join(" + ")}</span> : null}</div>{work.description ? <p className="mt-1 truncate text-xs text-slate-500">{work.description}</p> : null}<div className="mt-2 flex flex-wrap gap-3 text-[11px] font-bold text-slate-500"><span>{labelize(work.category)}</span><span>{money(work.approvedBudget)}</span><span>Labor {hours(work.estimatedLaborMinutes)}</span></div></div>
          <div className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2">
            <div className="sm:col-span-2 flex items-center justify-between"><div className="text-[9px] font-black uppercase text-slate-400">Execution assignment</div>{suggestion ? <button disabled={isDone || workingId===work.id} onClick={() => void patchWork(work.id,{ performerKey:suggestion.key },`Assigned ${suggestion.displayName}.`)} className="rounded-full bg-blue-50 px-2 py-0.5 text-[9px] font-black text-blue-700">Suggest {suggestion.displayName}</button> : null}</div>
            <select disabled={isDone || workingId===work.id} value={performerKey(work)} onChange={(e)=>void patchWork(work.id,{ performerKey:e.target.value },"Performer updated.")} className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs font-bold"><option value="unassigned">Needs assignment</option><optgroup label="Partners">{performerOptions.filter(o=>o.type==="partner").map(o=><option key={o.key} value={o.key}>{o.displayName}{o.secondaryLabel ? ` · ${o.secondaryLabel}`:""}</option>)}</optgroup><optgroup label="Mindful Team">{performerOptions.filter(o=>o.type==="internal").map(o=><option key={o.key} value={o.key}>{o.displayName}</option>)}</optgroup></select>
            <select disabled={isDone || workingId===work.id} value={work.locationId || ""} onChange={(e)=>void patchWork(work.id,{ locationId:e.target.value || null },"Location updated.")} className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs font-bold"><option value="">Location TBD</option>{locationOptions.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select>
            <select disabled={isDone || workingId===work.id || !work.locationId} value={work.resourceId || ""} onChange={(e)=>void patchWork(work.id,{ resourceId:e.target.value || null },"Resource updated.")} className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs font-bold"><option value="">No resource</option>{filteredResources.map(o=><option key={o.id} value={o.id}>{o.name} · {labelize(o.resourceType)}</option>)}</select>
            <input disabled={isDone || workingId===work.id} type="datetime-local" value={scheduleDraftValue} onChange={(e)=>setScheduleDrafts((current)=>({ ...current, [work.id]: e.target.value }))} className={`rounded-lg border bg-white px-2 py-2 text-xs font-bold ${scheduleChanged ? "border-blue-400 ring-1 ring-blue-100" : "border-slate-200"}`} />
            <button disabled={isDone || workingId===work.id || !scheduleDraftValue || !scheduleChanged} onClick={()=>void scheduleWork(work.id,scheduleDraftValue)} className="sm:col-span-2 rounded-lg bg-slate-950 px-3 py-2 text-xs font-black text-white disabled:bg-slate-200 disabled:text-slate-400">{workingId===work.id ? "Saving..." : scheduleChanged ? "Save Schedule" : "Schedule Saved"}</button>
          </div>
          <div className="flex gap-2">{!isDone && work.status !== "in_progress" ? <button disabled={workingId===work.id} onClick={()=>void patchWork(work.id,{status:"in_progress"},"Work started.")} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-black">Start</button> : null}{work.status === "in_progress" ? <button disabled={workingId===work.id} onClick={()=>void patchWork(work.id,{status:"complete"},"Work completed.")} className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-black text-white">Complete</button> : null}</div>
        </article>;
      })}</div></div>)}</div>
    </section>

    {completed === workOrders.length ? <section className="flex justify-between rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3"><div><span className="text-xs font-black uppercase text-emerald-700">Execution Complete</span><span className="ml-3 text-sm font-bold text-slate-700">All authorized work is complete. Next: Final QC.</span></div><button onClick={()=>router.push(`/mindful/inventory/${vehicleId}/qc`)} className="rounded-lg bg-slate-950 px-4 py-2 text-xs font-black text-white">Open Final QC →</button></section> : null}
  </div>;
}
