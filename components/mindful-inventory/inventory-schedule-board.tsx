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
  const mondayDistance = day === 0 ? -6 : 1 - day;
  now.setDate(now.getDate() + mondayDistance + offset * 7);
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
  const [selectedItem, setSelectedItem] = useState<InventoryScheduleWork | null>(null);

  const weekStart = useMemo(() => startOfWeek(weekOffset), [weekOffset]);
  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + index);
    return date;
  }), [weekStart]);

  const active = work.filter((item) => item.status !== "complete" && item.status !== "cancelled");
  const scheduled = active.filter((item) => item.scheduledStartAt);
  const unscheduled = active.filter((item) => !item.scheduledStartAt);
  const unassigned = active.filter((item) => !item.performerName);
  const locationTbd = active.filter((item) => !item.locationId);
  const totalLabor = active.reduce((sum, item) => sum + (item.laborMinutes || 0), 0);

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
    if (viewMode === "conflicts") return conflictsByItem.has(item.id);
    if (viewMode === "gaps") return gapItemIds.has(item.id);
    return true;
  }

  function openItem(item: InventoryScheduleWork) {
    setMessage("");
    setStarts((current) => ({ ...current, [item.id]: current[item.id] || localInput(item.scheduledStartAt) || localInputDefault() }));
    setSelectedItem(item);
  }

  async function schedule(item: InventoryScheduleWork, closeOnSuccess = false) {
    const localStart = starts[item.id] || localInput(item.scheduledStartAt) || localInputDefault();
    setWorkingId(item.id);
    setMessage("");
    try {
      const response = await fetch(`/api/mindful/inventory/work-orders/${item.id}/schedule`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduledStartAt: new Date(localStart).toISOString() }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Failed to schedule work.");
      setMessage(`${item.title} scheduled.`);
      if (closeOnSuccess) setSelectedItem(null);
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
        error?: string;
        status?: string;
        assignedPartnerId?: string | null;
        assignedUserId?: string | null;
        locationId?: string | null;
        resourceId?: string | null;
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
          : next.assignedUserId
            ? performerOptions.find((option) => option.type === "internal" && option.id === next.assignedUserId)
            : null;
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

  const selectedConflicts = selectedItem ? conflictsByItem.get(selectedItem.id) || [] : [];
  const selectedElapsed = selectedItem ? selectedItem.elapsedMinutes ?? selectedItem.legacyDurationMinutes : null;
  const selectedResources = selectedItem?.locationId
    ? resourceOptions.filter((resource) => resource.locationId === selectedItem.locationId)
    : [];

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">Operations Schedule</div>
            <h1 className="mt-1 text-2xl font-black text-slate-950">Resource planning across every car</h1>
            <p className="mt-2 max-w-3xl text-sm font-medium leading-6 text-slate-500">See conflicts, missing schedule information, calendar occupancy, and labor load in one place. Click a job to edit its execution details without leaving this board.</p>
          </div>
          <div className="grid min-w-[420px] grid-cols-4 gap-2">
            <div className="rounded-xl bg-slate-50 px-3 py-3"><div className="text-[10px] font-black uppercase text-slate-400">Active Work</div><div className="mt-1 text-lg font-black">{active.length}</div></div>
            <div className="rounded-xl bg-slate-50 px-3 py-3"><div className="text-[10px] font-black uppercase text-slate-400">Unscheduled</div><div className="mt-1 text-lg font-black">{unscheduled.length}</div></div>
            <div className={`rounded-xl px-3 py-3 ${conflictItemCount ? "bg-red-50 text-red-800" : "bg-emerald-50 text-emerald-800"}`}><div className="text-[10px] font-black uppercase opacity-70">Conflicts</div><div className="mt-1 text-lg font-black">{conflictItemCount}</div></div>
            <div className="rounded-xl bg-slate-950 px-3 py-3 text-white"><div className="text-[10px] font-black uppercase text-slate-400">Labor Load</div><div className="mt-1 text-lg font-black">{hours(totalLabor)}</div></div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {(["all", "conflicts", "gaps"] as ViewMode[]).map((mode) => <button key={mode} onClick={() => setViewMode(mode)} className={`rounded-full px-3 py-1.5 text-xs font-black ${viewMode === mode ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-600"}`}>{mode === "all" ? "All Work" : mode === "conflicts" ? `Conflicts (${conflictItemCount})` : `Missing Info (${gapItemIds.size})`}</button>)}
          <span className="ml-1 text-xs font-bold text-slate-400">{unassigned.length} need partner / technician · {locationTbd.length} need location</span>
        </div>
        {message && !selectedItem ? <div className={`mt-3 rounded-xl px-3 py-2 text-sm font-bold ${message.toLowerCase().includes("conflict") || message.toLowerCase().includes("failed") ? "bg-red-50 text-red-700" : "bg-slate-50 text-slate-600"}`}>{message}</div> : null}
      </section>

      {conflictItemCount > 0 ? <section className="rounded-xl border border-red-200 bg-red-50/70 px-3 py-2.5 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-black uppercase tracking-[0.1em] text-red-600">Schedule conflicts</span>
          <span className="rounded-full bg-red-100 px-2 py-1 text-[10px] font-black text-red-700">{conflictItemCount} need attention</span>
          {Array.from(conflictsByItem.entries()).map(([itemId, itemConflicts]) => {
            const item = work.find((entry) => entry.id === itemId);
            if (!item) return null;
            const issueLabel = Array.from(new Set(itemConflicts.map((conflict) => `${conflict.kind === "performer" ? "Partner / technician" : "Resource"}: ${conflict.label}`))).join(" · ");
            return <button type="button" key={itemId} onClick={() => openItem(item)} className="rounded-full border border-red-200 bg-white px-3 py-1.5 text-left text-xs font-black text-red-800 hover:border-red-400"><span className="text-slate-900">{item.vehicleLabel} · {item.title}</span><span className="ml-1 font-bold text-red-600">— {issueLabel}</span></button>;
          })}
        </div>
      </section> : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setWeekOffset((value) => value - 1)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-black text-slate-600">←</button>
            <button type="button" onClick={() => setWeekOffset(0)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-black text-slate-600">This week</button>
            <button type="button" onClick={() => setWeekOffset((value) => value + 1)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-black text-slate-600">→</button>
          </div>
          <div className="text-sm font-black text-slate-700">{days[0].toLocaleDateString("en-US", { month: "short", day: "numeric" })} – {days[6].toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</div>
        </div>

        <div className="grid min-w-[1120px] grid-cols-7 gap-2 overflow-x-auto">
          {days.map((day) => {
            const items = scheduled.filter((item) => item.scheduledStartAt && dayKey(new Date(item.scheduledStartAt)) === dayKey(day) && visible(item));
            return <div key={dayKey(day)} className="min-h-[320px] rounded-xl border border-slate-200 bg-slate-50 p-2">
              <div className="border-b border-slate-200 px-1 pb-2"><div className="text-[10px] font-black uppercase text-slate-400">{day.toLocaleDateString("en-US", { weekday: "short" })}</div><div className="text-base font-black text-slate-900">{day.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div></div>
              <div className="mt-2 space-y-2">
                {items.map((item) => {
                  const elapsed = item.elapsedMinutes ?? item.legacyDurationMinutes;
                  const itemConflicts = conflictsByItem.get(item.id) || [];
                  const hasMissingInfo = !item.performerName || !item.locationId;
                  return <button type="button" key={item.id} onClick={() => openItem(item)} className={`block w-full rounded-xl border bg-white p-3 text-left shadow-sm transition ${itemConflicts.length ? "border-red-300 ring-1 ring-red-100 hover:border-red-500" : hasMissingInfo ? "border-amber-300 hover:border-amber-500" : "border-slate-200 hover:border-slate-400"}`}>
                    <div className="flex items-center justify-between gap-2"><div className="text-[10px] font-black uppercase tracking-wide text-slate-400">{new Date(item.scheduledStartAt!).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</div>{itemConflicts.length ? <span className="rounded-full bg-red-100 px-2 py-0.5 text-[9px] font-black uppercase text-red-700">Conflict</span> : hasMissingInfo ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-black uppercase text-amber-800">Missing info</span> : null}</div>
                    <div className="mt-1 text-xs font-black text-slate-950">{item.inventoryNumber} · {item.vehicleLabel}</div>
                    <div className="mt-1 text-sm font-black text-slate-800">{item.title}</div>
                    <div className="mt-2 text-[10px] font-bold text-slate-500">{item.performerName || "Partner / technician TBD"}{item.locationName ? ` · ${item.locationName}` : " · Location TBD"}{item.resourceName ? ` · ${item.resourceName}` : ""}</div>
                    <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-black"><span className="rounded-full bg-blue-50 px-2 py-1 text-blue-700">Labor {hours(item.laborMinutes)}</span><span className="rounded-full bg-violet-50 px-2 py-1 text-violet-700">Turn {hours(elapsed)}</span></div>
                  </button>;
                })}
                {items.length === 0 ? <div className="px-1 py-4 text-xs font-bold text-slate-300">No matching work</div> : null}
              </div>
            </div>;
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-end justify-between gap-4"><div><div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">Unscheduled Queue</div><h2 className="mt-1 text-xl font-black text-slate-950">Work waiting for a calendar slot</h2></div><div className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-600">{unscheduled.length} waiting</div></div>
        <div className="mt-4 space-y-2">
          {unscheduled.filter(visible).map((item) => {
            const elapsed = item.elapsedMinutes ?? item.legacyDurationMinutes;
            return <div key={item.id} className="grid gap-3 rounded-xl border border-slate-200 p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
              <div><button type="button" onClick={() => openItem(item)} className="font-black text-slate-950 hover:underline">{item.inventoryNumber} · {item.vehicleLabel}</button><div className="mt-1 text-sm font-black text-slate-800">{item.title}</div><div className="mt-2 text-xs font-bold text-slate-500">{item.performerName || "Partner / technician TBD"} · {item.locationName || "Location TBD"} · Labor {hours(item.laborMinutes)} · Turn {hours(elapsed)}</div></div>
              <button type="button" onClick={() => openItem(item)} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-black text-slate-700">Edit & schedule</button>
            </div>;
          })}
          {unscheduled.filter(visible).length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm font-bold text-slate-400">No matching unscheduled work.</div> : null}
        </div>
      </section>

      {selectedItem ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4" role="dialog" aria-modal="true" aria-label={`${selectedItem.vehicleLabel} ${selectedItem.title}`} onMouseDown={(event) => { if (event.currentTarget === event.target) setSelectedItem(null); }}>
        <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl">
          <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
            <div className="min-w-0"><div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">Schedule item editor</div><h2 className="mt-1 text-xl font-black text-slate-950">{selectedItem.title}</h2><div className="mt-1 text-sm font-bold text-slate-500">{selectedItem.inventoryNumber} · {selectedItem.vehicleLabel}</div></div>
            <button type="button" onClick={() => setSelectedItem(null)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-black text-slate-500">Close</button>
          </div>

          <div className="space-y-4 p-5">
            {selectedConflicts.length ? <div className="rounded-xl border border-red-200 bg-red-50 p-3"><div className="text-[10px] font-black uppercase text-red-600">Conflict</div><div className="mt-1 text-sm font-black text-red-900">{Array.from(new Set(selectedConflicts.map((conflict) => `${conflict.kind === "performer" ? "Partner / technician" : "Resource"}: ${conflict.label}`))).join(" · ")}</div></div> : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-slate-50 p-3"><div className="text-[9px] font-black uppercase text-slate-400">Workload</div><div className="mt-1 text-sm font-black text-slate-900">Labor {hours(selectedItem.laborMinutes)} · Turn {hours(selectedElapsed)}</div></div>
              <label className="rounded-xl bg-slate-50 p-3"><div className="text-[9px] font-black uppercase text-slate-400">Status</div><select disabled={workingId === selectedItem.id} value={selectedItem.status} onChange={(event) => void patchItem(selectedItem, { status: event.target.value }, "Status updated.")} className="mt-1 w-full bg-transparent text-sm font-black text-slate-900 outline-none"><option value="planned">Planned</option><option value="ready_to_schedule">Ready to schedule</option><option value="scheduled">Scheduled</option><option value="in_progress">In progress</option>{selectedItem.status === "blocked" ? <option value="blocked" disabled>Blocked</option> : null}<option value="complete">Complete</option><option value="cancelled">Cancelled</option></select></label>
            </div>

            <div className="rounded-xl border border-slate-200 p-4">
              <div className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-400">Execution assignment</div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label><div className="mb-1 text-[10px] font-black uppercase text-slate-400">Partner / technician</div><select disabled={workingId === selectedItem.id} value={performerKey(selectedItem)} onChange={(event) => void patchItem(selectedItem, { performerKey: event.target.value }, "Assignment updated.")} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold"><option value="unassigned">Needs assignment</option><optgroup label="Partners">{performerOptions.filter((option) => option.type === "partner").map((option) => <option key={option.key} value={option.key}>{option.displayName}{option.secondaryLabel ? ` · ${option.secondaryLabel}` : ""}</option>)}</optgroup><optgroup label="Mindful Team">{performerOptions.filter((option) => option.type === "internal").map((option) => <option key={option.key} value={option.key}>{option.displayName}</option>)}</optgroup></select></label>
                <label><div className="mb-1 text-[10px] font-black uppercase text-slate-400">Location</div><select disabled={workingId === selectedItem.id} value={selectedItem.locationId || ""} onChange={(event) => void patchItem(selectedItem, { locationId: event.target.value || null }, "Location updated.")} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold"><option value="">Location TBD</option>{locationOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label>
                <label className="sm:col-span-2"><div className="mb-1 text-[10px] font-black uppercase text-slate-400">Resource / bay</div><select disabled={workingId === selectedItem.id || !selectedItem.locationId} value={selectedItem.resourceId || ""} onChange={(event) => void patchItem(selectedItem, { resourceId: event.target.value || null }, "Resource updated.")} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold"><option value="">No resource</option>{selectedResources.map((option) => <option key={option.id} value={option.id}>{option.name} · {labelize(option.resourceType)}</option>)}</select></label>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 p-4">
              <label className="block"><div className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-400">Scheduled start</div><input type="datetime-local" value={starts[selectedItem.id] || localInput(selectedItem.scheduledStartAt)} onChange={(event) => setStarts((current) => ({ ...current, [selectedItem.id]: event.target.value }))} className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-800" /></label>
              <button type="button" disabled={workingId === selectedItem.id} onClick={() => void schedule(selectedItem)} className="mt-3 w-full rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50">{workingId === selectedItem.id ? "Saving..." : "Save Schedule"}</button>
            </div>

            {message ? <div className={`rounded-lg px-3 py-2 text-sm font-bold ${message.toLowerCase().includes("conflict") || message.toLowerCase().includes("failed") ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{message}</div> : null}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4">
            <div className="text-xs font-semibold text-slate-500">Partner / technician, location, resource, status, and timing can be managed here.</div>
            <Link href={`/mindful/inventory/${selectedItem.vehicleId}/work`} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-black text-slate-700">Open full Active Work →</Link>
          </div>
        </div>
      </div> : null}
    </div>
  );
}
