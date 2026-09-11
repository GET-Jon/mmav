"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import type {
  PartRequirementView,
  PartFulfillmentMethod,
} from "@/lib/mindful-inventory/part-requirements";
import { buildPartSearchSources } from "@/lib/mindful-inventory/part-suggestions";

// WORK_PLAN_PARTS_SETUP_V2: upstream inspection facts carry forward; only unresolved sourcing is asked again.

function money(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function priceRange(low: number | null, high: number | null) {
  if (low == null && high == null) return null;
  if (low != null && high != null) return low === high ? money(low) : `${money(low)}–${money(high)}`;
  return money(low ?? high);
}

function decisionLabel(method: PartFulfillmentMethod | null) {
  if (method === "partner_supplied") return "Partner supplies";
  if (method === "mindful_purchase") return "Mindful will source";
  if (method === "in_stock") return "In stock";
  if (method === "customer_supplied") return "Customer supplies";
  if (method === "not_required") return "Not required";
  return null;
}

function inheritedMethod(item: PartRequirementView): PartFulfillmentMethod | null {
  if (item.fulfillmentMethod) return item.fulfillmentMethod;
  const note = item.partnerOfferNote || "";
  if (/^IN STOCK\b/i.test(note)) return "in_stock";
  if (/^NOT NEEDED\b/i.test(note)) return "not_required";
  return null;
}

function cleanPartnerNote(note: string | null) {
  if (!note) return null;
  const cleaned = note
    .replace(/^(IN STOCK|NOT NEEDED)\s*·?\s*/i, "")
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

export function WorkPlanPartsReview({
  vehicleId,
  vehicleLabel,
  requirements,
}: {
  vehicleId: string;
  vehicleLabel: string;
  requirements: PartRequirementView[];
}) {
  const router = useRouter();
  const carriedForward = useRef(new Set<string>());
  const [working, setWorking] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [localDecisions, setLocalDecisions] = useState<Record<string, PartFulfillmentMethod | null>>(
    () => Object.fromEntries(requirements.map((item) => [item.id, inheritedMethod(item)])),
  );
  const [changing, setChanging] = useState<Record<string, boolean>>({});
  const [openSourcing, setOpenSourcing] = useState<Record<string, boolean>>({});

  const visibleRequirements = useMemo(() => requirements, [requirements]);
  const methodFor = (item: PartRequirementView) =>
    localDecisions[item.id] ?? inheritedMethod(item);

  const unresolvedItems = visibleRequirements.filter(
    (item) => item.requirementStatus !== "not_required" && !methodFor(item),
  );
  const resolvedItems = visibleRequirements.filter(
    (item) => item.requirementStatus === "not_required" || Boolean(methodFor(item)),
  );

  useEffect(() => {
    const inherited = requirements.filter(
      (item) =>
        !item.fulfillmentMethod &&
        (inheritedMethod(item) === "in_stock" || inheritedMethod(item) === "not_required") &&
        !carriedForward.current.has(item.id),
    );
    if (!inherited.length) return;

    let cancelled = false;
    async function persist() {
      let changed = false;
      for (const item of inherited) {
        if (cancelled) return;
        const method = inheritedMethod(item);
        if (!method) continue;
        carriedForward.current.add(item.id);
        try {
          const response = await fetch(
            `/api/mindful/inventory/vehicles/${vehicleId}/part-requirements`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "decision",
                requirementId: item.id,
                requirementStatus: method === "not_required" ? "not_required" : "required",
                fulfillmentMethod: method,
                sourcingOwner: null,
                ownerDecisionNote: "Carried forward from mechanical inspection.",
              }),
            },
          );
          if (response.ok) changed = true;
        } catch {
          // The inherited fact remains visible from inspection evidence; a manual change is still available.
        }
      }
      if (changed && !cancelled) router.refresh();
    }
    void persist();
    return () => {
      cancelled = true;
    };
  }, [requirements, router, vehicleId]);

  if (!requirements.length) return null;

  async function decide(item: PartRequirementView, fulfillmentMethod: PartFulfillmentMethod) {
    const previous = methodFor(item);
    setLocalDecisions((current) => ({ ...current, [item.id]: fulfillmentMethod }));
    setWorking(item.id);
    setMessage("");
    try {
      const response = await fetch(
        `/api/mindful/inventory/vehicles/${vehicleId}/part-requirements`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "decision",
            requirementId: item.id,
            requirementStatus: fulfillmentMethod === "not_required" ? "not_required" : "required",
            fulfillmentMethod,
            sourcingOwner:
              fulfillmentMethod === "partner_supplied"
                ? "partner"
                : fulfillmentMethod === "mindful_purchase"
                  ? "owner"
                  : null,
            ownerDecisionNote: notes[item.id] || "",
          }),
        },
      );
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Could not save the parts decision.");
      setChanging((current) => ({ ...current, [item.id]: false }));
      router.refresh();
    } catch (error) {
      setLocalDecisions((current) => ({ ...current, [item.id]: previous }));
      setMessage(error instanceof Error ? error.message : "Could not save the parts decision.");
    } finally {
      setWorking(null);
    }
  }

  function searchLinks(item: PartRequirementView) {
    return buildPartSearchSources(
      `${vehicleLabel} ${item.description}`.replace(/\s+/g, " ").trim(),
    );
  }

  function decisionButtons(item: PartRequirementView) {
    const method = methodFor(item);
    const buttonBase =
      "rounded-lg border px-3 py-2 text-xs font-black transition disabled:cursor-wait disabled:opacity-50";
    return (
      <div className="flex flex-wrap gap-2">
        <button
          disabled={working === item.id}
          onClick={() => void decide(item, "partner_supplied")}
          className={`${buttonBase} ${method === "partner_supplied" ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-200 bg-white text-slate-700"}`}
        >
          Partner supplies
        </button>
        <button
          disabled={working === item.id}
          onClick={() => void decide(item, "mindful_purchase")}
          className={`${buttonBase} ${method === "mindful_purchase" ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-200 bg-white text-slate-700"}`}
        >
          Mindful sources
        </button>
        <button
          disabled={working === item.id}
          onClick={() => void decide(item, "in_stock")}
          className={`${buttonBase} ${method === "in_stock" ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-200 bg-white text-slate-700"}`}
        >
          In stock
        </button>
        <button
          disabled={working === item.id}
          onClick={() => void decide(item, "not_required")}
          className={`${buttonBase} ${method === "not_required" || item.requirementStatus === "not_required" ? "border-slate-600 bg-slate-700 text-white" : "border-slate-200 bg-white text-slate-500"}`}
        >
          Not required
        </button>
      </div>
    );
  }

  function priceContext(item: PartRequirementView) {
    const aiRange = priceRange(item.aiEstimatedUnitPriceLow, item.aiEstimatedUnitPriceHigh);
    if (item.partnerOfferUnitPrice != null) return `${money(item.partnerOfferUnitPrice)} partner price`;
    if (aiRange) return `${aiRange} AI estimate`;
    return "Price not provided";
  }

  return (
    <section
      className={`rounded-2xl border p-5 shadow-sm ${
        unresolvedItems.length ? "border-amber-200 bg-amber-50/20" : "border-slate-200 bg-white"
      }`}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className={`text-xs font-black uppercase tracking-[0.1em] ${unresolvedItems.length ? "text-amber-700" : "text-emerald-700"}`}>
            Parts Setup
          </div>
          <h2 className="mt-1 text-xl font-black text-slate-950">
            {unresolvedItems.length ? "Resolve remaining sourcing choices" : "Known parts decisions carried forward"}
          </h2>
          <p className="mt-1 max-w-3xl text-sm font-medium leading-6 text-slate-600">
            Inspection decisions are preserved automatically. Lot Logic only asks when a required part still needs a sourcing owner.
          </p>
        </div>
        <div
          className={`rounded-xl px-3 py-2 text-xs font-black ${
            unresolvedItems.length
              ? "bg-amber-100 text-amber-900"
              : "bg-emerald-100 text-emerald-800"
          }`}
        >
          {unresolvedItems.length
            ? `${unresolvedItems.length} setup choice${unresolvedItems.length === 1 ? "" : "s"} remaining`
            : "Parts setup ready ✓"}
        </div>
      </div>

      {message ? (
        <div className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-red-700">
          {message}
        </div>
      ) : null}

      {unresolvedItems.length ? (
        <div className="mt-4 space-y-2.5">
          {unresolvedItems.map((item) => {
            const partNumber = displayPartNumber(item.partNumber);
            const partnerNote = cleanPartnerNote(item.partnerOfferNote);
            const sourcingOpen = Boolean(openSourcing[item.id]);
            const links = searchLinks(item);
            return (
              <article key={item.id} className="rounded-xl border border-amber-200 bg-white p-4">
                <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-black text-slate-950">{item.description}</h3>
                      <span className="text-xs font-bold text-slate-400">×{item.quantity}</span>
                      <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[9px] font-black uppercase text-amber-900">
                        Sourcing needed
                      </span>
                    </div>
                    <div className="mt-1 text-xs font-semibold text-slate-500">
                      For {item.workTitle}{partNumber ? ` · #${partNumber}` : ""} · {priceContext(item)}
                    </div>
                    {partnerNote ? (
                      <div className="mt-1 text-xs font-semibold text-slate-600">
                        <span className="font-black">Inspector note:</span> {partnerNote}
                      </div>
                    ) : null}
                  </div>
                  {decisionButtons(item)}
                </div>
                <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
                  <span className="text-xs font-semibold text-slate-500">
                    This part is required; only its sourcing path is unresolved.
                  </span>
                  <button
                    type="button"
                    onClick={() => setOpenSourcing((current) => ({ ...current, [item.id]: !sourcingOpen }))}
                    className="shrink-0 text-xs font-black text-slate-500 hover:text-slate-900"
                  >
                    {sourcingOpen ? "Hide sourcing references" : "Sourcing references"}
                  </button>
                </div>
                {sourcingOpen ? (
                  <div className="mt-3 flex flex-col gap-2 rounded-xl bg-slate-50 p-3 sm:flex-row sm:items-center">
                    <div className="flex flex-wrap gap-1.5">
                      {links.map((source) => (
                        <a
                          key={source.key}
                          href={source.url}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-lg bg-white px-2.5 py-1.5 text-[10px] font-black shadow-sm"
                        >
                          {source.key === "turn14" ? "Turn 14" : source.label} ↗
                        </a>
                      ))}
                    </div>
                    <input
                      value={notes[item.id] || ""}
                      onChange={(event) => setNotes((current) => ({ ...current, [item.id]: event.target.value }))}
                      placeholder="Optional sourcing note"
                      className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
                    />
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : null}

      {resolvedItems.length ? (
        <div className={unresolvedItems.length ? "mt-5" : "mt-4"}>
          <div className="mb-2 flex items-center justify-between">
            <div className="text-xs font-black uppercase tracking-[0.08em] text-slate-400">
              Already determined
            </div>
            <div className="text-xs font-bold text-slate-400">{resolvedItems.length}</div>
          </div>
          <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
            {resolvedItems.map((item) => {
              const method = methodFor(item);
              const inherited = !item.fulfillmentMethod && Boolean(inheritedMethod(item));
              const isChanging = Boolean(changing[item.id]);
              return (
                <div key={item.id} className="px-4 py-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-black text-emerald-600">✓</span>
                        <span className="font-black text-slate-900">{item.description}</span>
                        <span className="text-xs font-semibold text-slate-400">×{item.quantity}</span>
                      </div>
                      <div className="mt-0.5 text-xs font-semibold text-slate-500">
                        {decisionLabel(method) || "Addressed"} · For {item.workTitle} · {priceContext(item)}
                        {inherited ? " · carried from inspection" : ""}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setChanging((current) => ({ ...current, [item.id]: !isChanging }))}
                      className="self-start text-xs font-black text-slate-500 hover:text-slate-900 sm:self-auto"
                    >
                      {isChanging ? "Cancel" : "Change"}
                    </button>
                  </div>
                  {isChanging ? (
                    <div className="mt-3 flex justify-end border-t border-slate-100 pt-3">
                      {decisionButtons(item)}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}
