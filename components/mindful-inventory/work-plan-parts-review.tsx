"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import type { PartRequirementView, PartFulfillmentMethod } from "@/lib/mindful-inventory/part-requirements";
import { buildPartSearchSources } from "@/lib/mindful-inventory/part-suggestions";

function money(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
}

export function WorkPlanPartsReview({ vehicleId, vehicleLabel, requirements }: {
  vehicleId: string;
  vehicleLabel: string;
  requirements: PartRequirementView[];
}) {
  const router = useRouter();
  const [working, setWorking] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});

  if (!requirements.length) return null;
  const unresolved = requirements.filter((item) => item.requirementStatus !== "not_required" && !item.fulfillmentMethod).length;

  async function decide(item: PartRequirementView, fulfillmentMethod: PartFulfillmentMethod) {
    setWorking(item.id); setMessage("");
    try {
      const response = await fetch(`/api/mindful/inventory/vehicles/${vehicleId}/part-requirements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "decision",
          requirementId: item.id,
          requirementStatus: fulfillmentMethod === "not_required" ? "not_required" : "required",
          fulfillmentMethod,
          sourcingOwner: fulfillmentMethod === "partner_supplied" ? "partner" : fulfillmentMethod === "mindful_purchase" ? "owner" : null,
          ownerDecisionNote: notes[item.id] || "",
        }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Could not save the parts decision.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save the parts decision.");
    } finally { setWorking(null); }
  }

  function searchLinks(item: PartRequirementView) {
    return buildPartSearchSources(`${vehicleLabel} ${item.description}`.replace(/\s+/g, " ").trim());
  }

  return <section className="rounded-2xl border border-blue-200 bg-blue-50/30 p-5 shadow-sm">
    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
      <div>
        <div className="text-xs font-black uppercase tracking-[0.1em] text-blue-600">Parts conversation</div>
        <h2 className="mt-1 text-xl font-black text-slate-950">Decide the sourcing direction — not every ordering detail</h2>
        <p className="mt-1 max-w-3xl text-sm font-medium leading-6 text-slate-600">These suggestions came from the mechanic's reviewed scope. You can let the partner supply a part, source it yourself, use stock, or leave the decision open. An open sourcing decision is a soft blocker and does not prevent approving the Work Plan.</p>
      </div>
      <div className={`rounded-xl px-3 py-2 text-xs font-black ${unresolved ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-800"}`}>{unresolved ? `${unresolved} sourcing decision${unresolved === 1 ? "" : "s"} open` : "Parts direction set"}</div>
    </div>
    {message ? <div className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{message}</div> : null}
    <div className="mt-4 space-y-2">{requirements.map((item) => {
      const links = searchLinks(item);
      return <div key={item.id} className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="font-black text-slate-950">{item.description} <span className="text-xs font-bold text-slate-400">×{item.quantity}</span></div>
            <div className="mt-1 text-xs font-semibold text-slate-500">For: {item.workTitle}{item.partNumber ? ` · ${item.partNumber}` : ""}</div>
            {item.partnerOfferUnitPrice != null || item.partnerOfferNote ? <div className="mt-2 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-950"><span className="font-black">{item.suggestedByPartnerName || "Mechanic"}:</span>{item.partnerOfferUnitPrice != null ? ` I can get it for about ${money(item.partnerOfferUnitPrice)}.` : ""}{item.partnerOfferNote ? ` ${item.partnerOfferNote}` : ""}</div> : null}
          </div>
          <div className="flex flex-wrap gap-2 lg:max-w-[560px] lg:justify-end">
            {(item.suggestedByPartnerId || item.partnerOfferUnitPrice != null) ? <button disabled={working === item.id} onClick={() => void decide(item, "partner_supplied")} className={`rounded-lg border px-3 py-2 text-xs font-black ${item.fulfillmentMethod === "partner_supplied" ? "border-violet-700 bg-violet-700 text-white" : "border-slate-200"}`}>{item.partnerOfferUnitPrice != null ? `Partner supplies · ${money(item.partnerOfferUnitPrice)}` : "Partner supplies"}</button> : null}
            <button disabled={working === item.id} onClick={() => void decide(item, "mindful_purchase")} className={`rounded-lg border px-3 py-2 text-xs font-black ${item.fulfillmentMethod === "mindful_purchase" ? "border-blue-700 bg-blue-700 text-white" : "border-slate-200"}`}>I'll source</button>
            <button disabled={working === item.id} onClick={() => void decide(item, "in_stock")} className={`rounded-lg border px-3 py-2 text-xs font-black ${item.fulfillmentMethod === "in_stock" ? "border-emerald-700 bg-emerald-700 text-white" : "border-slate-200"}`}>In stock</button>
            <button disabled={working === item.id} onClick={() => void decide(item, "not_required")} className={`rounded-lg border px-3 py-2 text-xs font-black ${item.fulfillmentMethod === "not_required" ? "border-slate-700 bg-slate-700 text-white" : "border-slate-200 text-slate-500"}`}>Not required</button>
          </div>
        </div>
        {item.fulfillmentMethod === "mindful_purchase" || !item.fulfillmentMethod ? <div className="mt-3 flex flex-col gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:items-center">
          <div className="flex flex-wrap gap-1.5">{links.map((source) => source.key === "turn14" ? <a key={source.key} href={source.url} target="_blank" rel="noreferrer" className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-[10px] font-black">Turn 14 ↗</a> : <a key={source.key} href={source.url} target="_blank" rel="noreferrer" className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-[10px] font-black">{source.label} ↗</a>)}</div>
          <input value={notes[item.id] || ""} onChange={(e) => setNotes((current) => ({ ...current, [item.id]: e.target.value }))} placeholder="Optional sourcing note — e.g. I'll look for $10–15 before using the partner's $20 option." className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-xs" />
        </div> : null}
      </div>;
    })}</div>
  </section>;
}
