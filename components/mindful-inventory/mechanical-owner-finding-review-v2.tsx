"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import type { OwnerReviewPartnerOption } from "@/components/mindful-inventory/mechanical-owner-finding-review";
import {
  approvalAuthorizationLabel,
  findingApprovalPartDisposition,
  money,
  summarizeFindingApprovalCost,
} from "@/lib/mindful-inventory/finding-approval";
import type { InventoryFindingView } from "@/lib/mindful-inventory/intake-inspection";

function sourceLabel(source: string) {
  return source.toLowerCase() === "ai"
    ? "Originally flagged by AI"
    : `Originally flagged by ${source.replaceAll("_", " ")}`;
}

function validationLabel(status: string) {
  if (status === "confirmed") return "Mechanic confirmed";
  if (status === "changed") return "Mechanic changed finding";
  if (status === "needs_diagnosis") return "Further diagnosis needed";
  if (status === "not_found") return "Mechanic did not find issue";
  return status.replaceAll("_", " ");
}

function partPriceLabel(part: InventoryFindingView["mechanicalSuggestedParts"][number]) {
  if (part.partnerOfferUnitPrice !== null) {
    return { value: money(part.partnerOfferUnitPrice), source: "Partner price" };
  }
  const low = part.aiEstimatedUnitPriceLow;
  const high = part.aiEstimatedUnitPriceHigh;
  if (low !== null || high !== null) {
    const resolvedLow = low ?? high;
    const resolvedHigh = high ?? low;
    return {
      value:
        resolvedLow !== null &&
        resolvedHigh !== null &&
        Math.abs(resolvedHigh - resolvedLow) > 0.009
          ? `${money(resolvedLow)}–${money(resolvedHigh)}`
          : money(resolvedHigh),
      source: "AI estimate",
    };
  }
  return { value: "TBD", source: "Price needed" };
}

function partStatusLabel(part: InventoryFindingView["mechanicalSuggestedParts"][number]) {
  const disposition = findingApprovalPartDisposition(part);
  if (disposition === "in_stock") return "In stock";
  if (disposition === "not_needed") return "Not needed";
  return "Purchase required";
}

