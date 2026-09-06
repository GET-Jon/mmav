"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import type { PartRequirementView, PartFulfillmentMethod } from "@/lib/mindful-inventory/part-requirements";
import { buildPartSearchSources } from "@/lib/mindful-inventory/part-suggestions";

function money(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
}

function decisionLabel(method: PartFulfillmentMethod | null) {
  if (method === "partner_supplied") return "Partner supplies";
  if (method === "mindful_purchase") return "I'll source";
  if (method === "in_stock") return "In stock";
  if (method === "not_required") return "Not required";
  return null;
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

  return <section className={`rounded-2xl border p-5 shadow-sm ${unresolved ? "border-amber-200 bg-amber-50/30" : "border-emerald-200 bg-white"}`}>
    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
      <div>
        <div className={`text-xs font-black uppercase tracking-[0.1em] ${unresolved ? "text-amber-700" : "text-emerald-700"}`}>Parts Confirmation</div>
        <h2 className="mt-1 text-xl font-black text-slate-950">Confirm how each required part will be handled</h2>
        <p className="mt-1 max-w-3xl text-sm font-medium leading-6 text-slate-600">Mechanical decisions carry forward automatically. Only unresolved sourcing choices need your attention here.</p>
      </div>
      <div className={`rounded-xl px-3 py-2 text-xs font-black ${unresolved ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-800"}`}>{unresolved ? `${unresolved} decision${unresolved === 1 ? "" : "s"} needed` : "Parts confirmed ✓"}</div>
    </div>
    {message ? <div className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{message}</div> : null}
    <div className="mt-4 space-y-2">{requirements.map((item) => {
      const links = searchLinks(item);
      const resolved = item.requirementStatus === "not_required" || Boolean(item.fulfillmentMethod);
      const selected = decisionLabel(item.fulfillmentMethod);
      const buttonBase = "cursor-pointer rounded-lg border px-3 py-2 text-xs font-black transition hover:-translate-y-px hover:shadow-sm disabled:cursor-wait disabled:opacity-50";
      return <div key={item.id} className={`rounded-xl border p-4 ${resolved ? "border-emerald-100 bg-white" : "border-amber-200 bg-amber-50/40"}`}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <div className="font-black text-slate-950">{item.description} <span className="text-xs font-bold text-slate-400">×{item.quantity}</span></div>
              {selected ? <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.06em] text-emerald-800">{selected} ✓</span> : <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.06em] text-amber-900">Decision needed</span>}
            </div>
            <div className="mt-1 text-xs font-semibold text-slate-500">For: {item.workTitle}{item.partNumber ? ` · ${item.partNumber}` : ""}</div>
            {item.partnerOfferUnitPrice != null || item.partnerOfferNote ? <div className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700"><span className="font-black">{item.suggestedByPartnerName || "Mechanic"}:</span>{item.partnerOfferUnitPrice != null ? ` I can get it for about ${money(item.partnerOfferUnitPrice)}.` : ""}{item.partnerOfferNote ? ` ${item.partnerOfferNote}` : ""}</div> : null}
          </div>
          <div className="flex flex-wrap gap-2 lg:max-w-[560px] lg:justify-end">
            {(item.suggestedByPartnerId || item.partnerOfferUnitPrice != null) ? <button title="Have the partner provide this part" disabled={working === item.id} onClick={() => void decide(item, "partner_supplied")} className={`${buttonBase} ${item.fulfillmentMethod === "partner_supplied" ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"}`}>{item.fulfillmentMethod === "partner_supplied" ? "✓ Partner supplies" : item.partnerOfferUnitPrice != null ? `Partner supplies · ${money(item.partnerOfferUnitPrice)}` : "Partner supplies"}</button> : null}
            <button title="Mindful will source this part" disabled={working === item.id} onClick={() => void decide(item, "mindful_purchase")} className={`${buttonBase} ${item.fulfillmentMethod === "mindful_purchase" ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"}`}>{item.fulfillmentMethod === "mindful_purchase" ? "✓ I'll source" : "I'll source"}</button>
            <button title="This part is already in stock" disabled={working === item.id} onClick={() => void decide(item, "in_stock")} className={`${buttonBase} ${item.fulfillmentMethod === "in_stock" ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"}`}>{item.fulfillmentMethod === "in_stock" ? "✓ In stock" : "In stock"}</button>
            <button title="This part is not needed for the approved work" disabled={working === item.id} onClick={() => void decide(item, "not_required")} className={`${buttonBase} ${item.fulfillmentMethod === "not_required" || item.requirementStatus === "not_required" ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"}`}>{item.fulfillmentMethod === "not_required" || item.requirementStatus === "not_required" ? "✓ Not required" : "Not required"}</button>
          </div>
        </div>
        {item.fulfillmentMethod === "mindful_purchase" || !item.fulfillmentMethod ? <div className="mt-3 flex flex-col gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:items-center">
          <div className="flex flex-wrap gap-1.5">{links.map((source) => <a key={source.key} href={source.url} target="_blank" rel="noreferrer" className="cursor-pointer rounded-lg bg-slate-100 px-2.5 py-1.5 text-[10px] font-black transition hover:bg-slate-200">{source.key === "turn14" ? "Turn 14" : source.label} ↗</a>)}</div>
          <input value={notes[item.id] || ""} onChange={(e) => setNotes((current) => ({ ...current, [item.id]: e.target.value }))} placeholder="Optional sourcing note" className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-xs" />
        </div> : null}
      </div>;
    })}</div>
  </section>;
}
