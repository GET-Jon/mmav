"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import type { PartRequirementView, PartFulfillmentMethod } from "@/lib/mindful-inventory/part-requirements";
import { buildPartSearchSources } from "@/lib/mindful-inventory/part-suggestions";

function money(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
}

function priceRange(low: number | null, high: number | null) {
  if (low == null && high == null) return null;
  if (low != null && high != null) return low === high ? money(low) : `${money(low)}–${money(high)}`;
  return money(low ?? high);
}

function decisionLabel(method: PartFulfillmentMethod | null) {
  if (method === "partner_supplied") return "Partner supplies";
  if (method === "mindful_purchase") return "I'll source";
  if (method === "in_stock") return "In stock";
  if (method === "not_required") return "Not required";
  return null;
}

function cleanPartnerNote(note: string | null) {
  if (!note) return null;
  const cleaned = note
    .replace(/\s*Lot Logic search:\s*.*$/i, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || null;
}

function displayPartNumber(value: string | null) {
  if (!value || /^https?:\/\//i.test(value)) return null;
  return value;
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
  const [localDecisions, setLocalDecisions] = useState<Record<string, PartFulfillmentMethod | null>>(() =>
    Object.fromEntries(requirements.map((item) => [item.id, item.fulfillmentMethod])),
  );
  const [openSourcing, setOpenSourcing] = useState<Record<string, boolean>>({});

  const visibleRequirements = useMemo(() => requirements, [requirements]);
  if (!requirements.length) return null;

  const methodFor = (item: PartRequirementView) => localDecisions[item.id] ?? item.fulfillmentMethod;
  const unresolved = visibleRequirements.filter((item) => item.requirementStatus !== "not_required" && !methodFor(item)).length;

  async function decide(item: PartRequirementView, fulfillmentMethod: PartFulfillmentMethod) {
    const previous = methodFor(item);
    setLocalDecisions((current) => ({ ...current, [item.id]: fulfillmentMethod }));
    setWorking(item.id);
    setMessage("");
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
      setLocalDecisions((current) => ({ ...current, [item.id]: previous }));
      setMessage(error instanceof Error ? error.message : "Could not save the parts decision.");
    } finally {
      setWorking(null);
    }
  }

  function searchLinks(item: PartRequirementView) {
    return buildPartSearchSources(`${vehicleLabel} ${item.description}`.replace(/\s+/g, " ").trim());
  }

  return <section className={`rounded-2xl border p-5 shadow-sm ${unresolved ? "border-amber-200 bg-amber-50/20" : "border-emerald-200 bg-white"}`}>
    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
      <div>
        <div className={`text-xs font-black uppercase tracking-[0.1em] ${unresolved ? "text-amber-700" : "text-emerald-700"}`}>Parts confirmation</div>
        <h2 className="mt-1 text-xl font-black text-slate-950">Decide how each part will be handled</h2>
        <p className="mt-1 max-w-3xl text-sm font-medium leading-6 text-slate-600">Choose one disposition for each part. Pricing is supporting context; sourcing and ordering continue in Active Work.</p>
      </div>
      <div className={`rounded-xl px-3 py-2 text-xs font-black ${unresolved ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-800"}`}>{unresolved ? `${unresolved} decision${unresolved === 1 ? "" : "s"} remaining` : "All parts addressed ✓"}</div>
    </div>

    {message ? <div className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{message}</div> : null}

    <div className="mt-4 space-y-3">{visibleRequirements.map((item) => {
      const links = searchLinks(item);
      const method = methodFor(item);
      const resolved = item.requirementStatus === "not_required" || Boolean(method);
      const selected = decisionLabel(method);
      const aiRange = priceRange(item.aiEstimatedUnitPriceLow, item.aiEstimatedUnitPriceHigh);
      const partnerNote = cleanPartnerNote(item.partnerOfferNote);
      const partNumber = displayPartNumber(item.partNumber);
      const primaryPrice = item.partnerOfferUnitPrice != null ? money(item.partnerOfferUnitPrice) : aiRange;
      const primaryPriceLabel = item.partnerOfferUnitPrice != null ? "Inspector / partner price" : aiRange ? "AI estimate" : "Price not provided";
      const sourcingOpen = Boolean(openSourcing[item.id]);
      const buttonBase = "cursor-pointer rounded-lg border px-3 py-2 text-xs font-black transition disabled:cursor-wait disabled:opacity-50";

      return <article key={item.id} className={`rounded-2xl border p-4 transition-colors ${resolved ? "border-emerald-200 bg-emerald-50/20" : "border-amber-200 bg-white"}`}>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_190px] lg:items-start">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-black leading-6 text-slate-950">{item.description}</h3>
              <span className="text-xs font-bold text-slate-400">×{item.quantity}</span>
              {resolved ? (
                <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.06em] text-emerald-800">✓ {selected || "Addressed"}</span>
              ) : (
                <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.06em] text-amber-900">Decision needed</span>
              )}
            </div>
            <div className="mt-1 text-xs font-semibold text-slate-500">For {item.workTitle}{partNumber ? ` · Part # ${partNumber}` : ""}</div>

            {partnerNote ? <div className="mt-3 text-xs font-semibold leading-5 text-slate-600"><span className="font-black text-slate-700">Inspector note:</span> {partnerNote}</div> : null}
          </div>

          <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5 lg:text-right">
            <div className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-400">Expected part cost</div>
            <div className={`mt-0.5 text-lg font-black ${item.partnerOfferUnitPrice != null ? "text-emerald-700" : "text-slate-900"}`}>{primaryPrice || "—"}</div>
            <div className="mt-0.5 text-[10px] font-bold text-slate-400">{primaryPriceLabel}</div>
            {item.partnerOfferUnitPrice != null && aiRange ? <div className="mt-1 text-[10px] font-semibold text-blue-700">AI baseline {aiRange}</div> : null}
          </div>
        </div>

        <div className="mt-4 border-t border-slate-100 pt-3">
          <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-400">How will this part be handled?</div>
              <div className="mt-1 text-xs font-semibold text-slate-500">Choose one. You can change the decision later.</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button title={item.partnerOfferUnitPrice != null ? `Have the partner provide this part at the current offer of ${money(item.partnerOfferUnitPrice)}` : "Have the partner provide this part; price can be confirmed later in Active Work"} disabled={working === item.id} onClick={() => void decide(item, "partner_supplied")} className={`${buttonBase} ${method === "partner_supplied" ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"}`}>Partner supplies</button>
              <button title="Mindful will source this part" disabled={working === item.id} onClick={() => void decide(item, "mindful_purchase")} className={`${buttonBase} ${method === "mindful_purchase" ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"}`}>I'll source</button>
              <button title="This part is already in stock" disabled={working === item.id} onClick={() => void decide(item, "in_stock")} className={`${buttonBase} ${method === "in_stock" ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"}`}>In stock</button>
              <button title="This part is not needed for the approved work" disabled={working === item.id} onClick={() => void decide(item, "not_required")} className={`${buttonBase} ${method === "not_required" || item.requirementStatus === "not_required" ? "border-slate-600 bg-slate-700 text-white" : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:bg-slate-50"}`}>Not required</button>
            </div>
          </div>
        </div>

        <div className="mt-3 min-h-[40px] border-t border-slate-100 pt-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs font-semibold text-slate-500">
              {method === "mindful_purchase" ? "You’ll source this in Active Work." : method === "partner_supplied" ? item.partnerOfferUnitPrice != null ? `Partner will supply this part at the current ${money(item.partnerOfferUnitPrice)} offer.` : "Partner will supply this part; price will be confirmed in Active Work." : method === "in_stock" ? "Marked as already available." : method === "not_required" || item.requirementStatus === "not_required" ? "Excluded from the approved parts requirement." : "Sourcing details are optional until you choose a disposition."}
            </div>
            <button type="button" onClick={() => setOpenSourcing((current) => ({ ...current, [item.id]: !current[item.id] }))} className="shrink-0 cursor-pointer text-xs font-black text-slate-500 hover:text-slate-900">{sourcingOpen ? "Hide sourcing references" : "Sourcing references"}</button>
          </div>

          {sourcingOpen ? <div className="mt-3 flex flex-col gap-2 rounded-xl bg-slate-50 p-3 sm:flex-row sm:items-center">
            <div className="flex flex-wrap gap-1.5">{links.map((source) => <a key={source.key} href={source.url} target="_blank" rel="noreferrer" className="cursor-pointer rounded-lg bg-white px-2.5 py-1.5 text-[10px] font-black shadow-sm transition hover:bg-slate-100">{source.key === "turn14" ? "Turn 14" : source.label} ↗</a>)}</div>
            <input value={notes[item.id] || ""} onChange={(e) => setNotes((current) => ({ ...current, [item.id]: e.target.value }))} placeholder="Optional sourcing note" className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs" />
          </div> : null}
        </div>
      </article>;
    })}</div>
  </section>;
}