function partSourceUrl(part: InventoryFindingView["mechanicalSuggestedParts"][number]) {
  const partNumber = part.partNumber?.trim() || "";
  if (/^https?:\/\//i.test(partNumber)) return partNumber;
  const match = (part.notes || "").match(/https?:\/\/[^\s]+/i);
  return match?.[0] || null;
}

function partDisplayNote(part: InventoryFindingView["mechanicalSuggestedParts"][number]) {
  let note = (part.notes || "").replace(/^(IN STOCK|NOT NEEDED) · /i, "").trim();
  note = note.replace(/https?:\/\/[^\s]+/gi, "").trim();
  if (/^Lot Logic search:/i.test(note)) return null;
  return note || null;
}

function hasLegacyUnpricedParts(finding: InventoryFindingView) {
  return Boolean(
    finding.mechanicalPartsRequired?.trim() &&
      finding.mechanicalSuggestedParts.length === 0,
  );
}

function scopeNoun(finding: InventoryFindingView) {
  return finding.mechanicalValidationStatus === "needs_diagnosis"
    ? "diagnostic work"
    : "repair";
}

export function MechanicalOwnerFindingReviewV2({
  vehicleId,
  findings,
  partnerOptions,
  inspectorPartnerId,
}: {
  vehicleId: string;
  findings: InventoryFindingView[];
  partnerOptions: OwnerReviewPartnerOption[];
  inspectorPartnerId: string | null;
}) {
  const router = useRouter();
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [alternatePartners, setAlternatePartners] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      findings.map((finding) => [finding.id, finding.ownerPreferredPartnerId || ""]),
    ),
  );
  const [openNotes, setOpenNotes] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      findings.map((finding) => [
        finding.id,
        Boolean(
          finding.mechanicalOwnerReviewStatus === "clarification_requested" ||
            finding.mechanicalOwnerReviewNotes,
        ),
      ]),
    ),
  );
  const [openParts, setOpenParts] = useState<Record<string, boolean>>({});
  const [openResolved, setOpenResolved] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState("");

  const inspector =
    partnerOptions.find((partner) => partner.id === inspectorPartnerId) || null;
  const availablePartners = partnerOptions.filter(
    (partner) => partner.id !== inspectorPartnerId,
  );

  const unresolvedFindings = findings.filter(
    (finding) =>
      !finding.mechanicalOwnerReviewStatus ||
      finding.mechanicalOwnerReviewStatus === "clarification_requested",
  );
  const resolvedFindings = findings.filter(
    (finding) =>
      finding.mechanicalOwnerReviewStatus === "accepted" ||
      finding.mechanicalOwnerReviewStatus === "dismissed",
  );

  async function review(
    finding: InventoryFindingView,
    decision: "accept" | "clarification" | "dismiss",
  ) {
    const isNotFound = finding.mechanicalValidationStatus === "not_found";
    const needsDifferentPartner =
      finding.mechanicalCanPerform === false && !isNotFound;
    const cost = summarizeFindingApprovalCost(
      finding.mechanicalProposedLaborPrice,
      finding.mechanicalSuggestedParts,
    );

    if (decision === "clarification" && !(notes[finding.id] || "").trim()) {
      setOpenNotes((current) => ({ ...current, [finding.id]: true }));
      setMessage("Add the question or clarification you want the mechanic to answer.");
      return;
    }

    if (decision === "accept" && !isNotFound && finding.mechanicalCanPerform === null) {
      setOpenNotes((current) => ({ ...current, [finding.id]: true }));
      setMessage(
        "The mechanic must confirm whether they can perform this work before you approve it.",
      );
      return;
    }

    if (
      decision === "accept" &&
      !isNotFound &&
      (hasLegacyUnpricedParts(finding) || !cost.pricingComplete)
    ) {
      setOpenNotes((current) => ({ ...current, [finding.id]: true }));
      setMessage(
        "Complete the labor and purchase-required part pricing before approving this work and its spend.",
      );
      return;
    }

    if (
      decision === "accept" &&
      !isNotFound &&
      needsDifferentPartner &&
      !(alternatePartners[finding.id] || "").trim()
    ) {
      setMessage(
        `Choose who should handle ${finding.title} before approving and routing the work.`,
      );
      return;
    }

    const submittedNote = notes[finding.id] || "";
    setWorkingId(finding.id);
    setMessage("");

    try {
      const response = await fetch(
        `/api/mindful/inventory/vehicles/${vehicleId}/inspection-finding-review`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            findingId: finding.id,
            decision,
            notes: submittedNote,
            alternatePartnerId: needsDifferentPartner
              ? alternatePartners[finding.id] || null
              : null,
          }),
        },
      );

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Finding review could not be saved.");
      }

      if (decision === "clarification") {
        setNotes((current) =>
          (current[finding.id] || "") === submittedNote
            ? { ...current, [finding.id]: "" }
            : current,
        );
      }

      const finishingMechanicalReview =
        decision !== "clarification" &&
        unresolvedFindings.length === 1 &&
        unresolvedFindings[0]?.id === finding.id;

      if (finishingMechanicalReview) {
        setMessage("Mechanical review complete. Building the Preliminary Work Plan…");
        const planResponse = await fetch(
          `/api/mindful/inventory/vehicles/${vehicleId}/work-plan/generate`,
          { method: "POST" },
        );
        if (!planResponse.ok) {
          const planPayload = (await planResponse.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(
            planPayload.error ||
              "Mechanical review was saved, but the Preliminary Work Plan could not be built.",
          );
        }
        router.push(`/mindful/inventory/${vehicleId}/car-plan?from=mechanical`);
        router.refresh();
        return;
      }

      setMessage(
        decision === "accept"
          ? isNotFound
            ? `${finding.title}: mechanic result accepted. No repair will enter the Work Plan.`
            : `${finding.title} approved for ${approvalAuthorizationLabel(cost)} and added to the Work Plan scope.`
          : decision === "dismiss"
            ? `${finding.title} dismissed from the mechanical scope.`
            : `Clarification requested from the mechanic for ${finding.title}.`,
      );
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Finding review could not be saved.",
      );
    } finally {
      setWorkingId(null);
    }
  }

  function performerSummary(finding: InventoryFindingView) {
    if (finding.mechanicalCanPerform === true) {
      return `${inspector?.displayName || "The mechanic"} will perform`;
    }
    if (finding.mechanicalCanPerform === false) {
      const selected = partnerOptions.find(
        (partner) => partner.id === alternatePartners[finding.id],
      );
      return selected ? `${selected.displayName} will perform` : "Partner needed";
    }
    return "Performer not confirmed";
  }

  function partsSpendLabel(finding: InventoryFindingView) {
    const cost = summarizeFindingApprovalCost(
      finding.mechanicalProposedLaborPrice,
      finding.mechanicalSuggestedParts,
    );
    if (hasLegacyUnpricedParts(finding) || cost.unknownPartCount) {
      return "Parts pricing incomplete";
    }
    return Math.abs(cost.partsHigh - cost.partsLow) > 0.009
      ? `${money(cost.partsLow)}–${money(cost.partsHigh)} parts`
      : `${money(cost.partsHigh)} parts`;
  }

  function renderDecisionSummary(finding: InventoryFindingView) {
    const cost = summarizeFindingApprovalCost(
      finding.mechanicalProposedLaborPrice,
      finding.mechanicalSuggestedParts,
    );
    const legacyPartsMissing = hasLegacyUnpricedParts(finding);
    const pricingReady = cost.pricingComplete && !legacyPartsMissing;
    const needsDifferentPartner = finding.mechanicalCanPerform === false;
    const selectedAlternatePartner = alternatePartners[finding.id] || "";
    const performerReady =
      finding.mechanicalCanPerform !== null &&
      (!needsDifferentPartner || Boolean(selectedAlternatePartner));
    const ready = pricingReady && performerReady;

    return (
      <section className="mt-3 rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3">
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <div>
              <div className="text-[11px] font-black text-slate-500">
                {ready ? `Approve ${scopeNoun(finding)}` : "Approval not ready"}
              </div>
              <div
                className={`mt-0.5 text-2xl font-black tracking-tight ${
                  ready ? "text-slate-950" : "text-amber-900"
                }`}
              >
                {pricingReady ? approvalAuthorizationLabel(cost) : "Pricing incomplete"}
              </div>
            </div>
            <div className="text-xs font-semibold text-slate-500">
              {ready
                ? `Authorizes work and new spend up to ${money(cost.totalHigh)}`
                : finding.mechanicalCanPerform === null
                  ? "Performer confirmation required"
                  : needsDifferentPartner && !selectedAlternatePartner
                    ? "Choose a Partner"
                    : legacyPartsMissing || cost.unknownPartCount
                      ? "Required part pricing missing"
                      : cost.laborPrice === null
                        ? "Labor pricing missing"
                        : "Complete approval details"}
            </div>
          </div>
          <div className="flex flex-wrap gap-x-2 gap-y-1 text-sm font-semibold text-slate-600">
            <span>{performerSummary(finding)}</span>
            {finding.mechanicalLaborHours !== null ? (
              <><span className="text-slate-300">·</span><span>{finding.mechanicalLaborHours} hr</span></>
            ) : null}
            <><span className="text-slate-300">·</span><span>{money(cost.laborPrice)} labor</span></>
            <><span className="text-slate-300">·</span><span>{partsSpendLabel(finding)}</span></>
          </div>
        </div>
      </section>
    );
  }

  function renderMechanicEvidence(finding: InventoryFindingView) {
    const mechanicName = inspector?.displayName || "Assigned mechanic";
    const recommendation = finding.mechanicalRecommendedAction?.trim() || null;

    return (
      <div className="mt-3 border-t border-slate-100 pt-3">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <span className="font-black text-slate-900">{mechanicName}</span>
          {inspector?.secondaryLabel ? (
            <><span className="text-slate-300">·</span><span className="font-semibold text-slate-500">{inspector.secondaryLabel}</span></>
          ) : null}
          <span className="text-slate-300">·</span>
          <span className="font-semibold text-slate-600">{validationLabel(finding.mechanicalValidationStatus)}</span>
          {finding.mechanicalLaborHours !== null ? (
            <><span className="text-slate-300">·</span><span className="font-semibold text-slate-600">{finding.mechanicalLaborHours} hr labor</span></>
          ) : null}
        </div>
        {recommendation ? (
          <div className="mt-1.5 text-sm font-semibold text-slate-700">
            <span className="text-slate-500">Recommended:</span> {recommendation}
          </div>
        ) : null}
        {finding.mechanicalValidationNotes ? (
          <div className="mt-1.5 text-sm leading-5 text-slate-700">
            <span className="font-black">Mechanic note:</span>{" "}
            {finding.mechanicalValidationNotes}
          </div>
        ) : null}
      </div>
    );
  }

  function renderPartnerChoice(finding: InventoryFindingView) {
    if (finding.mechanicalCanPerform === true) return null;

    if (finding.mechanicalCanPerform === null) {
      return (
        <div className="mt-2 text-xs font-bold text-amber-800">
          Performer confirmation required before approval.
        </div>
      );
    }

    const selectedAlternatePartner = alternatePartners[finding.id] || "";
    return (
      <div className="mt-2 max-w-md">
        <label className="block text-xs font-black text-slate-700">
          Choose Partner
          <select
            value={selectedAlternatePartner}
            onChange={(event) =>
              setAlternatePartners((current) => ({
                ...current,
                [finding.id]: event.target.value,
              }))
            }
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-800"
          >
            <option value="">Select Partner</option>
            {availablePartners.map((partner) => (
              <option key={partner.id} value={partner.id}>
                {partner.displayName}
                {partner.secondaryLabel ? ` · ${partner.secondaryLabel}` : ""}
              </option>
            ))}
          </select>
        </label>
        <div className="mt-1 text-[11px] font-semibold text-slate-500">
          {inspector?.displayName || "The mechanic"} said they cannot perform this work.
        </div>
      </div>
    );
  }

  function renderPartsDisclosure(finding: InventoryFindingView) {
    const parts = finding.mechanicalSuggestedParts;
    const cost = summarizeFindingApprovalCost(
      finding.mechanicalProposedLaborPrice,
      parts,
    );
    const expanded = Boolean(openParts[finding.id]);

    if (!parts.length) {
      return finding.mechanicalPartsRequired ? (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
          <span className="font-black">Parts needed:</span> {finding.mechanicalPartsRequired}. Structured part pricing is required before approval.
        </div>
      ) : null;
    }

    const summaryBits = [
      Math.abs(cost.partsHigh - cost.partsLow) > 0.009
        ? `${money(cost.partsLow)}–${money(cost.partsHigh)}`
        : money(cost.partsHigh),
      cost.purchaseRequiredCount ? `${cost.purchaseRequiredCount} to purchase` : null,
      cost.inStockCount ? `${cost.inStockCount} in stock` : null,
      cost.notNeededCount ? `${cost.notNeededCount} not needed` : null,
    ].filter(Boolean);

    return (
      <div className="mt-3 border-t border-slate-100 pt-2.5">
        <button
          type="button"
          onClick={() =>
            setOpenParts((current) => ({ ...current, [finding.id]: !expanded }))
          }
          className="flex w-full items-center justify-between gap-3 text-left"
        >
          <div className="min-w-0 text-sm font-semibold text-slate-600">
            <span className="font-black text-slate-900">Parts:</span>{" "}
            {summaryBits.join(" · ")}
          </div>
          <span className="shrink-0 text-xs font-black text-blue-700">
            {expanded ? "Hide parts" : "View parts & pricing"}
          </span>
        </button>

        {expanded ? (
          <div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {parts.map((part, index) => {
              const price = partPriceLabel(part);
              const disposition = findingApprovalPartDisposition(part);
              const sourceUrl = partSourceUrl(part);
              const note = partDisplayNote(part);
              const partNumber =
                part.partNumber && !/^https?:\/\//i.test(part.partNumber)
                  ? part.partNumber
                  : null;
              return (
                <div
                  key={`${part.description}-${index}`}
                  className="rounded-lg border border-slate-200 bg-white p-2.5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-black text-slate-900">{part.description}</div>
                      <div className="mt-0.5 text-[11px] font-semibold text-slate-500">
                        Qty {part.quantity}{partNumber ? ` · #${partNumber}` : ""}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-sm font-black text-slate-900">{price.value}</div>
                      <div className="text-[9px] font-black uppercase tracking-[0.05em] text-slate-400">
                        {price.source}
                      </div>
                    </div>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between gap-2">
                    <span
                      className={`text-[10px] font-black ${
                        disposition === "purchase_required"
                          ? "text-amber-700"
                          : disposition === "in_stock"
                            ? "text-emerald-700"
                            : "text-slate-500"
                      }`}
                    >
                      {partStatusLabel(part)}
                    </span>
                    {sourceUrl && disposition !== "not_needed" ? (
                      <a
                        href={sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[10px] font-black text-blue-700 hover:text-blue-900"
                      >
                        Source ↗
                      </a>
                    ) : null}
                  </div>
                  {note ? (
                    <div className="mt-1.5 text-[11px] font-semibold leading-4 text-slate-500">
                      {note}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    );
  }

  function renderNotFoundFinding(finding: InventoryFindingView) {
    const clarification = finding.mechanicalOwnerReviewStatus === "clarification_requested";
    const noteOpen = Boolean(openNotes[finding.id]);
    const mechanicName = inspector?.displayName || "The mechanic";

    return (
      <article
        key={finding.id}
        className={`rounded-2xl border bg-white px-4 py-3 shadow-sm ${
          clarification ? "border-amber-300" : "border-emerald-200"
        }`}
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="text-base font-black text-slate-950">{finding.title}</h4>
              <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.06em] text-emerald-800">
                No repair required
              </span>
            </div>
            {finding.description ? (
              <p className="mt-1 text-sm text-slate-600">{finding.description}</p>
            ) : null}
            <div className="mt-1.5 text-[10px] font-bold text-slate-400">
              {sourceLabel(finding.source)}
            </div>
          </div>
          {clarification ? (
            <span className="shrink-0 rounded-full bg-amber-100 px-3 py-1 text-[10px] font-black uppercase tracking-[0.06em] text-amber-800">
              Clarification pending
            </span>
          ) : null}
        </div>

        <div className="mt-2.5 flex items-start gap-2.5 rounded-lg bg-emerald-50 px-3 py-2.5">
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-sm font-black text-white">✓</span>
          <div className="min-w-0 text-sm text-emerald-950">
            <div className="font-black">{mechanicName} did not find this issue during inspection.</div>
            <div className="mt-0.5 font-semibold text-emerald-800">
              Accepting this result resolves the finding. No repair, Partner assignment, parts purchase, or spend enters the Work Plan.
            </div>
            {finding.mechanicalValidationNotes ? (
              <div className="mt-1.5 text-emerald-900">
                <span className="font-black">Mechanic note:</span>{" "}
                {finding.mechanicalValidationNotes}
              </div>
            ) : null}
          </div>
        </div>

        {clarification && finding.mechanicalOwnerReviewNotes ? (
          <div className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
            <span className="font-black">Question sent:</span>{" "}
            {finding.mechanicalOwnerReviewNotes}
          </div>
        ) : null}

        <div className="mt-2.5 flex flex-col gap-2 border-t border-slate-100 pt-2.5 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1">
              {noteOpen ? (
                <label className="block">
                  <span className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-400">
                    Owner note / question
                  </span>
                  <input
                    value={notes[finding.id] || ""}
                    onChange={(event) =>
                      setNotes((current) => ({ ...current, [finding.id]: event.target.value }))
                    }
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800"
                    placeholder="Ask what the mechanic checked or what they observed"
                  />
                </label>
              ) : (
                <button
                  type="button"
                  onClick={() => setOpenNotes((current) => ({ ...current, [finding.id]: true }))}
                  className="text-xs font-black text-slate-500 hover:text-blue-700"
                >
                  + Add note or question
                </button>
              )}
            </div>
            <button
              disabled={workingId === finding.id}
              onClick={() => {
                if (!(notes[finding.id] || "").trim()) {
                  setOpenNotes((current) => ({ ...current, [finding.id]: true }));
                  setMessage("Add your question, then request clarification.");
                  return;
                }
                void review(finding, "clarification");
              }}
              className="shrink-0 rounded-lg border border-amber-300 bg-white px-4 py-2 text-xs font-black text-amber-800 hover:bg-amber-50 disabled:opacity-40"
            >
              Request Clarification
            </button>
          </div>
          <button
            disabled={workingId === finding.id}
            onClick={() => void review(finding, "accept")}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-black text-white hover:bg-emerald-700 disabled:opacity-40"
          >
            Accept Inspector Result
          </button>
        </div>
      </article>
    );
  }

  function renderUnresolvedFinding(finding: InventoryFindingView) {
    if (finding.mechanicalValidationStatus === "not_found") {
      return renderNotFoundFinding(finding);
    }

    const clarification = finding.mechanicalOwnerReviewStatus === "clarification_requested";
    const needsDifferentPartner = finding.mechanicalCanPerform === false;
    const selectedAlternatePartner = alternatePartners[finding.id] || "";
    const noteOpen = Boolean(openNotes[finding.id]);
    const cost = summarizeFindingApprovalCost(
      finding.mechanicalProposedLaborPrice,
      finding.mechanicalSuggestedParts,
    );
    const performerReady =
      finding.mechanicalCanPerform !== null &&
      (!needsDifferentPartner || Boolean(selectedAlternatePartner));
    const canApprove =
      cost.pricingComplete && !hasLegacyUnpricedParts(finding) && performerReady;

    return (
      <article
        key={finding.id}
        className={`rounded-2xl border bg-white px-4 py-3 shadow-sm ${
          clarification ? "border-amber-300" : "border-slate-200"
        }`}
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h4 className="text-base font-black leading-6 text-slate-950">{finding.title}</h4>
            {finding.description ? (
              <p className="mt-0.5 text-sm leading-5 text-slate-600">{finding.description}</p>
            ) : null}
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 text-[10px] font-bold text-slate-400">
              <span>{sourceLabel(finding.source)}</span>
              <span>·</span>
              <span>{validationLabel(finding.mechanicalValidationStatus)}</span>
            </div>
          </div>
          <span
            className={`shrink-0 self-start rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.06em] ${
              clarification
                ? "bg-amber-100 text-amber-800"
                : "bg-blue-50 text-blue-700"
            }`}
          >
            {clarification ? "Clarification pending" : "Needs owner decision"}
          </span>
        </div>

        {renderDecisionSummary(finding)}
        {renderMechanicEvidence(finding)}
        {renderPartnerChoice(finding)}
        {renderPartsDisclosure(finding)}

        {clarification && finding.mechanicalOwnerReviewNotes ? (
          <div className="mt-2.5 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
            <span className="font-black">Question sent:</span>{" "}
            {finding.mechanicalOwnerReviewNotes}
          </div>
        ) : null}

        <div className="mt-3 flex flex-col gap-2 border-t border-slate-100 pt-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1">
              {noteOpen ? (
                <label className="block">
                  <span className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-400">
                    Owner note / question
                  </span>
                  <input
                    value={notes[finding.id] || ""}
                    onChange={(event) =>
                      setNotes((current) => ({ ...current, [finding.id]: event.target.value }))
                    }
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800"
                    placeholder="Ask about scope, price, parts, or who will perform the work"
                  />
                </label>
              ) : (
                <button
                  type="button"
                  onClick={() => setOpenNotes((current) => ({ ...current, [finding.id]: true }))}
                  className="text-xs font-black text-slate-500 hover:text-blue-700"
                >
                  + Add note or question
                </button>
              )}
            </div>
            <button
              disabled={workingId === finding.id}
              onClick={() => {
                if (!(notes[finding.id] || "").trim()) {
                  setOpenNotes((current) => ({ ...current, [finding.id]: true }));
                  setMessage("Add your question, then request clarification.");
                  return;
                }
                void review(finding, "clarification");
              }}
              className="shrink-0 rounded-lg border border-amber-300 bg-white px-4 py-2 text-xs font-black text-amber-800 hover:bg-amber-50 disabled:opacity-40"
            >
              Request Clarification
            </button>
          </div>

          <div className="flex shrink-0 flex-wrap gap-2">
            <button
              disabled={workingId === finding.id || !canApprove}
              onClick={() => void review(finding, "accept")}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-black text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
              title={
                finding.mechanicalCanPerform === null
                  ? "Mechanic must confirm whether they can perform this work"
                  : !cost.pricingComplete || hasLegacyUnpricedParts(finding)
                    ? "Complete labor and purchase-required part pricing before approval"
                    : needsDifferentPartner && !selectedAlternatePartner
                      ? "Choose a Partner before approval"
                      : undefined
              }
            >
              {needsDifferentPartner
                ? `Approve & Route · up to ${money(cost.totalHigh)}`
                : cost.hasRange
                  ? `Approve Work · up to ${money(cost.totalHigh)}`
                  : `Approve Work · ${money(cost.totalHigh)}`}
            </button>
            <button
              disabled={workingId === finding.id}
              onClick={() => void review(finding, "dismiss")}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-black text-slate-600 hover:bg-slate-50 disabled:opacity-40"
            >
              Dismiss
            </button>
          </div>
        </div>
      </article>
    );
  }

  function renderResolvedFinding(finding: InventoryFindingView) {
    const accepted = finding.mechanicalOwnerReviewStatus === "accepted";
    const notFound = finding.mechanicalValidationStatus === "not_found";
    const expanded = Boolean(openResolved[finding.id]);
    const cost = summarizeFindingApprovalCost(
      finding.mechanicalProposedLaborPrice,
      finding.mechanicalSuggestedParts,
    );
    const selectedPartnerId =
      finding.ownerPreferredPartnerId ||
      (finding.mechanicalCanPerform ? inspectorPartnerId : null);
    const selectedPartner =
      partnerOptions.find((partner) => partner.id === selectedPartnerId) || null;

    return (
      <article
        key={finding.id}
        className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3"
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-2">
            <span
              className={`mt-0.5 font-black ${
                accepted ? "text-emerald-600" : "text-slate-400"
              }`}
            >
              {accepted ? "✓" : "—"}
            </span>
            <div className="min-w-0">
              <div className="font-black text-slate-900">{finding.title}</div>
              <div className="mt-0.5 text-xs font-semibold text-slate-500">
                {accepted
                  ? notFound
                    ? "No repair required · Inspector result accepted"
                    : `Approved · ${approvalAuthorizationLabel(cost)}${
                        selectedPartner ? ` · ${selectedPartner.displayName}` : ""
                      }`
                  : "Dismissed"}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() =>
              setOpenResolved((current) => ({
                ...current,
                [finding.id]: !expanded,
              }))
            }
            className="self-start text-xs font-black text-blue-700 hover:text-blue-900 sm:self-auto"
          >
            {expanded ? "Hide details" : "View details"}
          </button>
        </div>
        {expanded ? (
          <div className="mt-2.5 border-t border-slate-200 pt-2.5">
            {finding.description ? (
              <p className="text-sm text-slate-600">{finding.description}</p>
            ) : null}
            {notFound ? (
              <div className="mt-2 text-sm font-semibold text-emerald-800">
                {inspector?.displayName || "The mechanic"} did not find the issue during inspection. No work or spend was authorized.
                {finding.mechanicalValidationNotes ? (
                  <span className="block mt-1 text-slate-600">
                    <span className="font-black">Mechanic note:</span>{" "}
                    {finding.mechanicalValidationNotes}
                  </span>
                ) : null}
              </div>
            ) : (
              <>
                {renderMechanicEvidence(finding)}
                {renderPartsDisclosure(finding)}
                {accepted && selectedPartner ? (
                  <div className="mt-2 text-xs font-semibold text-slate-600">
                    <span className="font-black text-slate-800">Partner:</span>{" "}
                    {selectedPartner.displayName}
                    {selectedPartner.secondaryLabel
                      ? ` · ${selectedPartner.secondaryLabel}`
                      : ""}
                  </div>
                ) : null}
              </>
            )}
            {finding.mechanicalOwnerReviewNotes ? (
              <div className="mt-2 text-xs font-semibold text-slate-600">
                <span className="font-black text-slate-800">Owner note:</span>{" "}
                {finding.mechanicalOwnerReviewNotes}
              </div>
            ) : null}
          </div>
        ) : null}
      </article>
    );
  }

  return (
    <div className="mt-3 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div>
          <div className="text-sm font-black text-slate-900">
            {unresolvedFindings.length
              ? `${unresolvedFindings.length} decision${
                  unresolvedFindings.length === 1 ? "" : "s"
                } remaining`
              : "Owner review complete"}
          </div>
          <div className="mt-0.5 text-xs font-semibold text-slate-500">
            Approve required work or confirm the mechanic&apos;s no-work result.
          </div>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.08em] ${
            unresolvedFindings.length
              ? "bg-amber-100 text-amber-800"
              : "bg-emerald-100 text-emerald-700"
          }`}
        >
          {unresolvedFindings.length ? "Owner review required" : "Ready to continue"}
        </span>
      </div>

      {unresolvedFindings.length ? (
        <section>
          <div className="mb-2 flex items-center justify-between gap-3">
            <h3 className="text-xs font-black uppercase tracking-[0.1em] text-slate-500">
              Needs your decision
            </h3>
            <span className="text-xs font-bold text-slate-400">
              {unresolvedFindings.length}
            </span>
          </div>
          <div className="space-y-2.5">
            {unresolvedFindings.map(renderUnresolvedFinding)}
          </div>
        </section>
      ) : null}

      {resolvedFindings.length ? (
        <section>
          <div className="mb-2 flex items-center justify-between gap-3">
            <h3 className="text-xs font-black uppercase tracking-[0.1em] text-slate-500">
              Resolved
            </h3>
            <span className="text-xs font-bold text-slate-400">
              {resolvedFindings.length}
            </span>
          </div>
          <div className="space-y-2">{resolvedFindings.map(renderResolvedFinding)}</div>
        </section>
      ) : null}

      {message ? (
        <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700">
          {message}
        </div>
      ) : null}
    </div>
  );
}
