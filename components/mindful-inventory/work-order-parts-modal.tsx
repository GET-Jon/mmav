"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { InventoryPartSuggestionsV4 } from "@/components/mindful-inventory/inventory-part-suggestions-v4";
import { PartsIssueThread } from "@/components/shared/parts-issue-thread";
import type { InventoryPartView } from "@/lib/mindful-inventory/parts-transport";
import type { PartSearchSuggestion } from "@/lib/mindful-inventory/part-suggestions";

export function WorkOrderPartsModal({ vehicleId, workOrderId, workOrderTitle: _workOrderTitle, suggestion, parts, partnerName, partnerPartsConfirmationStatus, partnerPartsNote, open, onClose }: {
  vehicleId: string;
  workOrderId: string;
  workOrderTitle: string;
  suggestion: PartSearchSuggestion;
  parts: InventoryPartView[];
  partnerName?: string | null;
  partnerPartsConfirmationStatus?: string | null;
  partnerPartsNote?: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [working, setWorking] = useState(false);
  const [selectedPartId, setSelectedPartId] = useState("");
  const [etaAt, setEtaAt] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const workOrderParts = useMemo(() => parts.filter((part) => part.workOrderId === workOrderId && part.status !== "cancelled"), [parts, workOrderId]);
  if (!open) return null;

  const issueReported = partnerPartsConfirmationStatus === "issue_reported";
  const awaitingReconfirmation = partnerPartsConfirmationStatus === "reconfirmation_requested";
  const hasIssueHistory = Boolean(partnerPartsNote);

  async function issueAction(action: "reorder" | "not_required" | "resolve") {
    setWorking(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/mindful/inventory/work-orders/${workOrderId}/parts-issue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, partId: selectedPartId || null, etaAt: etaAt || null }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not update the parts issue.");
      if (action === "resolve") setMessage("Issue marked resolved. The Partner must reconfirm the revised parts plan.");
      else if (action === "reorder") setMessage(payload.scheduleAtRisk ? "Replacement reordered. Its ETA is after the scheduled work time, so the schedule may need attention." : "Replacement reordered and tracked.");
      else setMessage("Part marked not required and recorded in History.");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update the parts issue.");
    } finally {
      setWorking(false);
    }
  }

  function scrollToParts() {
    document.getElementById(`parts-workflow-${workOrderId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="max-h-[92vh] w-full max-w-6xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-5 py-3">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">Active Work · Parts</div>
            <div className="mt-0.5 text-sm font-bold text-slate-600">Resolve sourcing and Partner-reported exceptions without leaving Active Work.</div>
          </div>
          <button type="button" onClick={onClose} className="cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-black">Close</button>
        </div>

        <div className="p-4 sm:p-5">
          {issueReported || awaitingReconfirmation || hasIssueHistory ? <div className={`mb-4 rounded-xl border p-4 ${issueReported ? "border-amber-300 bg-amber-50" : awaitingReconfirmation ? "border-blue-200 bg-blue-50/60" : "border-slate-200 bg-slate-50"}`}>
            <div className={`text-[10px] font-black uppercase tracking-[0.1em] ${issueReported ? "text-amber-800" : awaitingReconfirmation ? "text-blue-800" : "text-slate-500"}`}>{issueReported ? "Partner parts issue" : awaitingReconfirmation ? "Awaiting Partner reconfirmation" : "Previous parts issue"}</div>
            <div className="mt-1 text-sm font-black text-slate-950">{issueReported ? `${partnerName || "The assigned Partner"} reported a problem with the parts plan.` : awaitingReconfirmation ? `Mindful updated the parts plan. ${partnerName || "The assigned Partner"} must review and reconfirm it.` : "The issue is resolved. The conversation remains available for the Work Order record."}</div>

            <PartsIssueThread endpoint={`/api/mindful/inventory/work-orders/${workOrderId}/parts-issue`} canReply={issueReported || awaitingReconfirmation} />

            {issueReported ? <div className="mt-4 border-t border-amber-200 pt-4">
              <div className="text-[10px] font-black uppercase tracking-[0.1em] text-amber-800">Resolve the affected part</div>
              <div className="mt-1 text-xs font-semibold text-amber-950">Use a quick action when it fits. For a replacement part, different supplier, price, source, or other unusual correction, use Manage / replace / source below.</div>
              <div className="mt-3 grid gap-2 md:grid-cols-[minmax(220px,1fr)_170px_auto_auto]">
                <select value={selectedPartId} onChange={(event) => setSelectedPartId(event.target.value)} className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-bold">
                  <option value="">Choose affected part</option>
                  {workOrderParts.map((part) => <option key={part.id} value={part.id}>{part.description}</option>)}
                </select>
                <input type="date" value={etaAt} onChange={(event) => setEtaAt(event.target.value)} className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-bold" title="Replacement ETA (optional)" />
                <button type="button" disabled={!selectedPartId || working} onClick={() => void issueAction("reorder")} className="cursor-pointer rounded-lg bg-slate-950 px-3 py-2 text-xs font-black text-white disabled:cursor-default disabled:bg-slate-200 disabled:text-slate-400">Reorder same part</button>
                <button type="button" disabled={!selectedPartId || working} onClick={() => void issueAction("not_required")} className="cursor-pointer rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-black text-amber-900 disabled:cursor-default disabled:opacity-40">Not required</button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" onClick={scrollToParts} className="cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-black text-slate-800">Manage / replace / source ↓</button>
                <button type="button" disabled={working} onClick={() => void issueAction("resolve")} className="cursor-pointer rounded-lg bg-emerald-700 px-4 py-2 text-xs font-black text-white disabled:opacity-50">{working ? "Working…" : "Mark issue resolved"}</button>
              </div>
              <div className="mt-2 text-[10px] font-semibold text-amber-800">Mark resolved only after the correction is actually reflected below. Lot Logic will then require Partner reconfirmation.</div>
              {message ? <div className="mt-2 text-xs font-bold text-emerald-700">{message}</div> : null}
              {error ? <div className="mt-2 text-xs font-bold text-red-700">{error}</div> : null}
            </div> : null}
          </div> : null}

          <div id={`parts-workflow-${workOrderId}`} className="scroll-mt-24">
            <InventoryPartSuggestionsV4 vehicleId={vehicleId} suggestions={[suggestion]} parts={workOrderParts} />
          </div>
        </div>

        <div className="sticky bottom-0 flex justify-end border-t border-slate-200 bg-white px-5 py-3">
          <button type="button" onClick={onClose} className="cursor-pointer rounded-lg bg-slate-950 px-4 py-2 text-xs font-black text-white">Done</button>
        </div>
      </div>
    </div>
  );
}
