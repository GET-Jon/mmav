import type { InventoryUpgradeView } from "@/lib/mindful-inventory/overview-intake";

function money(value: number | null) {
  if (value === null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function statusLabel(value: InventoryUpgradeView["mechanicalValidationStatus"]) {
  if (value === "feasible") return "Good to proceed";
  if (value === "feasible_with_changes") return "Change recommended";
  if (value === "not_recommended") return "Not recommended";
  if (value === "needs_info") return "Needs more info";
  return "Pending review";
}

function statusTone(value: InventoryUpgradeView["mechanicalValidationStatus"]) {
  if (value === "feasible") return "bg-emerald-100 text-emerald-800";
  if (value === "feasible_with_changes") return "bg-blue-100 text-blue-800";
  if (value === "not_recommended") return "bg-slate-200 text-slate-700";
  if (value === "needs_info") return "bg-amber-100 text-amber-800";
  return "bg-violet-100 text-violet-700";
}

function upgradePartStatus(part: InventoryUpgradeView["mechanicalPartSuggestions"][number]) {
  const notes = part.notes || "";
  if (notes.startsWith("IN STOCK ·")) {
    return {
      label: "In stock ✓",
      tone: "border-emerald-200 bg-emerald-50 text-emerald-800",
      disposition: "in_stock" as const,
    };
  }
  if (notes.startsWith("NOT NEEDED ·")) {
    return {
      label: "Not needed",
      tone: "border-slate-200 bg-slate-100 text-slate-600",
      disposition: "not_needed" as const,
    };
  }
  return {
    label: "Purchase required",
    tone: "border-amber-200 bg-amber-50 text-amber-800",
    disposition: "purchase_required" as const,
  };
}

function upgradePartUrl(part: InventoryUpgradeView["mechanicalPartSuggestions"][number]) {
  const partNumber = part.partNumber?.trim() || "";
  if (/^https?:\/\//i.test(partNumber)) return partNumber;
  const match = (part.notes || "").match(/https?:\/\/[^\s]+/i);
  return match?.[0] || null;
}

function upgradePartNote(part: InventoryUpgradeView["mechanicalPartSuggestions"][number]) {
  let note = (part.notes || "").replace(/^(IN STOCK|NOT NEEDED) · /, "").trim();
  note = note.replace(/https?:\/\/[^\s]+/gi, "").trim();
  if (/^Lot Logic search:/i.test(note)) return null;
  return note || null;
}

function upgradePartPrice(part: InventoryUpgradeView["mechanicalPartSuggestions"][number]) {
  if (part.partnerOfferUnitPrice !== null) {
    return {
      low: part.partnerOfferUnitPrice,
      high: part.partnerOfferUnitPrice,
      value: money(part.partnerOfferUnitPrice),
      label: "Inspector price",
      tone: "text-emerald-700",
    };
  }
  if (part.aiEstimatedUnitPriceLow !== null || part.aiEstimatedUnitPriceHigh !== null) {
    const low = part.aiEstimatedUnitPriceLow ?? part.aiEstimatedUnitPriceHigh;
    const high = part.aiEstimatedUnitPriceHigh ?? part.aiEstimatedUnitPriceLow;
    return {
      low,
      high,
      value:
        low !== null && high !== null
          ? low === high
            ? money(low)
            : `${money(low)}–${money(high)}`
          : money(low ?? high),
      label: "AI estimate",
      tone: "text-blue-700",
    };
  }
  return null;
}

function upgradePartsSummary(upgrade: InventoryUpgradeView) {
  let low = 0;
  let high = 0;
  let purchaseCount = 0;
  let unknownCount = 0;

  for (const part of upgrade.mechanicalPartSuggestions) {
    const status = upgradePartStatus(part);
    if (status.disposition !== "purchase_required") continue;
    purchaseCount += 1;
    const price = upgradePartPrice(part);
    if (!price || price.low === null || price.high === null) {
      unknownCount += 1;
      continue;
    }
    low += price.low * part.quantity;
    high += price.high * part.quantity;
  }

  if (!purchaseCount) return "No new parts spend";
  if (unknownCount) return "Parts pricing incomplete";
  return Math.abs(high - low) > 0.009
    ? `${money(low)}–${money(high)} parts`
    : `${money(high)} parts`;
}

export function MechanicalOwnerUpgradeReview({ upgrades }: { upgrades: InventoryUpgradeView[] }) {
  const reviewed = upgrades.filter(
    (upgrade) =>
      upgrade.status === "proposed" && upgrade.mechanicalValidationStatus !== "pending",
  );
  const pending = upgrades.filter(
    (upgrade) =>
      upgrade.status === "proposed" && upgrade.mechanicalValidationStatus === "pending",
  );

  if (!reviewed.length && !pending.length) return null;

  return (
    <div className="mt-2 space-y-2" data-owner-upgrade-review="resolved-row-v1">
      {/* Resolved upgrade row: upgrades remain distinct in the data model while sharing the Owner-review presentation. */}
      {reviewed.map((upgrade) => {
        const needsDifferentPartner =
          upgrade.mechanicalCanPerform === false &&
          upgrade.mechanicalValidationStatus !== "not_recommended";
        const partsSummary = upgradePartsSummary(upgrade);

        return (
          <details
            key={upgrade.id}
            className="group rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3"
          >
            <summary className="flex cursor-pointer list-none flex-col gap-2 sm:flex-row sm:items-center sm:justify-between [&::-webkit-details-marker]:hidden">
              <div className="flex min-w-0 items-start gap-2">
                <span className="mt-0.5 font-black text-emerald-600">✓</span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="font-black text-slate-900">{upgrade.title}</div>
                    <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.06em] text-violet-700">
                      Upgrade
                    </span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-x-1 text-xs font-semibold text-slate-500">
                    <span>{statusLabel(upgrade.mechanicalValidationStatus)}</span>
                    {upgrade.mechanicalLaborHours !== null ? (
                      <><span>·</span><span>{upgrade.mechanicalLaborHours} hr labor</span></>
                    ) : null}
                    {upgrade.mechanicalProposedLaborPrice !== null ? (
                      <><span>·</span><span>{money(upgrade.mechanicalProposedLaborPrice)} labor</span></>
                    ) : null}
                    {upgrade.mechanicalPartSuggestions.length ? (
                      <><span>·</span><span>{partsSummary}</span></>
                    ) : null}
                  </div>
                </div>
              </div>
              <span className="self-start text-xs font-black text-blue-700 group-open:text-blue-900 sm:self-auto">
                <span className="group-open:hidden">View details</span>
                <span className="hidden group-open:inline">Hide details</span>
              </span>
            </summary>

            <div className="mt-2.5 border-t border-slate-200 pt-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${statusTone(upgrade.mechanicalValidationStatus)}`}>
                  {statusLabel(upgrade.mechanicalValidationStatus)}
                </span>
                {needsDifferentPartner ? (
                  <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-black uppercase text-amber-800">
                    Needs different partner
                  </span>
                ) : null}
              </div>

              {upgrade.description ? (
                <div className="mt-2 text-sm text-slate-600">{upgrade.description}</div>
              ) : null}
              {upgrade.desiredOutcome ? (
                <div className="mt-1 text-xs font-semibold text-violet-700">
                  Owner goal: {upgrade.desiredOutcome}
                </div>
              ) : null}
              {upgrade.mechanicalValidationNotes ? (
                <div className="mt-2 text-xs font-semibold leading-5 text-slate-500">
                  <span className="font-black text-slate-700">Mechanic note:</span>{" "}
                  {upgrade.mechanicalValidationNotes}
                </div>
              ) : null}

              <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 border-y border-slate-100 py-3 text-xs font-semibold text-slate-600">
                <span>
                  <span className="text-slate-400">Inspector can perform:</span>{" "}
                  <span className={`font-black ${needsDifferentPartner ? "text-amber-800" : "text-slate-800"}`}>
                    {upgrade.mechanicalCanPerform === null
                      ? "—"
                      : upgrade.mechanicalCanPerform
                        ? "Yes"
                        : "No"}
                  </span>
                </span>
                <span>
                  <span className="text-slate-400">Labor:</span>{" "}
                  <span className="font-black text-slate-800">
                    {upgrade.mechanicalLaborHours === null ? "—" : `${upgrade.mechanicalLaborHours} hr`}
                  </span>
                </span>
                <span>
                  <span className="text-slate-400">Estimate:</span>{" "}
                  <span className="font-black text-slate-800">
                    {money(upgrade.mechanicalProposedLaborPrice)}
                  </span>
                </span>
                {upgrade.mechanicalRecommendedAction ? (
                  <span className="min-w-0 sm:flex-1">
                    <span className="text-slate-400">Recommended:</span>{" "}
                    <span className="font-black text-slate-800">
                      {upgrade.mechanicalRecommendedAction}
                    </span>
                  </span>
                ) : null}
              </div>

              {upgrade.mechanicalPartSuggestions.length ? (
                <div className="mt-4 border-t border-slate-200 pt-3">
                  <div className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-400">
                    Suggested parts
                  </div>
                  <div className="mt-1 text-xs font-semibold text-slate-500">
                    Parts considered by the inspector for this upgrade.
                  </div>
                  <div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                    {upgrade.mechanicalPartSuggestions.map((part, index) => {
                      const partStatus = upgradePartStatus(part);
                      const price = upgradePartPrice(part);
                      const sourceUrl = upgradePartUrl(part);
                      const note = upgradePartNote(part);
                      const partNumber =
                        part.partNumber && !/^https?:\/\//i.test(part.partNumber)
                          ? part.partNumber
                          : null;
                      const notNeeded = partStatus.label === "Not needed";

                      return (
                        <div
                          key={`${part.description}-${index}`}
                          className={`rounded-xl border p-3 ${
                            notNeeded
                              ? "border-slate-200 bg-slate-50/70 opacity-80"
                              : "border-slate-200 bg-white"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-sm font-black leading-5 text-slate-950">
                                {part.description}
                              </div>
                              <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-slate-500">
                                <span>Qty {part.quantity}</span>
                                {partNumber ? <span>· #{partNumber}</span> : null}
                              </div>
                            </div>
                            {price ? (
                              <div className="shrink-0 text-right">
                                <div className={`text-sm font-black ${price.tone}`}>{price.value}</div>
                                <div className="mt-0.5 text-[9px] font-black uppercase tracking-[0.06em] text-slate-400">
                                  {price.label}
                                </div>
                              </div>
                            ) : (
                              <div className="shrink-0 text-sm font-black text-slate-400">TBD</div>
                            )}
                          </div>
                          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                            <span className={`rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.06em] ${partStatus.tone}`}>
                              {partStatus.label}
                            </span>
                            {sourceUrl && !notNeeded ? (
                              <a
                                href={sourceUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[11px] font-black text-blue-700 hover:text-blue-900"
                              >
                                Source reference ↗
                              </a>
                            ) : null}
                          </div>
                          {note ? (
                            <div className="mt-2 text-[11px] font-semibold leading-4 text-slate-500">
                              {note}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          </details>
        );
      })}

      {pending.map((upgrade) => (
        <div
          key={upgrade.id}
          className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3"
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="font-black text-slate-900">{upgrade.title}</div>
              <div className="mt-0.5 text-xs font-semibold text-amber-800">
                Upgrade · Waiting for mechanic review
              </div>
            </div>
            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-black uppercase text-amber-800">
              Pending
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
