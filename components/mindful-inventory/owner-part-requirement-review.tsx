"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import type { PartRequirementView } from "@/lib/mindful-inventory/part-requirements";

function money(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

export function OwnerPartRequirementReview({ vehicleId, requirement }: { vehicleId: string; requirement: PartRequirementView }) {
  const router = useRouter();
  const [working, setWorking] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [question, setQuestion] = useState("");
  const [error, setError] = useState<string | null>(null);

  const partner = requirement.suggestedByPartnerName || "Partner";
  const price = requirement.partnerOfferUnitPrice;

  async function decide(kind: "approve_partner" | "owner_source" | "not_required") {
    setWorking(kind);
    setError(null);
    try {
      const body = kind === "approve_partner"
        ? {
            action: "decision",
            requirementId: requirement.id,
            requirementStatus: "required",
            fulfillmentMethod: "partner_supplied",
            sourcingOwner: "partner",
            ownerTargetUnitPriceLow: price,
            ownerTargetUnitPriceHigh: price,
            ownerDecisionNote: price != null ? `Approved ${partner} to supply this part for ${money(price)}.` : `Approved ${partner} to supply this part.`,
          }
        : kind === "owner_source"
          ? {
              action: "decision",
              requirementId: requirement.id,
              requirementStatus: "required",
              fulfillmentMethod: "mindful_purchase",
              sourcingOwner: "owner",
              ownerDecisionNote: "Mindful will source this part.",
            }
          : {
              action: "decision",
              requirementId: requirement.id,
              requirementStatus: "not_required",
              fulfillmentMethod: "not_required",
              ownerDecisionNote: "Owner determined this part is not required.",
            };

      const response = await fetch(`/api/mindful/inventory/vehicles/${vehicleId}/part-requirements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not save the parts decision.");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the parts decision.");
    } finally {
      setWorking(null);
    }
  }

  async function askPartner() {
    const body = question.trim();
    if (!body) return;
    setWorking("ask");
    setError(null);
    try {
      const response = await fetch(`/api/mindful/inventory/vehicles/${vehicleId}/part-requirements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "message", requirementId: requirement.id, messageType: "note", message: body }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not send the question.");
      setQuestion("");
      setAsking(false);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not send the question.");
    } finally {
      setWorking(null);
    }
  }

  return <div className="rounded-xl border border-amber-300 bg-amber-50 p-3">
    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0">
        <div className="text-[9px] font-black uppercase tracking-[0.12em] text-amber-800">Partner part proposal · Owner decision</div>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <div className="text-sm font-black text-slate-950">{requirement.description} ×{requirement.quantity}</div>
          {price != null ? <div className="text-lg font-black text-slate-950">{money(price)}</div> : null}
        </div>
        <div className="mt-1 text-xs font-semibold text-slate-600">Suggested by {partner}{requirement.partNumber ? ` · Part # ${requirement.partNumber}` : ""}</div>
        {requirement.partnerOfferNote ? <div className="mt-2 rounded-lg bg-white/80 px-3 py-2 text-xs text-slate-700"><span className="font-black">{partner}:</span> {requirement.partnerOfferNote}</div> : null}
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        <button type="button" disabled={Boolean(working)} onClick={() => void decide("approve_partner")} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-black text-white disabled:opacity-50">{price != null ? `Approve ${money(price)}` : "Approve Partner Supply"}</button>
        <button type="button" disabled={Boolean(working)} onClick={() => void decide("owner_source")} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-black text-slate-800 disabled:opacity-50">Source ourselves</button>
        <button type="button" disabled={Boolean(working)} onClick={() => void decide("not_required")} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-black text-slate-700 disabled:opacity-50">Not required</button>
        <button type="button" disabled={Boolean(working)} onClick={() => setAsking((value) => !value)} className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-black text-amber-900 disabled:opacity-50">Ask {partner}</button>
      </div>
    </div>

    {asking ? <div className="mt-3 flex flex-col gap-2 border-t border-amber-200 pt-3 sm:flex-row"><input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder={`Question for ${partner}…`} className="min-w-0 flex-1 rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs" /><button type="button" disabled={working === "ask" || !question.trim()} onClick={() => void askPartner()} className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-black text-white disabled:opacity-40">Send question</button></div> : null}
    {error ? <div className="mt-2 text-xs font-bold text-red-700">{error}</div> : null}
  </div>;
}
