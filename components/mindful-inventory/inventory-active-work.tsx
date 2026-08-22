"use client";

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

export function InventoryActiveWork({ vehicleId, workOrders }: { vehicleId: string; workOrders: InventoryWorkOrderView[] }) {
  const router = useRouter();
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const completed = workOrders.filter((work) => work.status === "complete" || work.status === "cancelled").length;
  const activeBudget = workOrders.reduce((sum, work) => sum + work.approvedBudget, 0);

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
        <p className="mt-2 text-sm font-medium text-slate-500">Approve the Preliminary Work Plan first. Authorized Plan Items will become execution here.</p>
        <button type="button" onClick={() => router.push(`/mindful/inventory/${vehicleId}/car-plan`)} className="mt-5 rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white">Open Work Plan →</button>
      </section>
    );
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">Active Work</div>
            <h2 className="mt-1 text-2xl font-black text-slate-950">Authorized execution queue</h2>
            <p className="mt-2 text-sm font-medium text-slate-500">These Work Orders came from the immutable Active Work Plan. Start and complete work here; later scope changes will use versioned change requests.</p>
          </div>
          <div className="grid min-w-[300px] grid-cols-3 gap-2">
            <div className="rounded-xl bg-slate-50 px-3 py-3"><div className="text-[10px] font-black uppercase text-slate-400">Orders</div><div className="mt-1 text-lg font-black">{workOrders.length}</div></div>
            <div className="rounded-xl bg-slate-50 px-3 py-3"><div className="text-[10px] font-black uppercase text-slate-400">Complete</div><div className="mt-1 text-lg font-black">{completed}/{workOrders.length}</div></div>
            <div className="rounded-xl bg-slate-950 px-3 py-3 text-white"><div className="text-[10px] font-black uppercase text-slate-400">Budget</div><div className="mt-1 text-lg font-black">{money(activeBudget)}</div></div>
          </div>
        </div>
        {message ? <div className="mt-4 text-sm font-bold text-slate-600">{message}</div> : null}
      </section>

      <section className="space-y-3">
        {workOrders.map((work) => (
          <article key={work.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-slate-700">{labelize(work.classification)}</span>
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${work.status === "complete" ? "bg-emerald-100 text-emerald-700" : work.status === "in_progress" ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-700"}`}>{labelize(work.status)}</span>
                </div>
                <h3 className="mt-2 text-lg font-black text-slate-950">{work.title}</h3>
                {work.description ? <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">{work.description}</p> : null}
                <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs font-bold text-slate-500">
                  <span>Category: {labelize(work.category)}</span>
                  <span>Budget: {money(work.approvedBudget)}</span>
                  <span>Estimated time: {work.estimatedDurationMinutes === null ? "—" : `${Math.round(work.estimatedDurationMinutes / 6) / 10} hr`}</span>
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                {work.status !== "complete" && work.status !== "cancelled" && work.status !== "in_progress" ? (
                  <button type="button" disabled={workingId === work.id} onClick={() => updateStatus(work.id, "in_progress")} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-black text-slate-700 disabled:opacity-50">Start Work</button>
                ) : null}
                {work.status === "in_progress" ? (
                  <button type="button" disabled={workingId === work.id} onClick={() => updateStatus(work.id, "complete")} className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50">Complete</button>
                ) : null}
              </div>
            </div>
          </article>
        ))}
      </section>

      {completed === workOrders.length ? (
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
          <div className="text-xs font-black uppercase tracking-[0.1em] text-emerald-700">Execution Complete</div>
          <h3 className="mt-1 text-lg font-black text-slate-950">Next: Final QC</h3>
          <p className="mt-1 text-sm font-medium text-slate-600">All Active Work is complete. The vehicle has been advanced to Final QC.</p>
          <button type="button" onClick={() => router.push(`/mindful/inventory/${vehicleId}/qc`)} className="mt-4 rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white">Open Final QC →</button>
        </section>
      ) : null}
    </div>
  );
}
