"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import {
  approvalAuthorizationLabel,
  findingApprovalPartDisposition,
  money,
  summarizeFindingApprovalCost,
} from "@/lib/mindful-inventory/finding-approval";
import type {
  InventoryFindingView,
  MechanicalSuggestedPart,
} from "@/lib/mindful-inventory/intake-inspection";

export type OwnerReviewPartnerOption = {
  id: string;
  displayName: string;
  secondaryLabel: string | null;
};

function sourceLabel(source: string) {
  return source.toLowerCase() === "ai"
    ? "AI finding"
    : source.replaceAll("_", " ");
}

function partPriceLabel(part: MechanicalSuggestedPart) {
  if (part.partnerOfferUnitPrice !== null) {
    return `${money(part.partnerOfferUnitPrice)} · Partner price`;
  }

  const low = part.aiEstimatedUnitPriceLow;
  const high = part.aiEstimatedUnitPriceHigh;
  if (low !== null || high !== null) {
    const resolvedLow = low ?? high;
    const resolvedHigh = high ?? low;
    const range =
      resolvedLow !== null && resolvedHigh !== null && resolvedHigh !== resolvedLow
        ? `${money(resolvedLow)}–${money(resolvedHigh)}`
        : money(resolvedHigh);
    return `${range} · AI estimate`;
  }

  return "Price TBD";
}

function partDispositionLabel(part: MechanicalSuggestedPart) {
  const disposition = findingApprovalPartDisposition(part);
  if (disposition === "in_stock") return "In stock";
  if (disposition === "not_needed") return "Not needed";
  return "Purchase required";
}

