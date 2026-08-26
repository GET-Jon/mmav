"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import type {
  InventorySchedulingLocationOption,
  InventorySchedulingResourceOption,
} from "@/lib/mindful-inventory/active-work";
import type { InventoryPerformerOption } from "@/lib/mindful-inventory/performers";
import type { InventoryScheduleWork } from "@/lib/mindful-inventory/schedule";

function labelize(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function hours(minutes: number | null) {
  if (minutes === null) return "—";
  return `${Math.round((minutes / 60) * 10) / 10} hr`;
}
function startOfWeek(offset: number) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const day = now.getDay();
  now.setDate(now.getDate() + (day === 0 ? -6 : 1 - day) + offset * 7);
  return now;
}
function dayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function localInputDefault() {
  const date = new Date();
  date.setMinutes(Math.ceil(date.getMinutes() / 30) * 30, 0, 0);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}
function localInput(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}
function overlaps(a: InventoryScheduleWork, b: InventoryScheduleWork) {
  if (!a.scheduledStartAt || !a.scheduledEndAt || !b.scheduledStartAt || !b.scheduledEndAt) return false;
  return new Date(a.scheduledStartAt).getTime() < new Date(b.scheduledEndAt).getTime()
    && new Date(a.scheduledEndAt).getTime() > new Date(b.scheduledStartAt).getTime();
}
function performerKey(item: InventoryScheduleWork) {
  if (item.assignedPartnerId) return `partner:${item.assignedPartnerId}`;
  if (item.assignedUserId) return `user:${item.assignedUserId}`;
  return "unassigned";
}

type Conflict = { itemId: string; otherId: string; kind: "performer" | "resource"; label: string };
type ViewMode = "all" | "conflicts" | "gaps";
type LayoutMode = "calendar" | "technicians" | "resources";
type Props = {
  work: InventoryScheduleWork[];
  performerOptions: InventoryPerformerOption[];
  locationOptions: InventorySchedulingLocationOption[];
  resourceOptions: InventorySchedulingResourceOption[];
};

