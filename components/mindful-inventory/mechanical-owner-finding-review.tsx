"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import type { InventoryFindingView } from "@/lib/mindful-inventory/intake-inspection";

export function MechanicalOwnerFindingReview({ vehicleId, findings }: { vehicleId: string; findings: InventoryFindingView[] }) {
  const router = useRouter();
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>(() => Object.fromEntries(findings.map((finding) => [finding.id, finding.mechanicalOwnerReviewNotes || ""])));
  const [message, setMessage] = useState("");

  async function review(finding: InventoryFindingView, decision: "accept" | "dismiss") {
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
      setMessage(decision === "accept" ? `${finding.title} accepted.` : `${finding.title} dismissed from the mechanical scope.`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Finding review could not be saved.");
    } finally {
      setWorkingId(null);
    }
  }

  const pending = findings.filter((finding) => !finding.mechanicalOwnerReviewStatus).length;

  return <div className="mt-4 space-y-3">
    <div className={`rounded-xl px-4 py-3 text-sm font-bold ${pending ? "border border-amber-200 bg-amber-50 text-amber-900" : "border border-emerald-200 bg-emerald-50 text-emerald-900"}`}>
      {pending ? `${pending} finding${pending === 1 ? "" : "s"} still need Owner validation before the inspection can be accepted.` : "All submitted findings have been reviewed. The inspection can now be accepted."}
    </div>
    {findings.map((finding) => {
      const accepted = finding.mechanicalOwnerReviewStatus === "accepted";
      const dismissed = finding.mechanicalOwnerReviewStatus === "dismissed";
      return <div key={finding.id} className={`rounded-xl border px-4 py-4 ${accepted ? "border-emerald-200 bg-emerald-50/40" : dismissed ? "border-slate-200 bg-slate-50" : "border-slate-200 bg-white"}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><div className="font-black text-slate-900">{finding.title}</div>{finding.description ? <div className="mt-1 text-sm text-slate-600">{finding.description}</div> : null}</div>
          <div className="flex flex-wrap gap-2"><span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black uppercase text-slate-500">{finding.source}</span><span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-black uppercase text-blue-700">{finding.mechanicalValidationStatus.replaceAll("_", " ")}</span>{finding.mechanicalOwnerReviewStatus ? <span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase ${accepted ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>Owner {finding.mechanicalOwnerReviewStatus}</span> : null}</div>
        </div>
        {finding.mechanicalValidationNotes ? <div className="mt-2 text-sm font-semibold text-slate-500">Mechanic notes: {finding.mechanicalValidationNotes}</div> : null}
        {(finding.mechanicalRecommendedAction || finding.mechanicalPartsRequired || finding.mechanicalLaborHours !== null || finding.mechanicalCanPerform !== null) ? <div className="mt-3 grid gap-2 rounded-xl bg-slate-50 p-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div><div className="text-[10px] font-black uppercase text-slate-400">Recommended action</div><div className="mt-1 font-semibold text-slate-800">{finding.mechanicalRecommendedAction || "—"}</div></div>
          <div><div className="text-[10px] font-black uppercase text-slate-400">Parts needed</div><div className="mt-1 font-semibold text-slate-800">{finding.mechanicalPartsRequired || "—"}</div></div>
          <div><div className="text-[10px] font-black uppercase text-slate-400">Labor</div><div className="mt-1 font-semibold text-slate-800">{finding.mechanicalLaborHours === null ? "—" : `${finding.mechanicalLaborHours} hr`}</div></div>
          <div><div className="text-[10px] font-black uppercase text-slate-400">Inspector can perform</div><div className="mt-1 font-semibold text-slate-800">{finding.mechanicalCanPerform === null ? "—" : finding.mechanicalCanPerform ? "Yes" : "No"}</div></div>
        </div> : null}
        {!finding.mechanicalOwnerReviewStatus ? <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end"><label className="flex-1 text-[10px] font-black uppercase text-slate-400">Owner note (optional)<input value={notes[finding.id] || ""} onChange={(event) => setNotes((current) => ({ ...current, [finding.id]: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold normal-case text-slate-800" placeholder="Reason, clarification, or Work Plan note" /></label><div className="flex gap-2"><button disabled={workingId === finding.id} onClick={() => void review(finding, "accept")} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-black text-white disabled:opacity-40">Accept Finding</button><button disabled={workingId === finding.id} onClick={() => void review(finding, "dismiss")} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-black text-slate-700 disabled:opacity-40">Dismiss</button></div></div> : null}
      </div>;
    })}
    {message ? <div className="text-sm font-bold text-slate-700">{message}</div> : null}
  </div>;
}
