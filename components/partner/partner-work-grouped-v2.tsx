"use client";

import { useMemo, useState } from "react";

import type { PartnerPortalPermissions } from "@/lib/partner-portal/access";
import type { PartnerWorkItem } from "@/lib/partner-portal/work";
import { PartnerWorkListV4 } from "@/components/partner/partner-work-list-v4";

function workTime(work: PartnerWorkItem) {
  const value = work.scheduledStartAt || work.proposedStartAt;
  return value ? new Date(value).getTime() : Number.MAX_SAFE_INTEGER;
}
function shortDate(value: string | null) {
  if (!value) return "Unscheduled";
  return new Date(value).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
function timeOnly(value: string | null) {
  if (!value) return "TBD";
  return new Date(value).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}
function startOfWeek(date: Date) {
  const d = new Date(date); d.setHours(0, 0, 0, 0); const day = d.getDay(); d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day)); return d;
}
function addDays(date: Date, days: number) { const d = new Date(date); d.setDate(d.getDate() + days); return d; }
function sameDay(a: Date, b: Date) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
function state(work: PartnerWorkItem) {
  if (work.status === "in_progress") return { label: "In progress", tone: "bg-blue-100 text-blue-700" };
  const estimate = work.partnerEstimateStatus || "awaiting_estimate";
  if (["awaiting_estimate", "revision_requested"].includes(estimate)) return { label: "Estimate needed", tone: "bg-violet-100 text-violet-700" };
  if (estimate === "awaiting_review") return { label: "Awaiting approval", tone: "bg-amber-100 text-amber-700" };
  if (work.partnerConfirmationStatus !== "confirmed") return { label: "Schedule confirmation", tone: "bg-amber-100 text-amber-700" };
  if (work.partnerLocationConfirmationStatus !== "confirmed") return { label: "Location confirmation", tone: "bg-amber-100 text-amber-700" };
  if (work.partnerPartsConfirmationStatus !== "confirmed") return { label: "Parts review", tone: "bg-amber-100 text-amber-700" };
  return { label: "Ready", tone: "bg-emerald-100 text-emerald-700" };
}

type ViewMode = "vehicle" | "calendar";