export function InventoryScheduleBoard({ work, performerOptions, locationOptions, resourceOptions }: Props) {
  const router = useRouter();
  const [weekOffset, setWeekOffset] = useState(0);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [starts, setStarts] = useState<Record<string, string>>({});
  const [viewMode, setViewMode] = useState<ViewMode>("all");
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("calendar");
  const [selectedItem, setSelectedItem] = useState<InventoryScheduleWork | null>(null);

  const weekStart = useMemo(() => startOfWeek(weekOffset), [weekOffset]);
  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + index);
    return date;
  }), [weekStart]);
  const weekEnd = useMemo(() => {
    const end = new Date(days[6]);
    end.setHours(23, 59, 59, 999);
    return end;
  }, [days]);
  const today = dayKey(new Date());

  const active = work.filter((item) => item.status !== "complete" && item.status !== "cancelled");
  const unscheduled = active.filter((item) => !item.scheduledStartAt).sort((a, b) => Number(a.vehiclePriority) - Number(b.vehiclePriority));
  const unassigned = active.filter((item) => !item.performerName);
  const locationTbd = active.filter((item) => !item.locationId);
  const weekWork = work.filter((item) => {
    if (!item.scheduledStartAt || item.status === "cancelled") return false;
    const when = new Date(item.scheduledStartAt).getTime();
    return when >= weekStart.getTime() && when <= weekEnd.getTime();
  });

  const conflicts = useMemo(() => {
    const found: Conflict[] = [];
    const scheduledActive = work.filter((item) => item.status !== "complete" && item.status !== "cancelled" && item.scheduledStartAt && item.scheduledEndAt);
    for (let i = 0; i < scheduledActive.length; i += 1) {
      for (let j = i + 1; j < scheduledActive.length; j += 1) {
        const a = scheduledActive[i];
        const b = scheduledActive[j];
        if (!overlaps(a, b)) continue;
        if (a.assignedPartnerId && a.assignedPartnerId === b.assignedPartnerId) {
          const label = a.performerName || b.performerName || "Partner / technician";
          found.push({ itemId: a.id, otherId: b.id, kind: "performer", label }, { itemId: b.id, otherId: a.id, kind: "performer", label });
        }
        if (a.assignedUserId && a.assignedUserId === b.assignedUserId) {
          const label = a.performerName || b.performerName || "Team member";
          found.push({ itemId: a.id, otherId: b.id, kind: "performer", label }, { itemId: b.id, otherId: a.id, kind: "performer", label });
        }
        if (a.resourceId && a.resourceId === b.resourceId) {
          const label = a.resourceName || b.resourceName || "Resource";
          found.push({ itemId: a.id, otherId: b.id, kind: "resource", label }, { itemId: b.id, otherId: a.id, kind: "resource", label });
        }
      }
    }
    return found;
  }, [work]);
  const conflictsByItem = useMemo(() => {
    const map = new Map<string, Conflict[]>();
    conflicts.forEach((conflict) => map.set(conflict.itemId, [...(map.get(conflict.itemId) || []), conflict]));
    return map;
  }, [conflicts]);
  const conflictItemCount = new Set(conflicts.map((conflict) => conflict.itemId)).size;
  const gapItemIds = new Set([...unscheduled, ...unassigned, ...locationTbd].map((item) => item.id));

  function visible(item: InventoryScheduleWork) {
    if (item.status === "complete") return viewMode === "all";
    if (viewMode === "conflicts") return conflictsByItem.has(item.id);
    if (viewMode === "gaps") return gapItemIds.has(item.id);
    return true;
  }
  function openItem(item: InventoryScheduleWork) {
    setMessage("");
    setStarts((current) => ({ ...current, [item.id]: current[item.id] || localInput(item.scheduledStartAt) || localInputDefault() }));
    setSelectedItem(item);
  }
  function scrollToUnscheduled() {
    document.getElementById("unscheduled-work")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function schedule(item: InventoryScheduleWork) {
    const localStart = starts[item.id] || localInput(item.scheduledStartAt) || localInputDefault();
    setWorkingId(item.id);
    setMessage("");
    try {
      const response = await fetch(`/api/mindful/inventory/work-orders/${item.id}/schedule`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduledStartAt: new Date(localStart).toISOString() }),
      });
      const payload = (await response.json()) as {
        error?: string;
        scheduled_start_at?: string;
        scheduled_end_at?: string;
        status?: string;
        schedule_source?: string;
      };
      if (!response.ok) throw new Error(payload.error || "Failed to schedule work.");
      setSelectedItem((current) => current && current.id === item.id ? {
        ...current,
        scheduledStartAt: payload.scheduled_start_at || new Date(localStart).toISOString(),
        scheduledEndAt: payload.scheduled_end_at || current.scheduledEndAt,
        status: payload.status || current.status,
        scheduleSource: payload.schedule_source || current.scheduleSource,
      } : current);
      setMessage(`${item.title} scheduled.`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to schedule work.");
    } finally {
      setWorkingId(null);
    }
  }

  async function patchItem(item: InventoryScheduleWork, body: Record<string, unknown>, success: string) {
    setWorkingId(item.id);
    setMessage("");
    try {
      const response = await fetch(`/api/mindful/inventory/work-orders/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as {
        error?: string; status?: string; assignedPartnerId?: string | null; assignedUserId?: string | null; locationId?: string | null; resourceId?: string | null;
      };
      if (!response.ok) throw new Error(payload.error || "Failed to update Work Order.");
      setSelectedItem((current) => {
        if (!current || current.id !== item.id) return current;
        const next = { ...current };
        if (payload.status) next.status = payload.status;
        if (Object.prototype.hasOwnProperty.call(payload, "assignedPartnerId")) next.assignedPartnerId = payload.assignedPartnerId ?? null;
        if (Object.prototype.hasOwnProperty.call(payload, "assignedUserId")) next.assignedUserId = payload.assignedUserId ?? null;
        if (Object.prototype.hasOwnProperty.call(payload, "locationId")) next.locationId = payload.locationId ?? null;
        if (Object.prototype.hasOwnProperty.call(payload, "resourceId")) next.resourceId = payload.resourceId ?? null;
        const performer = next.assignedPartnerId
          ? performerOptions.find((option) => option.type === "partner" && option.id === next.assignedPartnerId)
          : next.assignedUserId ? performerOptions.find((option) => option.type === "internal" && option.id === next.assignedUserId) : null;
        next.performerName = performer?.displayName || null;
        next.locationName = next.locationId ? locationOptions.find((option) => option.id === next.locationId)?.name || null : null;
        next.resourceName = next.resourceId ? resourceOptions.find((option) => option.id === next.resourceId)?.name || null : null;
        return next;
      });
      setMessage(success);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to update Work Order.");
    } finally {
      setWorkingId(null);
    }
  }

  function previewConflicts(item: InventoryScheduleWork) {
    const localStart = starts[item.id] || localInput(item.scheduledStartAt);
    if (!localStart) return [] as Conflict[];
    const start = new Date(localStart);
    if (!Number.isFinite(start.getTime())) return [] as Conflict[];
    const durationMinutes = item.elapsedMinutes ?? item.legacyDurationMinutes ?? 60;
    const end = new Date(start.getTime() + Math.max(1, durationMinutes) * 60_000);
    const found: Conflict[] = [];

    for (const other of work) {
      if (other.id === item.id || other.status === "complete" || other.status === "cancelled" || !other.scheduledStartAt || !other.scheduledEndAt) continue;
      const otherStart = new Date(other.scheduledStartAt);
      const otherEnd = new Date(other.scheduledEndAt);
      if (start.getTime() >= otherEnd.getTime() || end.getTime() <= otherStart.getTime()) continue;
      if (item.assignedPartnerId && item.assignedPartnerId === other.assignedPartnerId) {
        found.push({ itemId: item.id, otherId: other.id, kind: "performer", label: item.performerName || other.performerName || "Partner / technician" });
      }
      if (item.assignedUserId && item.assignedUserId === other.assignedUserId) {
        found.push({ itemId: item.id, otherId: other.id, kind: "performer", label: item.performerName || other.performerName || "Team member" });
      }
      if (item.resourceId && item.resourceId === other.resourceId) {
        found.push({ itemId: item.id, otherId: other.id, kind: "resource", label: item.resourceName || other.resourceName || "Resource" });
      }
    }
    return found;
  }

  function WorkCard({ item, compact = false }: { item: InventoryScheduleWork; compact?: boolean }) {
    const elapsed = item.elapsedMinutes ?? item.legacyDurationMinutes;
    const itemConflicts = conflictsByItem.get(item.id) || [];
    const missing = !item.performerName || !item.locationId;
    const complete = item.status === "complete";
    return <button type="button" onClick={() => openItem(item)} className={`block w-full rounded-xl border bg-white text-left shadow-sm transition ${compact ? "p-2.5" : "p-3"} ${complete ? "border-slate-200 opacity-45 hover:opacity-70" : itemConflicts.length ? "border-red-300 ring-1 ring-red-100 hover:border-red-500" : missing ? "border-amber-300 hover:border-amber-500" : "border-slate-200 hover:border-slate-400"}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">{item.scheduledStartAt ? new Date(item.scheduledStartAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "Unscheduled"}</div>
        {complete ? <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-black uppercase text-slate-500">Complete</span> : itemConflicts.length ? <span className="rounded-full bg-red-100 px-2 py-0.5 text-[9px] font-black uppercase text-red-700">Conflict</span> : missing ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-black uppercase text-amber-800">Missing info</span> : null}
      </div>
      <div className="mt-1 text-xs font-black text-slate-950">{item.inventoryNumber} · {item.vehicleLabel}</div>
      <div className="mt-1 text-sm font-black text-slate-800">{item.title}</div>
      {!compact ? <><div className="mt-2 text-[10px] font-bold text-slate-500">{item.performerName || "Partner / technician TBD"}{item.locationName ? ` · ${item.locationName}` : " · Location TBD"}{item.resourceName ? ` · ${item.resourceName}` : ""}</div><div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-black"><span className="rounded-full bg-blue-50 px-2 py-1 text-blue-700">Labor {hours(item.laborMinutes)}</span><span className="rounded-full bg-violet-50 px-2 py-1 text-violet-700">Turn {hours(elapsed)}</span></div></> : null}
    </button>;
  }

  const selectedConflicts = selectedItem ? previewConflicts(selectedItem) : [];
  const selectedElapsed = selectedItem ? selectedItem.elapsedMinutes ?? selectedItem.legacyDurationMinutes : null;
  const selectedResources = selectedItem?.locationId ? resourceOptions.filter((resource) => resource.locationId === selectedItem.locationId) : [];

  return <div className="space-y-5">
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">Operations Schedule</div>
      <h1 className="mt-1 text-2xl font-black text-slate-950">Resource planning across every car</h1>
      <p className="mt-2 max-w-3xl text-sm font-medium leading-6 text-slate-500">Plan the week by calendar, partner / technician, or constrained resource. Completed work stays faintly visible for context.</p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setViewMode("all")} className={`rounded-full px-3 py-1.5 text-xs font-black ${viewMode === "all" ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-600"}`}>All Work ({active.length})</button>
        <button type="button" onClick={() => setViewMode("conflicts")} className={`rounded-full px-3 py-1.5 text-xs font-black ${conflictItemCount > 0 ? viewMode === "conflicts" ? "bg-red-700 text-white" : "bg-red-100 text-red-700" : viewMode === "conflicts" ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-600"}`}>Conflicts ({conflictItemCount})</button>
        <button type="button" onClick={() => setViewMode("gaps")} className={`rounded-full px-3 py-1.5 text-xs font-black ${gapItemIds.size > 0 ? viewMode === "gaps" ? "bg-amber-600 text-white" : "bg-amber-100 text-amber-800" : viewMode === "gaps" ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-600"}`}>Missing Info ({gapItemIds.size})</button>
        <button type="button" onClick={scrollToUnscheduled} className={`rounded-full px-3 py-1.5 text-xs font-black ${unscheduled.length > 0 ? "bg-amber-100 text-amber-800 hover:bg-amber-200" : "bg-slate-100 text-slate-500"}`}>Unscheduled ({unscheduled.length})</button>
      </div>
    </section>

    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setWeekOffset((value) => value - 1)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-black text-slate-600">←</button>
            <button type="button" onClick={() => setWeekOffset(0)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-black text-slate-600">This week</button>
            <button type="button" onClick={() => setWeekOffset((value) => value + 1)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-black text-slate-600">→</button>
          </div>
          <div className="ml-2 flex rounded-xl bg-slate-100 p-1">
            {(["calendar", "technicians", "resources"] as LayoutMode[]).map((mode) => <button type="button" key={mode} onClick={() => setLayoutMode(mode)} className={`rounded-lg px-3 py-1.5 text-xs font-black ${layoutMode === mode ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"}`}>{mode === "calendar" ? "Calendar" : mode === "technicians" ? "Partners / Technicians" : "Resources / Bays"}</button>)}
          </div>
        </div>
        <div className="text-sm font-black text-slate-700">{days[0].toLocaleDateString("en-US", { month: "short", day: "numeric" })} – {days[6].toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</div>
      </div>

      {layoutMode === "calendar" ? <div className="grid min-w-[1120px] grid-cols-7 gap-2 overflow-x-auto">
        {days.map((day) => {
          const isToday = dayKey(day) === today;
          const items = weekWork.filter((item) => item.scheduledStartAt && dayKey(new Date(item.scheduledStartAt)) === dayKey(day) && visible(item));
          return <div key={dayKey(day)} className={`min-h-[320px] rounded-xl border p-2 ${isToday ? "border-blue-300 bg-blue-50/50 ring-1 ring-blue-100" : "border-slate-200 bg-slate-50"}`}>
            <div className={`border-b px-1 pb-2 ${isToday ? "border-blue-200" : "border-slate-200"}`}><div className={`text-[10px] font-black uppercase ${isToday ? "text-blue-600" : "text-slate-400"}`}>{day.toLocaleDateString("en-US", { weekday: "short" })}{isToday ? " · Today" : ""}</div><div className="text-base font-black text-slate-900">{day.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div></div>
            <div className="mt-2 space-y-2">{items.map((item) => <WorkCard key={item.id} item={item} />)}{items.length === 0 ? <div className="px-1 py-4 text-xs font-bold text-slate-300">No matching work</div> : null}</div>
          </div>;
        })}
      </div> : null}

      {layoutMode === "technicians" ? <div className="space-y-3">
        {[...performerOptions.map((option) => ({ key: option.key, label: option.displayName, note: option.secondaryLabel })), { key: "unassigned", label: "Unassigned", note: "Needs partner / technician" }].map((lane) => {
          const items = weekWork.filter((item) => performerKey(item) === lane.key && visible(item)).sort((a, b) => new Date(a.scheduledStartAt || 0).getTime() - new Date(b.scheduledStartAt || 0).getTime());
          if (!items.length) return null;
          const labor = items.reduce((sum, item) => sum + (item.status === "complete" ? 0 : item.laborMinutes || 0), 0);
          return <div key={lane.key} className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 lg:grid-cols-[220px_minmax(0,1fr)]">
            <div><div className="text-sm font-black text-slate-950">{lane.label}</div>{lane.note ? <div className="mt-0.5 text-xs font-semibold text-slate-500">{lane.note}</div> : null}<div className="mt-2 text-xs font-black text-slate-500">{items.length} item{items.length === 1 ? "" : "s"} · {hours(labor)} active labor</div></div>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">{items.map((item) => <WorkCard key={item.id} item={item} compact />)}</div>
          </div>;
        })}
      </div> : null}

      {layoutMode === "resources" ? <div className="space-y-3">
        {[...resourceOptions.map((resource) => ({ key: resource.id, label: resource.name, note: locationOptions.find((location) => location.id === resource.locationId)?.name || null })), { key: "none", label: "No resource assigned", note: "Work that does not currently reserve a bay or resource" }].map((lane) => {
          const items = weekWork.filter((item) => (item.resourceId || "none") === lane.key && visible(item)).sort((a, b) => new Date(a.scheduledStartAt || 0).getTime() - new Date(b.scheduledStartAt || 0).getTime());
          if (!items.length) return null;
          return <div key={lane.key} className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 lg:grid-cols-[220px_minmax(0,1fr)]">
            <div><div className="text-sm font-black text-slate-950">{lane.label}</div>{lane.note ? <div className="mt-0.5 text-xs font-semibold text-slate-500">{lane.note}</div> : null}<div className="mt-2 text-xs font-black text-slate-500">{items.length} scheduled item{items.length === 1 ? "" : "s"}</div></div>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">{items.map((item) => <WorkCard key={item.id} item={item} compact />)}</div>
          </div>;
        })}
      </div> : null}
    </section>

    <section id="unscheduled-work" className="scroll-mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-end justify-between gap-4"><div><div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">Unscheduled Queue</div><h2 className="mt-1 text-xl font-black text-slate-950">Work waiting for a calendar slot</h2><p className="mt-1 text-xs font-semibold text-slate-500">Highest-urgency vehicles appear first. Suggested scheduling should normally keep this queue small; outside-partner coordination may leave work here temporarily.</p></div><div className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-600">{unscheduled.length} waiting</div></div>
      <div className="mt-4 space-y-2">{unscheduled.filter(visible).map((item) => <div key={item.id} className="grid gap-3 rounded-xl border border-slate-200 p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center"><div><div className="flex flex-wrap items-center gap-2"><button type="button" onClick={() => openItem(item)} className="font-black text-slate-950 hover:underline">{item.inventoryNumber} · {item.vehicleLabel}</button><span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${item.vehiclePriority === "1" ? "bg-red-100 text-red-700" : item.vehiclePriority === "3" ? "bg-slate-100 text-slate-600" : "bg-blue-50 text-blue-700"}`}>P{item.vehiclePriority}</span></div><div className="mt-1 text-sm font-black text-slate-800">{item.title}</div><div className="mt-2 text-xs font-bold text-slate-500">{item.performerName || "Partner / technician TBD"} · {item.locationName || "Location TBD"}</div></div><button type="button" onClick={() => openItem(item)} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-black text-slate-700">Edit & schedule</button></div>)}{unscheduled.filter(visible).length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm font-bold text-slate-400">No matching unscheduled work.</div> : null}</div>
    </section>

    {selectedItem ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4" role="dialog" aria-modal="true" onMouseDown={(event) => { if (event.currentTarget === event.target) setSelectedItem(null); }}>
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4"><div><div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">Schedule item editor</div><h2 className="mt-1 text-xl font-black text-slate-950">{selectedItem.title}</h2><div className="mt-1 text-sm font-bold text-slate-500">{selectedItem.inventoryNumber} · {selectedItem.vehicleLabel}</div></div><button type="button" onClick={() => setSelectedItem(null)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-black text-slate-500">Close</button></div>
        <div className="space-y-4 p-5">
          {selectedConflicts.length ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-black text-red-900">Conflict: {Array.from(new Set(selectedConflicts.map((conflict) => `${conflict.kind === "performer" ? "Partner / technician" : "Resource"}: ${conflict.label}`))).join(" · ")}</div> : null}
          <div className="grid gap-3 sm:grid-cols-2"><div className="rounded-xl bg-slate-50 p-3"><div className="text-[9px] font-black uppercase text-slate-400">Workload</div><div className="mt-1 text-sm font-black text-slate-900">Labor {hours(selectedItem.laborMinutes)} · Turn {hours(selectedElapsed)}</div></div><div className="rounded-xl bg-slate-50 p-3"><div className="text-[9px] font-black uppercase text-slate-400">Status</div><div className="mt-1 text-sm font-black text-slate-900">{labelize(selectedItem.status)}</div></div></div>
          <div className="rounded-xl border border-slate-200 p-4"><div className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-400">Execution assignment</div><div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label><div className="mb-1 text-[10px] font-black uppercase text-slate-400">Partner / technician</div><select disabled={workingId === selectedItem.id} value={performerKey(selectedItem)} onChange={(event) => void patchItem(selectedItem, { performerKey: event.target.value }, "Assignment updated.")} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold"><option value="unassigned">Needs assignment</option><optgroup label="Partners">{performerOptions.filter((option) => option.type === "partner").map((option) => <option key={option.key} value={option.key}>{option.displayName}{option.secondaryLabel ? ` · ${option.secondaryLabel}` : ""}</option>)}</optgroup><optgroup label="Mindful Team">{performerOptions.filter((option) => option.type === "internal").map((option) => <option key={option.key} value={option.key}>{option.displayName}</option>)}</optgroup></select></label>
            <label><div className="mb-1 text-[10px] font-black uppercase text-slate-400">Location</div><select disabled={workingId === selectedItem.id} value={selectedItem.locationId || ""} onChange={(event) => void patchItem(selectedItem, { locationId: event.target.value || null }, "Location updated.")} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold"><option value="">Location TBD</option>{locationOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label>
            <label className="sm:col-span-2"><div className="mb-1 text-[10px] font-black uppercase text-slate-400">Resource / bay</div><select disabled={workingId === selectedItem.id || !selectedItem.locationId} value={selectedItem.resourceId || ""} onChange={(event) => void patchItem(selectedItem, { resourceId: event.target.value || null }, "Resource updated.")} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold"><option value="">No resource</option>{selectedResources.map((option) => <option key={option.id} value={option.id}>{option.name} · {labelize(option.resourceType)}</option>)}</select></label>
          </div></div>
          <div className="rounded-xl border border-slate-200 p-4"><label className="block"><div className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-400">Scheduled start</div><input type="datetime-local" value={starts[selectedItem.id] || localInput(selectedItem.scheduledStartAt)} onChange={(event) => setStarts((current) => ({ ...current, [selectedItem.id]: event.target.value }))} className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-800" /></label><button type="button" disabled={workingId === selectedItem.id} onClick={() => void schedule(selectedItem)} className="mt-3 w-full rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50">{workingId === selectedItem.id ? "Saving..." : "Save Schedule"}</button></div>
          {!["in_progress", "complete", "cancelled"].includes(selectedItem.status) ? <button type="button" disabled={workingId === selectedItem.id} onClick={() => void patchItem(selectedItem, { status: "in_progress" }, "Work started.")} className="w-full rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-black text-blue-800">Start Work</button> : null}
          {selectedItem.status === "in_progress" ? <button type="button" disabled={workingId === selectedItem.id} onClick={() => void patchItem(selectedItem, { status: "complete" }, "Work completed.")} className="w-full rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-black text-emerald-800">Mark Complete</button> : null}
          {message ? <div className={`rounded-lg px-3 py-2 text-sm font-bold ${message.toLowerCase().includes("conflict") || message.toLowerCase().includes("failed") ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{message}</div> : null}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4"><div className="text-xs font-semibold text-slate-500">Start/complete actions are explicit. Role-based responsibility for those actions can be tightened when partner workflows are added.</div><Link href={`/mindful/inventory/${selectedItem.vehicleId}/work`} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-black text-slate-700">Open full Active Work →</Link></div>
      </div>
    </div> : null}
  </div>;
}