export function MechanicalOwnerFindingReview({
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
  const [alternatePartners, setAlternatePartners] = useState<Record<string, string>>(
    () =>
      Object.fromEntries(
        findings.map((finding) => [
          finding.id,
          finding.ownerPreferredPartnerId || "",
        ]),
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
  const [openResolved, setOpenResolved] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState("");

  const inspectorPartner = partnerOptions.find(
    (partner) => partner.id === inspectorPartnerId,
  );
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
    const needsDifferentPartner =
      finding.mechanicalCanPerform === false &&
      finding.mechanicalValidationStatus !== "not_found";
    const approvalCost = summarizeFindingApprovalCost(
      finding.mechanicalProposedLaborPrice,
      finding.mechanicalSuggestedParts,
    );

    if (decision === "clarification" && !(notes[finding.id] || "").trim()) {
      setOpenNotes((current) => ({ ...current, [finding.id]: true }));
      setMessage(
        "Add the question or clarification you want the inspector to answer.",
      );
      return;
    }

    if (decision === "accept" && finding.mechanicalCanPerform === null) {
      setMessage(
        "Ask the mechanic whether they can perform this repair before approving it.",
      );
      return;
    }

    if (
      decision === "accept" &&
      needsDifferentPartner &&
      !(alternatePartners[finding.id] || "").trim()
    ) {
      setMessage(
        `Choose who should handle ${finding.title} before approving the repair.`,
      );
      return;
    }

    if (decision === "accept" && !approvalCost.pricingComplete) {
      setMessage(
        "Complete the labor and required part pricing before approving this repair and its spend.",
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

      setMessage(
        decision === "accept"
          ? `${finding.title} approved for the Work Plan at ${approvalAuthorizationLabel(
              approvalCost,
            )}.`
          : decision === "dismiss"
            ? `${finding.title} dismissed from the mechanical scope.`
            : `Clarification requested from the inspector for ${finding.title}.`,
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

  function renderFacts(finding: InventoryFindingView) {
    const mechanicName = inspectorPartner?.displayName || "Assigned mechanic";
    const performerName =
      finding.mechanicalCanPerform === true
        ? mechanicName
        : finding.mechanicalCanPerform === false
          ? "Alternate partner required"
          : "Not confirmed";

    return (
      <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
        <div className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-400">
          Mechanic assessment
        </div>
        <div className="mt-3 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.06em] text-slate-400">
              Mechanic
            </div>
            <div className="mt-0.5 font-black text-slate-900">{mechanicName}</div>
            {inspectorPartner?.secondaryLabel ? (
              <div className="text-xs font-semibold text-slate-500">
                {inspectorPartner.secondaryLabel}
              </div>
            ) : null}
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.06em] text-slate-400">
              Recommended action
            </div>
            <div className="mt-0.5 font-black text-slate-900">
              {finding.mechanicalRecommendedAction || "No recommendation entered"}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.06em] text-slate-400">
              Labor
            </div>
            <div className="mt-0.5 font-black text-slate-900">
              {finding.mechanicalLaborHours === null
                ? "Time TBD"
                : `${finding.mechanicalLaborHours} hr`}
            </div>
            <div className="text-xs font-semibold text-slate-500">
              Labor price {money(finding.mechanicalProposedLaborPrice)}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.06em] text-slate-400">
              Proposed performer
            </div>
            <div
              className={`mt-0.5 font-black ${
                finding.mechanicalCanPerform === null
                  ? "text-amber-800"
                  : "text-slate-900"
              }`}
            >
              {performerName}
            </div>
            <div className="text-xs font-semibold text-slate-500">
              {finding.mechanicalCanPerform === true
                ? "Mechanic offered to perform the repair"
                : finding.mechanicalCanPerform === false
                  ? "Mechanic cannot perform this repair"
                  : "Clarify before approval"}
            </div>
          </div>
        </div>
        {finding.mechanicalValidationNotes ? (
          <div className="mt-3 border-t border-slate-200 pt-3 text-sm font-semibold leading-5 text-slate-600">
            <span className="font-black text-slate-800">Mechanic note:</span>{" "}
            {finding.mechanicalValidationNotes}
          </div>
        ) : null}
      </div>
    );
  }

  function renderParts(finding: InventoryFindingView) {
    if (finding.mechanicalSuggestedParts.length) {
      return (
        <div className="mt-4">
          <div className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-400">
            Parts detail
          </div>
          <div className="mt-2 grid gap-2 md:grid-cols-2">
            {finding.mechanicalSuggestedParts.map((part, index) => (
              <div
                key={`${part.description}-${index}`}
                className="rounded-xl border border-slate-200 bg-white px-3 py-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-black text-slate-900">
                      {part.quantity}× {part.description}
                    </div>
                    {part.partNumber ? (
                      <div className="mt-0.5 text-xs font-semibold text-slate-500">
                        #{part.partNumber}
                      </div>
                    ) : null}
                  </div>
                  <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[9px] font-black uppercase tracking-[0.05em] text-slate-600">
                    {partDispositionLabel(part)}
                  </span>
                </div>
                <div className="mt-2 text-xs font-black text-slate-700">
                  {partPriceLabel(part)}
                </div>
                {part.notes ? (
                  <div className="mt-1 text-xs font-semibold text-slate-500">
                    {part.notes}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (finding.mechanicalPartsRequired) {
      return (
        <div className="mt-4 text-sm font-semibold text-slate-600">
          <span className="font-black text-slate-800">Parts needed:</span>{" "}
          {finding.mechanicalPartsRequired}
        </div>
      );
    }

    return null;
  }

  function renderApprovalSummary(finding: InventoryFindingView) {
    const cost = summarizeFindingApprovalCost(
      finding.mechanicalProposedLaborPrice,
      finding.mechanicalSuggestedParts,
    );

    const qualifierBits = [
      cost.purchaseRequiredCount
        ? `${cost.purchaseRequiredCount} purchase part${
            cost.purchaseRequiredCount === 1 ? "" : "s"
          } included`
        : "No new parts spend",
      cost.inStockCount
        ? `${cost.inStockCount} in-stock part${cost.inStockCount === 1 ? "" : "s"} excluded from new cash spend`
        : null,
      cost.notNeededCount
        ? `${cost.notNeededCount} part${cost.notNeededCount === 1 ? "" : "s"} marked not needed`
        : null,
      cost.usesAiPartEstimate ? "Includes AI-estimated part pricing" : null,
      cost.usesPartnerPartPrice ? "Includes Partner part pricing" : null,
    ].filter(Boolean);

    return (
      <div
        className={`mt-4 rounded-2xl border-2 p-4 ${
          cost.pricingComplete
            ? "border-emerald-200 bg-emerald-50/60"
            : "border-amber-300 bg-amber-50/70"
        }`}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div
              className={`text-[10px] font-black uppercase tracking-[0.09em] ${
                cost.pricingComplete ? "text-emerald-700" : "text-amber-800"
              }`}
            >
              Repair authorization
            </div>
            <div className="mt-1 text-sm font-semibold text-slate-600">
              Approving this finding authorizes the repair, its spend, its performer,
              and inclusion in the Work Plan.
            </div>
          </div>
          <div className="shrink-0 sm:text-right">
            <div className="text-[10px] font-bold uppercase tracking-[0.06em] text-slate-500">
              Authorized repair total
            </div>
            <div
              className={`mt-0.5 text-2xl font-black ${
                cost.pricingComplete ? "text-emerald-800" : "text-amber-900"
              }`}
            >
              {approvalAuthorizationLabel(cost)}
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-200/80 pt-3 text-sm sm:grid-cols-3">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.06em] text-slate-400">
              Labor price
            </div>
            <div className="font-black text-slate-900">{money(cost.laborPrice)}</div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.06em] text-slate-400">
              New parts spend
            </div>
            <div className="font-black text-slate-900">
              {cost.unknownPartCount
                ? "Incomplete"
                : cost.hasRange
                  ? `${money(cost.partsLow)}–${money(cost.partsHigh)}`
                  : money(cost.partsHigh)}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.06em] text-slate-400">
              Pricing status
            </div>
            <div
              className={`font-black ${
                cost.pricingComplete ? "text-emerald-800" : "text-amber-900"
              }`}
            >
              {cost.pricingComplete
                ? "Ready to approve"
                : `${cost.unknownPartCount} part price${
                    cost.unknownPartCount === 1 ? "" : "s"
                  } missing`}
            </div>
          </div>
        </div>

        {qualifierBits.length ? (
          <div className="mt-3 text-[11px] font-semibold leading-5 text-slate-500">
            {qualifierBits.join(" · ")}
          </div>
        ) : null}
      </div>
    );
  }

  function renderUnresolvedFinding(finding: InventoryFindingView) {
    const clarification =
      finding.mechanicalOwnerReviewStatus === "clarification_requested";
    const needsDifferentPartner =
      finding.mechanicalCanPerform === false &&
      finding.mechanicalValidationStatus !== "not_found";
    const noteOpen = Boolean(openNotes[finding.id]);
    const selectedAlternatePartner = alternatePartners[finding.id] || "";
    const approvalCost = summarizeFindingApprovalCost(
      finding.mechanicalProposedLaborPrice,
      finding.mechanicalSuggestedParts,
    );
    const performerResolved =
      finding.mechanicalCanPerform === true ||
      (finding.mechanicalCanPerform === false && Boolean(selectedAlternatePartner));
    const approvalReady = approvalCost.pricingComplete && performerResolved;

    return (
      <article
        key={finding.id}
        className={`rounded-2xl border bg-white p-4 shadow-sm ${
          clarification ? "border-amber-300" : "border-slate-200"
        }`}
      >
        <div
          className={`grid gap-4 ${
            needsDifferentPartner
              ? "lg:grid-cols-[minmax(0,1fr)_390px] lg:items-start"
              : "sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start"
          }`}
        >
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="text-lg font-black leading-6 text-slate-950">
                {finding.title}
              </h4>
              <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.06em] text-blue-700">
                {clarification ? "Clarification pending" : "Needs owner decision"}
              </span>
            </div>
            {finding.description ? (
              <p className="mt-1 text-sm leading-5 text-slate-600">
                {finding.description}
              </p>
            ) : null}
            <div className="mt-2 text-[10px] font-bold uppercase tracking-[0.05em] text-slate-400">
              {sourceLabel(finding.source)}
              {finding.mechanicalValidationStatus
                ? ` · ${finding.mechanicalValidationStatus.replaceAll("_", " ")}`
                : ""}
            </div>
            {renderFacts(finding)}
            {renderParts(finding)}
          </div>

          {needsDifferentPartner ? (
            <div
              className={`rounded-xl border p-3 ${
                selectedAlternatePartner
                  ? "border-emerald-200 bg-emerald-50/70"
                  : "border-amber-200 bg-amber-50/70"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div
                  className={`text-[10px] font-black uppercase tracking-[0.07em] ${
                    selectedAlternatePartner
                      ? "text-emerald-700"
                      : "text-amber-800"
                  }`}
                >
                  {selectedAlternatePartner
                    ? "Performer selected"
                    : "Alternate partner required"}
                </div>
                {!selectedAlternatePartner ? (
                  <span className="text-[10px] font-bold text-amber-700">Required</span>
                ) : null}
              </div>
              <select
                value={selectedAlternatePartner}
                onChange={(event) =>
                  setAlternatePartners((current) => ({
                    ...current,
                    [finding.id]: event.target.value,
                  }))
                }
                className={`mt-2 w-full rounded-lg border bg-white px-3 py-2 text-sm font-bold text-slate-800 ${
                  selectedAlternatePartner
                    ? "border-emerald-300"
                    : "border-amber-300"
                }`}
              >
                <option value="">Choose alternate partner</option>
                {availablePartners.map((partner) => (
                  <option key={partner.id} value={partner.id}>
                    {partner.displayName}
                    {partner.secondaryLabel ? ` · ${partner.secondaryLabel}` : ""}
                  </option>
                ))}
              </select>
              <div
                className={`mt-1.5 text-[10px] font-semibold leading-4 ${
                  selectedAlternatePartner
                    ? "text-emerald-700"
                    : "text-amber-800"
                }`}
              >
                {selectedAlternatePartner
                  ? "This Partner will carry into the Work Plan and Active Work."
                  : "The inspecting mechanic cannot perform this repair."}
              </div>
              {!availablePartners.length ? (
                <div className="mt-2 text-xs font-bold text-red-700">
                  No other active Partners are available. Add or enable a Partner in
                  Admin → Partners before approving this repair.
                </div>
              ) : null}
            </div>
          ) : (
            <div className="hidden sm:block" aria-hidden="true" />
          )}
        </div>

        {renderApprovalSummary(finding)}

        {finding.mechanicalCanPerform === null ? (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900">
            Ask the mechanic whether they can perform this repair before approval.
          </div>
        ) : null}

        {clarification && finding.mechanicalOwnerReviewNotes ? (
          <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
            <span className="font-black">Question sent:</span>{" "}
            {finding.mechanicalOwnerReviewNotes}
          </div>
        ) : null}

        <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 lg:flex-row lg:items-end lg:justify-between">
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
                      setNotes((current) => ({
                        ...current,
                        [finding.id]: event.target.value,
                      }))
                    }
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800"
                    placeholder="Add context, or type the question for the mechanic"
                  />
                </label>
              ) : (
                <button
                  type="button"
                  onClick={() =>
                    setOpenNotes((current) => ({
                      ...current,
                      [finding.id]: true,
                    }))
                  }
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
                  setOpenNotes((current) => ({
                    ...current,
                    [finding.id]: true,
                  }));
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

          <div className="flex shrink-0 flex-wrap gap-2 border-t border-slate-100 pt-3 lg:border-l lg:border-t-0 lg:pl-3 lg:pt-0">
            <button
              disabled={workingId === finding.id || !approvalReady}
              onClick={() => void review(finding, "accept")}
              title={
                approvalReady
                  ? `Approve repair and authorized spend of ${approvalAuthorizationLabel(
                      approvalCost,
                    )}`
                  : "Complete pricing and performer selection before approval"
              }
              className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-black text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {workingId === finding.id
                ? "Saving…"
                : needsDifferentPartner
                  ? "Approve Repair & Route"
                  : "Approve Repair"}
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
    const expanded = Boolean(openResolved[finding.id]);
    const selectedPartner = partnerOptions.find(
      (partner) => partner.id === finding.ownerPreferredPartnerId,
    );
    const approvalCost = summarizeFindingApprovalCost(
      finding.mechanicalProposedLaborPrice,
      finding.mechanicalSuggestedParts,
    );

    const summaryBits = [
      accepted ? "Repair approved" : "Dismissed",
      accepted && selectedPartner ? `Partner: ${selectedPartner.displayName}` : null,
      accepted ? `Authorized: ${approvalAuthorizationLabel(approvalCost)}` : null,
    ].filter(Boolean);

    return (
      <article
        key={finding.id}
        className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-start gap-2">
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
                  {summaryBits.join(" · ")}
                </div>
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
          <div className="mt-3 border-t border-slate-200 pt-3">
            {finding.description ? (
              <p className="text-sm text-slate-600">{finding.description}</p>
            ) : null}
            {renderFacts(finding)}
            {renderApprovalSummary(finding)}
            {renderParts(finding)}
            {accepted && selectedPartner ? (
              <div className="mt-3 text-xs font-semibold text-slate-600">
                <span className="font-black text-slate-800">Approved Partner:</span>{" "}
                {selectedPartner.displayName}
                {selectedPartner.secondaryLabel
                  ? ` · ${selectedPartner.secondaryLabel}`
                  : ""}
              </div>
            ) : null}
            {finding.mechanicalOwnerReviewNotes ? (
              <div className="mt-3 text-xs font-semibold text-slate-600">
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
    <div className="mt-4 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <div className="text-sm font-black text-slate-900">
            {unresolvedFindings.length
              ? `${unresolvedFindings.length} decision${
                  unresolvedFindings.length === 1 ? "" : "s"
                } remaining`
              : "Owner review complete"}
          </div>
          <div className="mt-1 text-xs font-semibold text-slate-500">
            Approve the repair, spend, and performer for each accepted finding before
            the mechanical inspection can continue to the Work Plan.
          </div>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.08em] ${
            unresolvedFindings.length
              ? "bg-amber-100 text-amber-800"
              : "bg-emerald-100 text-emerald-700"
          }`}
        >
          {unresolvedFindings.length
            ? "Owner authorization required"
            : "Ready to continue"}
        </span>
      </div>

      {unresolvedFindings.length ? (
        <section>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-xs font-black uppercase tracking-[0.1em] text-slate-500">
              Needs your decision
            </h3>
            <span className="text-xs font-bold text-slate-400">
              {unresolvedFindings.length}
            </span>
          </div>
          <div className="space-y-3">
            {unresolvedFindings.map(renderUnresolvedFinding)}
          </div>
        </section>
      ) : null}

      {resolvedFindings.length ? (
        <section>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-xs font-black uppercase tracking-[0.1em] text-slate-500">
              Resolved
            </h3>
            <span className="text-xs font-bold text-slate-400">
              {resolvedFindings.length}
            </span>
          </div>
          <div className="space-y-2">
            {resolvedFindings.map(renderResolvedFinding)}
          </div>
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