export function PartnerWorkGroupedV2({ workItems, permissions }: { workItems: PartnerWorkItem[]; permissions: PartnerPortalPermissions }) {
  const openItems = useMemo(() => workItems.filter((w) => !["complete", "cancelled"].includes(w.status)).sort((a, b) => workTime(a) - workTime(b)), [workItems]);
  const completedItems = useMemo(() => workItems.filter((w) => w.status === "complete").sort((a, b) => workTime(b) - workTime(a)), [workItems]);
  const groups = useMemo(() => {
    const map = new Map<string, { vehicleId: string; vehicleLabel: string; vin: string | null; items: PartnerWorkItem[] }>();
    for (const work of openItems) {
      const current = map.get(work.vehicleId);
      if (current) current.items.push(work);
      else map.set(work.vehicleId, { vehicleId: work.vehicleId, vehicleLabel: work.vehicleLabel, vin: work.vin, items: [work] });
    }
    return Array.from(map.values());
  }, [openItems]);

  const [view, setView] = useState<ViewMode>("vehicle");
  const [openVehicle, setOpenVehicle] = useState<string | null>(groups[0]?.vehicleId || null);
  const [openWork, setOpenWork] = useState<string | null>(() => openItems.find((w) => w.status === "in_progress")?.id || openItems[0]?.id || null);
  const [completedOpen, setCompletedOpen] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0);
  const weekStart = useMemo(() => addDays(startOfWeek(new Date()), weekOffset * 7), [weekOffset]);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  if (!workItems.length) return <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center"><div className="text-lg font-black">No assigned work right now</div><p className="mt-2 text-sm text-slate-500">New Work Orders assigned to you will appear here.</p></div>;

  function jobRow(work: PartnerWorkItem, showVehicle = false) {
    const expanded = openWork === work.id;
    const current = state(work);
    const pendingParts = work.parts.filter((p) => !["received", "installed", "cancelled"].includes(p.status)).length;
    return <div key={work.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <button type="button" onClick={() => setOpenWork(expanded ? null : work.id)} className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left hover:bg-slate-50">
        <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="truncate text-sm font-black">{showVehicle ? `${work.vehicleLabel} · ${work.title}` : work.title}</span><span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${current.tone}`}>{current.label}</span>{pendingParts ? <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[9px] font-black text-amber-800">{pendingParts} part{pendingParts === 1 ? "" : "s"} pending</span> : null}</div><div className="mt-1 text-xs font-semibold text-slate-500">{shortDate(work.scheduledStartAt || work.proposedStartAt)}{work.locationName ? ` · ${work.locationName}` : ""}</div></div><div className="shrink-0 text-xs font-black text-slate-400">{expanded ? "Close ↑" : "Open ↓"}</div>
      </button>
      {expanded ? <div className="border-t border-slate-200 bg-slate-50/40 p-3"><PartnerWorkListV4 workItems={[work]} permissions={permissions} /></div> : null}
    </div>;
  }

  return <div className="space-y-4">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="inline-flex self-start rounded-xl border border-slate-200 bg-white p-1 shadow-sm"><button onClick={() => setView("vehicle")} className={`rounded-lg px-4 py-2 text-xs font-black ${view === "vehicle" ? "bg-slate-950 text-white" : "text-slate-600"}`}>By Vehicle</button><button onClick={() => setView("calendar")} className={`rounded-lg px-4 py-2 text-xs font-black ${view === "calendar" ? "bg-slate-950 text-white" : "text-slate-600"}`}>Calendar</button></div>{view === "calendar" ? <div className="flex gap-2"><button onClick={() => setWeekOffset((v) => v - 1)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black">← Previous</button><button onClick={() => setWeekOffset(0)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black">Today</button><button onClick={() => setWeekOffset((v) => v + 1)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black">Next →</button></div> : null}</div>

    {view === "vehicle" ? <div className="space-y-3">{groups.map((group) => {
      const expanded = openVehicle === group.vehicleId;
      const inProgress = group.items.filter((w) => w.status === "in_progress").length;
      const attention = group.items.filter((w) => state(w).label !== "Ready" && w.status !== "in_progress").length;
      return <section key={group.vehicleId} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><button onClick={() => setOpenVehicle(expanded ? null : group.vehicleId)} className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left hover:bg-slate-50"><div><div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-black">{group.vehicleLabel}</h2><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black text-slate-600">{group.items.length} job{group.items.length === 1 ? "" : "s"}</span>{inProgress ? <span className="rounded-full bg-blue-100 px-2.5 py-1 text-[10px] font-black text-blue-700">{inProgress} in progress</span> : null}{attention ? <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-black text-amber-800">{attention} need attention</span> : null}</div><div className="mt-1 text-xs font-semibold text-slate-500">Next: {group.items[0]?.title} · {shortDate(group.items[0]?.scheduledStartAt || group.items[0]?.proposedStartAt || null)}{group.vin ? ` · VIN …${group.vin.slice(-8)}` : ""}</div></div><div className="text-xs font-black text-slate-400">{expanded ? "Collapse ↑" : "Expand ↓"}</div></button>{expanded ? <div className="space-y-2 border-t border-slate-200 bg-slate-50/40 p-4">{group.items.map((work) => jobRow(work))}</div> : null}</section>;
    })}</div> : <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-200 bg-slate-50 px-5 py-4"><div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Week</div><div className="mt-1 text-lg font-black">{weekStart.toLocaleDateString("en-US", { month: "long", day: "numeric" })} – {addDays(weekStart, 6).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</div></div><div className="divide-y divide-slate-200">{days.map((day) => { const items = openItems.filter((w) => { const value = w.scheduledStartAt || w.proposedStartAt; return value && sameDay(new Date(value), day); }); return <div key={day.toISOString()} className={sameDay(day, new Date()) ? "bg-blue-50/30" : ""}><div className="flex items-center justify-between px-5 py-3"><div className="text-sm font-black">{day.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</div><div className="text-xs font-bold text-slate-400">{items.length ? `${items.length} job${items.length === 1 ? "" : "s"}` : "Open"}</div></div>{items.length ? <div className="space-y-2 px-5 pb-4">{items.map((work) => jobRow(work, true))}</div> : null}</div>; })}</div></section>}

    {completedItems.length ? <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><button onClick={() => setCompletedOpen((v) => !v)} className="flex w-full items-center justify-between px-5 py-4 text-left"><div><div className="text-sm font-black">Completed</div><div className="mt-1 text-xs text-slate-500">{completedItems.length} completed job{completedItems.length === 1 ? "" : "s"}</div></div><div className="text-xs font-black text-slate-400">{completedOpen ? "Hide ↑" : "Show ↓"}</div></button>{completedOpen ? <div className="divide-y divide-slate-100 border-t border-slate-200">{completedItems.map((work) => <div key={work.id} className="flex items-center justify-between px-5 py-3"><div><div className="text-sm font-black">{work.title}</div><div className="mt-0.5 text-xs text-slate-500">{work.vehicleLabel} · {shortDate(work.scheduledStartAt || work.proposedStartAt)}</div></div><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[9px] font-black text-emerald-700">Complete</span></div>)}</div> : null}</section> : null}
  </div>;
}
