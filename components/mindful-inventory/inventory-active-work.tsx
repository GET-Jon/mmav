"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import type { InventoryWorkOrderView } from "@/lib/mindful-inventory/active-work";

function money(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function labelize(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function hours(minutes: number | null | undefined) {
  if (minutes === null || minutes === undefined) return "—";
  return `${Math.round((minutes / 60) * 10) / 10} hr`;
}

function dayKey(value: string | null) {
  if (!value) return "unscheduled";
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dayLabel(value: string) {
  const date = new Date(`${value}T12:00:00`);
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function timeLabel(value: string | null) {
  if (!value) return "Time TBD";
  return new Date(value).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function dateTimeLabel(value: string | null) {
  if (!value) return "Not scheduled";
  return new Date(value).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function statusClass(status: InventoryWorkOrderView["status"]) {
  if (status === "complete") return "bg-emerald-100 text-emerald-700";
  if (status === "in_progress") return "bg-blue-100 text-blue-700";
  if (status === "scheduled") return "bg-violet-100 text-violet-700";
  if (status === "blocked") return "bg-amber-100 text-amber-800";
  if (status === "cancelled") return "bg-slate-200 text-slate-500";
  return "bg-slate-100 text-slate-700";
}

export function InventoryActiveWork({ vehicleId, workOrders }: { vehicleId: string; workOrders: InventoryWorkOrderView[] }) {
  const router = useRouter();
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const completed = workOrders.filter((work) => work.status === "complete" || work.status === "cancelled").length;
  const activeBudget = workOrders.reduce((sum, work) => sum + work.approvedBudget, 0);
  const totalLabor = workOrders.reduce((sum, work) => sum + (work.estimatedLaborMinutes || 0), 0);
  const forecastReady = workOrders
    .filter((work) => work.scheduledEndAt && work.status !== "cancelled")
    .sort((a, b) => new Date(b.scheduledEndAt!).getTime() - new Date(a.scheduledEndAt!).getTime())[0]?.scheduledEndAt || null;

  const nextWork = workOrders
    .filter((work) => work.status !== "complete" && work.status !== "cancelled")
    .sort((a, b) => {
      if (a.status === "in_progress" && b.status !== "in_progress") return -1;
      if (b.status === "in_progress" && a.status !== "in_progress") return 1;
      if (!a.scheduledStartAt) return 1;
      if (!b.scheduledStartAt) return -1;
      return new Date(a.scheduledStartAt).getTime() - new Date(b.scheduledStartAt).getTime();
    })[0] || null;

  const grouped = useMemo(() => {
    const sorted = [...workOrders].sort((a, b) => {
      const aTime = a.scheduledStartAt ? new Date(a.scheduledStartAt).getTime() : Number.MAX_SAFE_INTEGER;
      const bTime = b.scheduledStartAt ? new Date(b.scheduledStartAt).getTime() : Number.MAX_SAFE_INTEGER;
      if (aTime !== bTime) return aTime - bTime;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
    const map = new Map<string, InventoryWorkOrderView[]>();
    for (const work of sorted) {
      const key = dayKey(work.scheduledStartAt);
      map.set(key, [...(map.get(key) || []), work]);
    }
    return Array.from(map.entries());
  }, [workOrders]);

  async function updateStatus(workOrderId: string, status: "in_progress" | "complete") {
    setWorkingId(workOrderId);
    setMessage("");
    try {
      const response = await fetch(`/api/mindful/inventory/work-orders/${workOrderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Failed to update Work Order.");
      setMessage(status === "complete" ? "Work completed." : "Work started.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to update Work Order.");
    } finally {
      setWorkingId(null);
    }
  }

  if (workOrders.length === 0) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">Active Work</div>
        <h2 className="mt-1 text-2xl font-black text-slate-950">No Work Orders yet</h2>
        <p className="mt-2 text-sm font-medium text-slate-500">Approve the Preliminary Work Plan first. Activation creates Work Orders and a suggested execution schedule.</p>
        <button type="button" onClick={() => router.push(`/mindful/inventory/${vehicleId}/car-plan`)} className="mt-5 rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white">Open Work Plan →</button>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">Active Work · Vehicle Timeline</div>
              <Link href="/mindful/inventory/schedule" className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-700 hover:border-slate-400">Cross-vehicle Schedule →</Link>
            </div>
            {nextWork ? (
              <div className="mt-4 rounded-2xl bg-slate-950 p-4 text-white">
                <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">{nextWork.status === "in_progress" ? "Happening now" : "Next on this car"}</div>
                <div className="mt-1 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <div className="text-xl font-black">{nextWork.title}</div>
                    <div className="mt-1 text-sm font-semibold text-slate-300">{dateTimeLabel(nextWork.scheduledStartAt)} · {nextWork.performerName || "Performer not assigned"}</div>
                  </div>
                  <div className="text-sm font-bold text-slate-300">{nextWork.locationName || "Location TBD"}</div>
                </div>
              </div>
            ) : (
              <div className="mt-4 text-lg font-black text-slate-950">All authorized work is complete.</div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:min-w-[470px]">
            <div className="rounded-xl bg-slate-50 px-3 py-2.5"><div className="text-[9px] font-black uppercase text-slate-400">Progress</div><div className="text-base font-black">{completed}/{workOrders.length}</div></div>
            <div className="rounded-xl bg-slate-50 px-3 py-2.5"><div className="text-[9px] font-black uppercase text-slate-400">Forecast Ready</div><div className="text-sm font-black">{forecastReady ? new Date(forecastReady).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "TBD"}</div></div>
            <div className="rounded-xl bg-blue-50 px-3 py-2.5"><div className="text-[9px] font-black uppercase text-blue-500">Labor</div><div className="text-base font-black text-blue-800">{hours(totalLabor)}</div></div>
            <div className="rounded-xl bg-slate-950 px-3 py-2.5 text-white"><div className="text-[9px] font-black uppercase text-slate-400">Budget</div><div className="text-base font-black">{money(activeBudget)}</div></div>
          </div>
        </div>
        {message ? <div className="mt-3 text-sm font-bold text-slate-600">{message}</div> : null}
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
          <h3 className="text-sm font-black text-slate-950">Execution calendar</h3>
          <p className="mt-0.5 text-[11px] font-medium text-slate-500">Chronological view of who is doing what, when, and where. Suggested slots remain editable from the schedule.</p>
        </div>

        <div className="divide-y divide-slate-200">
          {grouped.map(([key, items]) => (
            <div key={key} className="grid lg:grid-cols-[150px_minmax(0,1fr)]">
              <div className="border-b border-slate-100 bg-slate-50 px-4 py-4 lg:border-b-0 lg:border-r lg:border-slate-200">
                <div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">{key === "unscheduled" ? "Needs slot" : "Scheduled"}</div>
                <div className="mt-1 text-sm font-black text-slate-950">{key === "unscheduled" ? "Unscheduled" : dayLabel(key)}</div>
              </div>
              <div className="divide-y divide-slate-100">
                {items.map((work) => {
                  const turnaround = work.estimatedElapsedMinutes ?? work.estimatedDurationMinutes;
                  const isDone = work.status === "complete" || work.status === "cancelled";
                  return (
                    <article key={work.id} className={`grid gap-3 px-4 py-4 xl:grid-cols-[105px_minmax(0,1fr)_210px_auto] xl:items-center ${isDone ? "bg-slate-50/60" : "bg-white"}`}>
                      <div>
                        <div className="text-sm font-black text-slate-950">{timeLabel(work.scheduledStartAt)}</div>
                        {work.scheduledEndAt ? <div className="mt-0.5 text-[10px] font-bold text-slate-400">to {timeLabel(work.scheduledEndAt)}</div> : null}
                        {work.scheduleSource === "suggested" ? <span className="mt-1 inline-flex rounded-full bg-violet-50 px-2 py-0.5 text-[9px] font-black uppercase text-violet-700">Suggested</span> : null}
                      </div>

                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${statusClass(work.status)}`}>{labelize(work.status)}</span>
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-black uppercase text-slate-600">{labelize(work.classification)}</span>
                          <h4 className="text-sm font-black text-slate-950 sm:text-base">{work.title}</h4>
                        </div>
                        {work.description ? <p className="mt-1 truncate text-xs font-medium text-slate-500">{work.description}</p> : null}
                        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-bold text-slate-500">
                          <span>{labelize(work.category)}</span>
                          <span>{money(work.approvedBudget)}</span>
                          <span className="text-blue-700">Labor {hours(work.estimatedLaborMinutes)}</span>
                          <span className="text-violet-700">Turn {hours(turnaround)}</span>
                        </div>
                      </div>

                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                        <div className="text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">Who / Where</div>
                        <div className={`mt-1 text-sm font-black ${work.performerName ? "text-slate-950" : "text-amber-700"}`}>{work.performerName || "Needs assignment"}</div>
                        <div className="mt-0.5 text-[11px] font-semibold text-slate-500">{work.locationName || "Location TBD"}</div>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        {!isDone && work.status !== "in_progress" ? (
                          <button type="button" disabled={workingId === work.id} onClick={() => updateStatus(work.id, "in_progress")} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-black text-slate-700 disabled:opacity-50">Start</button>
                        ) : null}
                        {work.status === "in_progress" ? (
                          <button type="button" disabled={workingId === work.id} onClick={() => updateStatus(work.id, "complete")} className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-black text-white disabled:opacity-50">Complete</button>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      {completed === workOrders.length ? (
        <section className="flex flex-col gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div><span className="text-xs font-black uppercase tracking-[0.08em] text-emerald-700">Execution Complete</span><span className="ml-3 text-sm font-bold text-slate-700">All authorized work is complete. Next: Final QC.</span></div>
          <button type="button" onClick={() => router.push(`/mindful/inventory/${vehicleId}/qc`)} className="shrink-0 rounded-lg bg-slate-950 px-4 py-2 text-xs font-black text-white">Open Final QC →</button>
        </section>
      ) : null}
    </div>
  );
}
