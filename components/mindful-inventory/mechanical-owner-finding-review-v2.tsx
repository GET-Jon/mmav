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
    : source.replaceAll("_", " ");
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
    return { value: money(part.partnerOfferUnitPrice), source: "Inspector price" };
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
  if (disposition === "in_stock") {
    return {
      label: "In stock",
      detail: "No new cash spend",
      tone: "border-emerald-200 bg-emerald-50 text-emerald-800",
    };
  }
  if (disposition === "not_needed") {
    return {
      label: "Not needed",
      detail: "Excluded",
      tone: "border-slate-200 bg-slate-100 text-slate-600",
    };
  }
  return {
    label: "Purchase required",
    detail: "Included in authorization",
    tone: "border-amber-200 bg-amber-50 text-amber-800",
  };
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
    const needsDifferentPartner =
      finding.mechanicalCanPerform === false &&
      finding.mechanicalValidationStatus !== "not_found";
    const cost = summarizeFindingApprovalCost(
      finding.mechanicalProposedLaborPrice,
      finding.mechanicalSuggestedParts,
    );

    if (decision === "clarification" && !(notes[finding.id] || "").trim()) {
      setOpenNotes((current) => ({ ...current, [finding.id]: true }));
      setMessage("Add the question or clarification you want the mechanic to answer.");
      return;
    }

    if (decision === "accept" && finding.mechanicalCanPerform === null) {
      setOpenNotes((current) => ({ ...current, [finding.id]: true }));
      setMessage(
        "The mechanic must confirm whether they can perform this work before you approve it.",
      );
      return;
    }

    if (decision === "accept" && !cost.pricingComplete) {
      setOpenNotes((current) => ({ ...current, [finding.id]: true }));
      setMessage(
        "Complete the labor and purchase-required part pricing before approving this work and its spend.",
      );
      return;
    }

    if (
      decision === "accept" &&
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

      setMessage(
        decision === "accept"
          ? `${finding.title} approved for ${approvalAuthorizationLabel(cost)} and added to the Work Plan scope.`
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

  function renderAssessment(finding: InventoryFindingView) {
    const performerIncomplete = finding.mechanicalCanPerform === null;
    const needsDifferentPartner = finding.mechanicalCanPerform === false;
    const mechanicName = inspector?.displayName || "Assigned mechanic";

    return (
      <section className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
        <div className="text-[10px] font-black uppercase tracking-[0.09em] text-slate-400">
          Mechanic assessment
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.06em] text-slate-400">
              Mechanic
            </div>
            <div className="mt-1 text-sm font-black text-slate-900">{mechanicName}</div>
            {inspector?.secondaryLabel ? (
              <div className="text-xs font-semibold text-slate-500">
                {inspector.secondaryLabel}
              </div>
            ) : null}
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.06em] text-slate-400">
              Recommended action
            </div>
            <div className="mt-1 text-sm font-black text-slate-900">
              {finding.mechanicalRecommendedAction || "No recommendation entered"}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.06em] text-slate-400">
              Can perform
            </div>
            <div
              className={`mt-1 text-sm font-black ${
                performerIncomplete || needsDifferentPartner
                  ? "text-amber-800"
                  : "text-slate-900"
              }`}
            >
              {performerIncomplete ? "Not answered" : needsDifferentPartner ? "No" : "Yes"}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.06em] text-slate-400">
              Labor
            </div>
            <div className="mt-1 text-sm font-black text-slate-900">
              {finding.mechanicalLaborHours === null
                ? "TBD"
                : `${finding.mechanicalLaborHours} hr`}
            </div>
          </div>
        </div>
        {finding.mechanicalValidationNotes ? (
          <div className="mt-3 border-t border-slate-200 pt-3 text-sm font-semibold leading-5 text-slate-600">
            <span className="font-black text-slate-800">Mechanic note:</span>{" "}
            {finding.mechanicalValidationNotes}
          </div>
        ) : null}
      </section>
    );
  }

  function renderApprovalSummary(finding: InventoryFindingView) {
    const cost = summarizeFindingApprovalCost(
      finding.mechanicalProposedLaborPrice,
      finding.mechanicalSuggestedParts,
    );

    return (
      <section
        className={`rounded-xl border-2 p-4 ${
          cost.pricingComplete
            ? "border-emerald-200 bg-emerald-50/50"
            : "border-amber-300 bg-amber-50/60"
        }`}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div
              className={`text-[10px] font-black uppercase tracking-[0.09em] ${
                cost.pricingComplete ? "text-emerald-700" : "text-amber-800"
              }`}
            >
              Approval summary
            </div>
            <div className="mt-2 flex flex-wrap gap-x-6 gap-y-2 text-sm">
              <span>
                <span className="font-semibold text-slate-500">Labor price </span>
                <span className="font-black text-slate-900">{money(cost.laborPrice)}</span>
              </span>
              <span>
                <span className="font-semibold text-slate-500">New parts spend </span>
                <span className="font-black text-slate-900">
                  {cost.unknownPartCount
                    ? "Incomplete"
                    : Math.abs(cost.partsHigh - cost.partsLow) > 0.009
                      ? `${money(cost.partsLow)}–${money(cost.partsHigh)}`
                      : money(cost.partsHigh)}
                </span>
              </span>
              {cost.inStockCount ? (
                <span>
                  <span className="font-semibold text-slate-500">In stock </span>
                  <span className="font-black text-emerald-800">
                    {cost.inStockCount} part{cost.inStockCount === 1 ? "" : "s"} · $0 new spend
                  </span>
                </span>
              ) : null}
            </div>
          </div>
          <div className="sm:text-right">
            <div className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-500">
              Total authorization
            </div>
            <div
              className={`mt-1 text-2xl font-black ${
                cost.pricingComplete ? "text-slate-950" : "text-amber-900"
              }`}
            >
              {approvalAuthorizationLabel(cost)}
            </div>
          </div>
        </div>
        <div
          className={`mt-3 text-xs font-semibold leading-5 ${
            cost.pricingComplete ? "text-emerald-900" : "text-amber-900"
          }`}
        >
          {cost.pricingComplete ? (
            <>
              Approving authorizes this {scopeNoun(finding)}, authorizes new spend up to{" "}
              {money(cost.totalHigh)}, and includes it in the Work Plan.
              {cost.inStockCount
                ? " In-stock parts are available for the job but are excluded from this new-spend authorization."
                : ""}
              {cost.notNeededCount
                ? " Parts marked not needed are excluded."
                : ""}
              {cost.usesAiPartEstimate
                ? " One or more purchase-required part prices are AI estimates; spending above this authorization requires additional approval."
                : ""}
            </>
          ) : (
            <>
              Pricing is incomplete. Request clarification so labor and every purchase-required part have a usable price before this work can be approved.
            </>
          )}
        </div>
      </section>
    );
  }

  function renderParts(finding: InventoryFindingView) {
    if (!finding.mechanicalSuggestedParts.length) {
      return finding.mechanicalPartsRequired ? (
        <div className="text-sm font-semibold text-slate-600">
          <span className="font-black text-slate-800">Parts needed:</span>{" "}
          {finding.mechanicalPartsRequired}
        </div>
      ) : null;
    }

    return (
      <section>
        <div className="text-[10px] font-black uppercase tracking-[0.09em] text-slate-400">
          Parts supporting this approval
        </div>
        <div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {finding.mechanicalSuggestedParts.map((part, index) => {
            const price = partPriceLabel(part);
            const status = partStatusLabel(part);
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
                className={`rounded-xl border p-3 ${
                  disposition === "not_needed"
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
                  <div className="shrink-0 text-right">
                    <div className="text-sm font-black text-slate-900">{price.value}</div>
                    <div
                      className={`mt-0.5 text-[9px] font-black uppercase tracking-[0.06em] ${
                        price.source === "Price needed" ? "text-amber-700" : "text-slate-400"
                      }`}
                    >
                      {price.source}
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span
                      className={`rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.06em] ${status.tone}`}
                    >
                      {status.label}
                    </span>
                    <div className="mt-1.5 text-[10px] font-semibold text-slate-500">
                      {status.detail}
                    </div>
                  </div>
                  {sourceUrl && disposition !== "not_needed" ? (
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
      </section>
    );
  }

  function renderPartnerRouting(finding: InventoryFindingView) {
    if (finding.mechanicalCanPerform === null) {
      return (
        <div className="rounded-xl border border-amber-300 bg-amber-50/70 px-4 py-3 text-sm font-semibold text-amber-900">
          <span className="font-black">Performer confirmation required.</span>{" "}
          Ask {inspector?.displayName || "the mechanic"} whether they can perform this work before approving it.
        </div>
      );
    }

    const needsDifferentPartner = finding.mechanicalCanPerform === false;
    if (!needsDifferentPartner) {
      return (
        <div className="rounded-xl border border-blue-200 bg-blue-50/60 px-4 py-3 text-sm font-semibold text-blue-900">
          <span className="font-black">Partner:</span>{" "}
          {inspector?.displayName || "Assigned mechanic"}
          {inspector?.secondaryLabel ? ` · ${inspector.secondaryLabel}` : ""}
          <span className="text-blue-700"> · Will carry into the Work Plan when approved.</span>
        </div>
      );
    }

    const selectedAlternatePartner = alternatePartners[finding.id] || "";
    return (
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
              selectedAlternatePartner ? "text-emerald-700" : "text-amber-800"
            }`}
          >
            {selectedAlternatePartner ? "Partner selected" : "Alternate partner required"}
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
            selectedAlternatePartner ? "border-emerald-300" : "border-amber-300"
          }`}
        >
          <option value="">Choose partner</option>
          {availablePartners.map((partner) => (
            <option key={partner.id} value={partner.id}>
              {partner.displayName}
              {partner.secondaryLabel ? ` · ${partner.secondaryLabel}` : ""}
            </option>
          ))}
        </select>
        <div
          className={`mt-1.5 text-[10px] font-semibold leading-4 ${
            selectedAlternatePartner ? "text-emerald-700" : "text-amber-800"
          }`}
        >
          {selectedAlternatePartner
            ? "This Partner will carry into the Work Plan and Active Work."
            : `${inspector?.displayName || "The mechanic"} said they cannot perform this work.`}
        </div>
      </div>
    );
  }

  function renderUnresolvedFinding(finding: InventoryFindingView) {
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
    const canApprove = cost.pricingComplete && performerReady;

    return (
      <article
        key={finding.id}
        className={`rounded-2xl border bg-white p-4 shadow-sm sm:p-5 ${
          clarification ? "border-amber-300" : "border-slate-200"
        }`}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h4 className="text-lg font-black leading-6 text-slate-950">{finding.title}</h4>
            {finding.description ? (
              <p className="mt-1 text-sm leading-5 text-slate-600">{finding.description}</p>
            ) : null}
            <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-bold text-slate-400">
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

        <div className="mt-4 space-y-3">
          {renderAssessment(finding)}
          {renderPartnerRouting(finding)}
          {renderApprovalSummary(finding)}
          {renderParts(finding)}
        </div>

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
                    placeholder="Ask about scope, price, parts, or who will perform the work"
                  />
                </label>
              ) : (
                <button
                  type="button"
                  onClick={() =>
                    setOpenNotes((current) => ({ ...current, [finding.id]: true }))
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

          <div className="flex shrink-0 flex-wrap gap-2 border-t border-slate-100 pt-3 lg:border-l lg:border-t-0 lg:pl-3 lg:pt-0">
            <button
              disabled={workingId === finding.id || !canApprove}
              onClick={() => void review(finding, "accept")}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-black text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
              title={
                finding.mechanicalCanPerform === null
                  ? "Mechanic must confirm whether they can perform this work"
                  : !cost.pricingComplete
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
                  {accepted
                    ? `Approved · ${approvalAuthorizationLabel(cost)}${
                        selectedPartner ? ` · ${selectedPartner.displayName}` : ""
                      }`
                    : "Dismissed"}
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
          <div className="mt-3 space-y-3 border-t border-slate-200 pt-3">
            {finding.description ? (
              <p className="text-sm text-slate-600">{finding.description}</p>
            ) : null}
            {renderAssessment(finding)}
            {accepted ? renderApprovalSummary(finding) : null}
            {renderParts(finding)}
            {accepted && selectedPartner ? (
              <div className="text-xs font-semibold text-slate-600">
                <span className="font-black text-slate-800">Partner:</span>{" "}
                {selectedPartner.displayName}
                {selectedPartner.secondaryLabel
                  ? ` · ${selectedPartner.secondaryLabel}`
                  : ""}
              </div>
            ) : null}
            {finding.mechanicalOwnerReviewNotes ? (
              <div className="text-xs font-semibold text-slate-600">
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
            Approve the work, its new-spend authorization, and its Partner before it enters the Work Plan.
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
