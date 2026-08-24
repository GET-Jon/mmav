"use client";

import Link from "next/link";
import { useState } from "react";
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

  const completedOrders = workOrders.filter((work) => work.status === "complete" || work.status === "cancelled");
  const openOrders = workOrders.filter((work) => work.status !== "complete" && work.status !== "cancelled");
  const completed = completedOrders.length;
  const activeBudget = workOrders.reduce((sum, work) => sum + work.approvedBudget, 0);
  const totalLabor = workOrders.reduce((sum, work) => sum + (work.estimatedLaborMinutes || 0), 0);

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

  function WorkRow({ work, muted = false }: { work: InventoryWorkOrderView; muted?: boolean }) {
    const turnaround = work.estimatedElapsedMinutes ?? work.estimatedDurationMinutes;
    const legacyOnly = work.estimatedElapsedMinutes === null && work.estimatedDurationMinutes !== null;

    return (
      <article className={`grid gap-3 px-4 py-3.5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center ${muted ? "bg-slate-50/50" : "bg-white"}`}>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-slate-600">{labelize(work.classification)}</span>
            <span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wide ${statusClass(work.status)}`}>{labelize(work.status)}</span>
            <h3 className="min-w-0 truncate text-sm font-black text-slate-950 sm:text-base">{work.title}</h3>
          </div>

          <div className="mt-1 flex flex-col gap-1 xl:flex-row xl:items-center xl:gap-3">
            {work.description ? <p className="min-w-0 flex-1 truncate text-xs font-medium text-slate-500 sm:text-sm">{work.description}</p> : <span className="flex-1" />}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-bold text-slate-500">
              <span>{labelize(work.category)}</span>
              <span>{money(work.approvedBudget)}</span>
              <span className="text-blue-700">Labor {hours(work.estimatedLaborMinutes)}</span>
              <span className="text-violet-700">Turn {hours(turnaround)}{legacyOnly ? "*" : ""}</span>
              {work.scheduledStartAt ? <span className="text-emerald-700">{new Date(work.scheduledStartAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span> : null}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {work.status !== "complete" && work.status !== "cancelled" && work.status !== "in_progress" ? (
            <button type="button" disabled={workingId === work.id} onClick={() => updateStatus(work.id, "in_progress")} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-black text-slate-700 disabled:opacity-50">Start</button>
          ) : null}
          {work.status === "in_progress" ? (
            <button type="button" disabled={workingId === work.id} onClick={() => updateStatus(work.id, "complete")} className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-black text-white disabled:opacity-50">Complete</button>
          ) : null}
        </div>
      </article>
    );
  }

  if (workOrders.length === 0) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">Active Work</div>
        <h2 className="mt-1 text-2xl font-black text-slate-950">No Work Orders yet</h2>
        <p className="mt-2 text-sm font-medium text-slate-500">Approve the Preliminary Work Plan first. Authorized Plan Items will become execution here.</p>
        <button type="button" onClick={() => router.push(`/mindful/inventory/${vehicleId}/car-plan`)} className="mt-5 rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white">Open Work Plan →</button>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">Active Work</div>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <h2 className="text-xl font-black text-slate-950">Authorized execution queue</h2>
              <Link href="/mindful/inventory/schedule" className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-700 hover:border-slate-400">Cross-vehicle Schedule →</Link>
            </div>
            <p className="mt-1 text-xs font-medium text-slate-500">Labor = technician capacity. Turnaround = calendar occupancy.</p>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:min-w-[430px]">
            <div className="rounded-xl bg-slate-50 px-3 py-2"><div className="text-[9px] font-black uppercase text-slate-400">Orders</div><div className="text-base font-black">{workOrders.length}</div></div>
            <div className="rounded-xl bg-slate-50 px-3 py-2"><div className="text-[9px] font-black uppercase text-slate-400">Complete</div><div className="text-base font-black">{completed}/{workOrders.length}</div></div>
            <div className="rounded-xl bg-blue-50 px-3 py-2"><div className="text-[9px] font-black uppercase text-blue-500">Labor Load</div><div className="text-base font-black text-blue-800">{hours(totalLabor)}</div></div>
            <div className="rounded-xl bg-slate-950 px-3 py-2 text-white"><div className="text-[9px] font-black uppercase text-slate-400">Budget</div><div className="text-base font-black">{money(activeBudget)}</div></div>
          </div>
        </div>
        {message ? <div className="mt-3 text-sm font-bold text-slate-600">{message}</div> : null}
      </section>

      {completed === workOrders.length ? (
        <section className="flex flex-col gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div><span className="text-xs font-black uppercase tracking-[0.08em] text-emerald-700">Execution Complete</span><span className="ml-3 text-sm font-bold text-slate-700">All authorized work is complete. Next: Final QC.</span></div>
          <button type="button" onClick={() => router.push(`/mindful/inventory/${vehicleId}/qc`)} className="shrink-0 rounded-lg bg-slate-950 px-4 py-2 text-xs font-black text-white">Open Final QC →</button>
        </section>
      ) : null}

      {openOrders.length > 0 ? (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2.5">
            <div><h3 className="text-sm font-black text-slate-950">Open Work</h3><p className="text-[11px] font-medium text-slate-500">Work that still needs execution.</p></div>
            <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-black text-slate-600">{openOrders.length}</span>
          </div>
          <div className="divide-y divide-slate-100">{openOrders.map((work) => <WorkRow key={work.id} work={work} />)}</div>
        </section>
      ) : null}

      {completedOrders.length > 0 ? (
        <details open={openOrders.length === 0} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <summary className="flex cursor-pointer list-none items-center justify-between bg-slate-50 px-4 py-2.5">
            <div><h3 className="text-sm font-black text-slate-950">Completed Work</h3><p className="text-[11px] font-medium text-slate-500">Finished and cancelled Work Orders.</p></div>
            <div className="flex items-center gap-2"><span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-black text-slate-600">{completedOrders.length}</span><span className="text-xs font-black text-slate-400">Show / hide</span></div>
          </summary>
          <div className="divide-y divide-slate-100 border-t border-slate-200">{completedOrders.map((work) => <WorkRow key={work.id} work={work} muted />)}</div>
        </details>
      ) : null}

      {workOrders.some((work) => work.estimatedElapsedMinutes === null && work.estimatedDurationMinutes !== null) ? <div className="px-1 text-[10px] font-semibold text-slate-400">* Turnaround uses a legacy AI duration estimate for this Work Order.</div> : null}
    </div>
  );
}
