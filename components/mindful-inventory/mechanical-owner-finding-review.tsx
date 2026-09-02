"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import type { InventoryFindingView } from "@/lib/mindful-inventory/intake-inspection";

function money(value: number | null) {
  if (value === null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

export function MechanicalOwnerFindingReview({ vehicleId, findings }: { vehicleId: string; findings: InventoryFindingView[] }) {
  const router = useRouter();
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>(() => Object.fromEntries(findings.map((finding) => [finding.id, finding.mechanicalOwnerReviewNotes || ""])));
  const [message, setMessage] = useState("");

  async function review(finding: InventoryFindingView, decision: "accept" | "clarification" | "dismiss") {
    if (decision === "clarification" && !(notes[finding.id] || "").trim()) {
      setMessage("Add the question or clarification you want the inspector to answer.");
      return;
    }
    setWorkingId(finding.id);
    setMessage("");
    try {
      const response = await fetch(`/api/mindful/inventory/vehicles/${vehicleId}/inspection-finding-review`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ findingId: finding.id, decision, notes: notes[finding.id] || "" }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Finding review could not be saved.");
      setMessage(decision === "accept" ? `${finding.title} accepted.` : decision === "dismiss" ? `${finding.title} dismissed from the mechanical scope.` : `Clarification requested from the inspector for ${finding.title}.`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Finding review could not be saved.");
    } finally {
      setWorkingId(null);
    }
  }

  const pending = findings.filter((finding) => !finding.mechanicalOwnerReviewStatus || finding.mechanicalOwnerReviewStatus === "clarification_requested").length;

  return <div className="mt-4 space-y-3">
    <div className={`rounded-xl px-4 py-3 text-sm font-bold ${pending ? "border border-amber-200 bg-amber-50 text-amber-900" : "border border-emerald-200 bg-emerald-50 text-emerald-900"}`}>
      {pending ? `${pending} finding${pending === 1 ? "" : "s"} still need Owner resolution before the inspection can be accepted.` : "All submitted findings have been reviewed. The inspection can now be accepted."}
    </div>
    {findings.map((finding) => {
      const accepted = finding.mechanicalOwnerReviewStatus === "accepted";
      const dismissed = finding.mechanicalOwnerReviewStatus === "dismissed";
      const clarification = finding.mechanicalOwnerReviewStatus === "clarification_requested";
      const needsDifferentPartner = finding.mechanicalCanPerform === false && finding.mechanicalValidationStatus !== "not_found";
      return <div key={finding.id} className={`rounded-xl border px-4 py-4 ${accepted ? "border-emerald-200 bg-emerald-50/40" : dismissed ? "border-slate-200 bg-slate-50" : clarification ? "border-amber-300 bg-amber-50/50" : "border-slate-200 bg-white"}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="font-black text-slate-900">{finding.title}</div>
            {finding.description ? <div className="mt-1 text-sm text-slate-600">{finding.description}</div> : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black uppercase text-slate-500">{finding.source}</span>
            <span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-black uppercase text-blue-700">{finding.mechanicalValidationStatus.replaceAll("_", " ")}</span>
            {needsDifferentPartner ? <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-black uppercase text-amber-800">Needs different partner</span> : null}
            {finding.mechanicalOwnerReviewStatus ? <span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase ${accepted ? "bg-emerald-100 text-emerald-700" : dismissed ? "bg-slate-200 text-slate-600" : "bg-amber-100 text-amber-800"}`}>{accepted ? "Owner accepted" : dismissed ? "Owner dismissed" : "Clarification requested"}</span> : null}
          </div>
        </div>

        {finding.mechanicalValidationNotes ? <div className="mt-2 text-sm font-semibold text-slate-500">Mechanic notes: {finding.mechanicalValidationNotes}</div> : null}
        {clarification && finding.mechanicalOwnerReviewNotes ? <div className="mt-3 rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm font-semibold text-amber-900"><span className="font-black">Question for inspector:</span> {finding.mechanicalOwnerReviewNotes}</div> : null}

        {(finding.mechanicalRecommendedAction || finding.mechanicalSuggestedParts.length || finding.mechanicalPartsRequired || finding.mechanicalLaborHours !== null || finding.mechanicalProposedLaborPrice !== null || finding.mechanicalCanPerform !== null) ? <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div><div className="text-[10px] font-black uppercase text-slate-400">Recommended action</div><div className="mt-1 font-semibold text-slate-800">{finding.mechanicalRecommendedAction || "—"}</div></div>
            <div><div className="text-[10px] font-black uppercase text-slate-400">Labor</div><div className="mt-1 font-semibold text-slate-800">{finding.mechanicalLaborHours === null ? "—" : `${finding.mechanicalLaborHours} hr`}</div></div>
            <div><div className="text-[10px] font-black uppercase text-slate-400">Proposed labor price</div><div className="mt-1 font-semibold text-slate-800">{money(finding.mechanicalProposedLaborPrice)}</div></div>
            <div><div className="text-[10px] font-black uppercase text-slate-400">Inspector can perform</div><div className={`mt-1 font-black ${needsDifferentPartner ? "text-amber-800" : "text-slate-800"}`}>{finding.mechanicalCanPerform === null ? "—" : finding.mechanicalCanPerform ? "Yes" : "No — assign another partner"}</div></div>
          </div>
          {finding.mechanicalSuggestedParts.length ? <div className="mt-3 border-t border-slate-200 pt-3"><div className="text-[10px] font-black uppercase text-slate-400">Suggested parts</div><div className="mt-2 space-y-1.5">{finding.mechanicalSuggestedParts.map((part, index) => <div key={`${part.description}-${index}`} className="rounded-lg border border-slate-200 bg-white px-3 py-2 font-semibold text-slate-700"><span className="font-black">{part.quantity}× {part.description}</span>{part.partNumber ? ` · Part # ${part.partNumber}` : ""}{part.notes ? ` · ${part.notes}` : ""}</div>)}</div></div> : finding.mechanicalPartsRequired ? <div className="mt-3 border-t border-slate-200 pt-3"><div className="text-[10px] font-black uppercase text-slate-400">Parts needed</div><div className="mt-1 font-semibold text-slate-800">{finding.mechanicalPartsRequired}</div></div> : null}
        </div> : null}

        {!accepted && !dismissed ? <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="flex-1 text-[10px] font-black uppercase text-slate-400">Owner note / question<input value={notes[finding.id] || ""} onChange={(event) => setNotes((current) => ({ ...current, [finding.id]: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold normal-case text-slate-800" placeholder="Optional for accept/dismiss; required when requesting clarification" /></label>
          <div className="flex flex-wrap gap-2">
            <button disabled={workingId === finding.id} onClick={() => void review(finding, "accept")} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-black text-white disabled:opacity-40">Accept Finding</button>
            <button disabled={workingId === finding.id || !(notes[finding.id] || "").trim()} onClick={() => void review(finding, "clarification")} className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-black text-amber-900 disabled:opacity-40">Request Clarification</button>
            <button disabled={workingId === finding.id} onClick={() => void review(finding, "dismiss")} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-black text-slate-700 disabled:opacity-40">Dismiss</button>
          </div>
        </div> : null}
      </div>;
    })}
    {message ? <div className="text-sm font-bold text-slate-700">{message}</div> : null}
  </div>;
}
