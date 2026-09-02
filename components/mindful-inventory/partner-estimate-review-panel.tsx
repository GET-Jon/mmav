"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type PartnerEstimateReviewItem = {
  workOrderId: string;
  title: string;
  partnerName: string;
  estimateId: string;
  revisionNo: number;
  quotedCost: number | null;
  estimatedLaborMinutes: number | null;
  estimatedElapsedMinutes: number | null;
  notes: string | null;
  submittedAt: string;
};

function money(value: number | null) {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function hours(value: number | null) {
  return value == null ? "—" : `${Math.round((value / 60) * 10) / 10} hr`;
}

export function PartnerEstimateReviewPanel({ items }: { items: PartnerEstimateReviewItem[] }) {
  const router = useRouter();
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [message, setMessage] = useState<Record<string, string>>({});

  if (!items.length) return null;

  async function review(item: PartnerEstimateReviewItem, action: "approve" | "request_revision") {
    setWorkingId(item.workOrderId);
    setMessage((current) => ({ ...current, [item.workOrderId]: "" }));
    try {
      const response = await fetch(`/api/mindful/inventory/work-orders/${item.workOrderId}/estimate-review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Estimate review failed.");
      setMessage((current) => ({
        ...current,
        [item.workOrderId]: action === "approve" ? "Estimate approved." : "Revision requested.",
      }));
      router.refresh();
    } catch (error) {
      setMessage((current) => ({
        ...current,
        [item.workOrderId]: error instanceof Error ? error.message : "Estimate review failed.",
      }));
    } finally {
      setWorkingId(null);
    }
  }

  return (
    <section id="partner-estimate-review" className="scroll-mt-4 rounded-2xl border-2 border-blue-300 bg-blue-50 p-4">
      <div className="text-[10px] font-black uppercase tracking-[0.12em] text-blue-700">Action required</div>
      <h2 className="mt-1 text-xl font-black text-slate-950">Partner estimate review</h2>
      <p className="mt-1 text-sm text-slate-600">These quotes exceeded the automatic approval rules or otherwise require a manager decision. Internal thresholds remain hidden from the partner.</p>
      <div className="mt-4 space-y-3">
        {items.map((item) => (
          <div key={item.workOrderId} className="rounded-xl border border-blue-200 bg-white p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="text-sm font-black">{item.title}</div>
                <div className="mt-1 text-xs font-semibold text-slate-500">{item.partnerName} · Revision {item.revisionNo} · {new Date(item.submittedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</div>
              </div>
              <div className="grid grid-cols-3 gap-4 text-right">
                <div><div className="text-sm font-black">{money(item.quotedCost)}</div><div className="text-[10px] font-black uppercase text-slate-400">Quote</div></div>
                <div><div className="text-sm font-black">{hours(item.estimatedLaborMinutes)}</div><div className="text-[10px] font-black uppercase text-slate-400">Labor</div></div>
                <div><div className="text-sm font-black">{hours(item.estimatedElapsedMinutes)}</div><div className="text-[10px] font-black uppercase text-slate-400">Turnaround</div></div>
              </div>
            </div>
            {item.notes ? <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">{item.notes}</p> : null}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button disabled={workingId === item.workOrderId} onClick={() => void review(item, "approve")} className="rounded-lg bg-slate-950 px-4 py-2 text-xs font-black text-white disabled:opacity-40">Approve Estimate</button>
              <button disabled={workingId === item.workOrderId} onClick={() => void review(item, "request_revision")} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-black text-slate-700 disabled:opacity-40">Request Revision</button>
              {message[item.workOrderId] ? <span className="text-xs font-bold text-slate-600">{message[item.workOrderId]}</span> : null}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
