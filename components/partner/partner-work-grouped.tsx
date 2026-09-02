"use client";

import { useMemo, useState } from "react";

import type { PartnerPortalPermissions } from "@/lib/partner-portal/access";
import type { PartnerWorkItem } from "@/lib/partner-portal/work";
import { PartnerWorkListV4 } from "@/components/partner/partner-work-list-v4";

function workTime(work: PartnerWorkItem) {
  const value = work.scheduledStartAt || work.proposedStartAt;
  if (!value) return Number.MAX_SAFE_INTEGER;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : Number.MAX_SAFE_INTEGER;
}

function shortDate(value: string | null) {
  if (!value) return "Unscheduled";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unscheduled";
  return date.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function timeOnly(value: string | null) {
  if (!value) return "Time TBD";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Time TBD";
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function startOfWeek(date: Date) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  const day = result.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  result.setDate(result.getDate() + diff);
  return result;
}

function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function sameLocalDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function dayHeading(date: Date) {
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function weekHeading(start: Date) {
  const end = addDays(start, 6);
  const sameMonth = start.getMonth() === end.getMonth();
  if (sameMonth) return `${start.toLocaleDateString("en-US", { month: "long" })} ${start.getDate()}–${end.getDate()}, ${end.getFullYear()}`;
  return `${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
}

function statusTone(work: PartnerWorkItem) {
  if (work.status === "in_progress") return "bg-blue-100 text-blue-700";
  const estimate = work.partnerEstimateStatus || "awaiting_estimate";
  if (["awaiting_estimate", "revision_requested"].includes(estimate)) return "bg-violet-100 text-violet-700";
  if (estimate === "awaiting_review") return "bg-amber-100 text-amber-700";
  return "bg-slate-100 text-slate-600";
}

function statusText(work: PartnerWorkItem) {
  if (work.status === "in_progress") return "In progress";
  const estimate = work.partnerEstimateStatus || "awaiting_estimate";
  if (estimate === "awaiting_estimate") return "Estimate needed";
  if (estimate === "revision_requested") return "Revision needed";
  if (estimate === "awaiting_review") return "Awaiting approval";
  if (!work.proposedStartAt && !work.scheduledStartAt) return "Unscheduled";
  return work.partnerConfirmationStatus === "confirmed" ? "Confirmed" : "Needs confirmation";
}

type VehicleGroup = { vehicleId: string; vehicleLabel: string; vin: string | null; mileage: number | null; items: PartnerWorkItem[] };
type ViewMode = "vehicle" | "calendar";

export function PartnerWorkGrouped({ workItems, permissions }: { workItems: PartnerWorkItem[]; permissions: PartnerPortalPermissions }) {
  const openItems = useMemo(() => workItems.filter((work) => !["complete", "cancelled"].includes(work.status)).sort((a, b) => workTime(a) - workTime(b)), [workItems]);
  const completedItems = useMemo(() => workItems.filter((work) => work.status === "complete").sort((a, b) => workTime(b) - workTime(a)), [workItems]);
  const vehicleGroups = useMemo(() => {
    const groups = new Map<string, VehicleGroup>();
    for (const work of openItems) {
      const existing = groups.get(work.vehicleId);
      if (existing) existing.items.push(work);
      else groups.set(work.vehicleId, { vehicleId: work.vehicleId, vehicleLabel: work.vehicleLabel, vin: work.vin, mileage: work.mileage, items: [work] });
    }
    return Array.from(groups.values()).sort((a, b) => workTime(a.items[0]) - workTime(b.items[0]));
  }, [openItems]);

  const [viewMode, setViewMode] = useState<ViewMode>("vehicle");
  const [expandedVehicles, setExpandedVehicles] = useState<Record<string, boolean>>(() => { const first = vehicleGroups[0]?.vehicleId; return first ? { [first]: true } : {}; });
  const [completedOpen, setCompletedOpen] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0);
  const [expandedCalendarWorkId, setExpandedCalendarWorkId] = useState<string | null>(null);
  const weekStart = useMemo(() => addDays(startOfWeek(new Date()), weekOffset * 7), [weekOffset]);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)), [weekStart]);
  const scheduledItems = openItems.filter((work) => Boolean(work.scheduledStartAt || work.proposedStartAt));
  const unscheduledItems = openItems.filter((work) => !work.scheduledStartAt && !work.proposedStartAt);

  if (!workItems.length) return <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center"><div className="text-lg font-black">No assigned work right now</div><p className="mt-2 text-sm text-slate-500">New Work Orders assigned to you will appear here.</p></div>;

  return <div className="space-y-4">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="inline-flex self-start rounded-xl border border-slate-200 bg-white p-1 shadow-sm"><button type="button" onClick={() => setViewMode("vehicle")} className={`rounded-lg px-4 py-2 text-xs font-black ${viewMode === "vehicle" ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-50"}`}>By Vehicle</button><button type="button" onClick={() => setViewMode("calendar")} className={`rounded-lg px-4 py-2 text-xs font-black ${viewMode === "calendar" ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-50"}`}>Calendar</button></div>{viewMode === "calendar" ? <div className="flex flex-wrap items-center gap-2"><button type="button" onClick={() => setWeekOffset((value) => value - 1)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600">← Previous</button><button type="button" onClick={() => setWeekOffset(0)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600">Today</button><button type="button" onClick={() => setWeekOffset((value) => value + 1)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600">Next →</button></div> : null}</div>

    {viewMode === "vehicle" ? <>{vehicleGroups.map((group) => {
      const expanded = Boolean(expandedVehicles[group.vehicleId]);
      const next = group.items[0];
      const inProgress = group.items.filter((item) => item.status === "in_progress").length;
      const estimateNeeded = group.items.filter((item) => permissions.editEstimate && (!item.latestEstimate || ["awaiting_estimate", "revision_requested"].includes(item.partnerEstimateStatus || "awaiting_estimate"))).length;
      return <section key={group.vehicleId} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><button type="button" onClick={() => setExpandedVehicles((current) => ({ ...current, [group.vehicleId]: !expanded }))} className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left hover:bg-slate-50"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-black text-slate-950">{group.vehicleLabel}</h2><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black text-slate-600">{group.items.length} job{group.items.length === 1 ? "" : "s"}</span>{inProgress ? <span className="rounded-full bg-blue-100 px-2.5 py-1 text-[10px] font-black text-blue-700">{inProgress} in progress</span> : null}{estimateNeeded ? <span className="rounded-full bg-violet-100 px-2.5 py-1 text-[10px] font-black text-violet-700">{estimateNeeded} need estimate</span> : null}</div><div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs font-semibold text-slate-500"><span>Next: {next.title}</span><span>{shortDate(next.scheduledStartAt || next.proposedStartAt)}</span>{group.vin ? <span>VIN …{group.vin.slice(-8)}</span> : null}</div></div><div className="shrink-0 text-sm font-black text-slate-500">{expanded ? "Collapse ↑" : "Expand ↓"}</div></button>{expanded ? <div className="border-t border-slate-200 bg-slate-50/40 p-4 sm:p-5"><PartnerWorkListV4 workItems={group.items} permissions={permissions} /></div> : null}</section>;
    })}</> : <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-200 bg-slate-50 px-5 py-4"><div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Week</div><div className="mt-1 text-lg font-black">{weekHeading(weekStart)}</div></div><div className="divide-y divide-slate-200">{weekDays.map((day) => {
      const dayItems = scheduledItems.filter((work) => { const value = work.scheduledStartAt || work.proposedStartAt; if (!value) return false; const date = new Date(value); return !Number.isNaN(date.getTime()) && sameLocalDay(date, day); });
      const today = sameLocalDay(day, new Date());
      return <div key={day.toISOString()} className={today ? "bg-blue-50/30" : ""}><div className="flex items-center justify-between px-5 py-3"><div className="flex items-center gap-2"><div className="text-sm font-black text-slate-800">{dayHeading(day)}</div>{today ? <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[9px] font-black uppercase text-blue-700">Today</span> : null}</div><div className="text-xs font-bold text-slate-400">{dayItems.length ? `${dayItems.length} job${dayItems.length === 1 ? "" : "s"}` : "Open"}</div></div>{dayItems.length ? <div className="space-y-2 px-5 pb-4">{dayItems.map((work) => { const expanded = expandedCalendarWorkId === work.id; return <div key={work.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white"><button type="button" onClick={() => setExpandedCalendarWorkId(expanded ? null : work.id)} className="flex w-full items-center gap-4 px-4 py-3 text-left hover:bg-slate-50"><div className="w-20 shrink-0 text-sm font-black text-slate-900">{timeOnly(work.scheduledStartAt || work.proposedStartAt)}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><div className="truncate text-sm font-black">{work.vehicleLabel}</div><span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${statusTone(work)}`}>{statusText(work)}</span></div><div className="mt-0.5 truncate text-xs font-semibold text-slate-500">{work.title}{work.locationName ? ` · ${work.locationName}` : ""}</div></div><div className="text-xs font-black text-slate-400">{expanded ? "Hide ↑" : "Open ↓"}</div></button>{expanded ? <div className="border-t border-slate-200 bg-slate-50/50 p-4"><PartnerWorkListV4 workItems={[work]} permissions={permissions} /></div> : null}</div>; })}</div> : null}</div>;
    })}</div></section>}

    {viewMode === "calendar" && unscheduledItems.length ? <section className="overflow-hidden rounded-2xl border border-amber-200 bg-amber-50 shadow-sm"><div className="px-5 py-4"><div className="text-sm font-black text-amber-900">Unscheduled</div><div className="mt-1 text-xs text-amber-700">{unscheduledItems.length} job{unscheduledItems.length === 1 ? "" : "s"} still need a time.</div></div><div className="space-y-2 border-t border-amber-200 p-4">{unscheduledItems.map((work) => { const expanded = expandedCalendarWorkId === work.id; return <div key={work.id} className="overflow-hidden rounded-xl border border-amber-200 bg-white"><button type="button" onClick={() => setExpandedCalendarWorkId(expanded ? null : work.id)} className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left hover:bg-amber-50/40"><div className="min-w-0"><div className="text-sm font-black">{work.vehicleLabel}</div><div className="mt-0.5 text-xs font-semibold text-slate-500">{work.title}</div></div><div className="text-xs font-black text-slate-400">{expanded ? "Hide ↑" : "Open ↓"}</div></button>{expanded ? <div className="border-t border-amber-200 bg-slate-50/50 p-4"><PartnerWorkListV4 workItems={[work]} permissions={permissions} /></div> : null}</div>; })}</div></section> : null}

    {!openItems.length ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm font-bold text-emerald-800">All assigned work is complete.</div> : null}

    {completedItems.length ? <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><button type="button" onClick={() => setCompletedOpen((value) => !value)} className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left hover:bg-slate-50"><div><div className="text-sm font-black text-slate-800">Completed</div><div className="mt-1 text-xs text-slate-500">{completedItems.length} completed job{completedItems.length === 1 ? "" : "s"}</div></div><div className="text-sm font-black text-slate-500">{completedOpen ? "Hide ↑" : "Show ↓"}</div></button>{completedOpen ? <div className="border-t border-slate-200 bg-slate-50/50 p-4 sm:p-5"><div className="space-y-2">{completedItems.map((work) => <div key={work.id} className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><div className="text-sm font-black text-slate-900">{work.title}</div><span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-black uppercase text-emerald-700">Complete</span></div><div className="mt-1 text-xs font-semibold text-slate-500">{work.vehicleLabel} · {shortDate(work.scheduledStartAt || work.proposedStartAt)}</div></div>{work.vin ? <div className="text-xs font-bold text-slate-400">VIN …{work.vin.slice(-8)}</div> : null}</div>)}</div></div> : null}</section> : null}
  </div>;
}
