"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import type { InventoryFindingView } from "@/lib/mindful-inventory/intake-inspection";

export type OwnerReviewPartnerOption = {
  id: string;
  displayName: string;
  secondaryLabel: string | null;
};

function money(value: number | null) {
  if (value === null) return "TBD";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function sourceLabel(source: string) {
  return source.toLowerCase() === "ai" ? "AI finding" : source.replaceAll("_", " ");
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
  const [notes, setNotes] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      findings.map((finding) => [finding.id, finding.mechanicalOwnerReviewNotes || ""]),
    ),
  );
  const [alternatePartners, setAlternatePartners] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      findings.map((finding) => [finding.id, finding.ownerPreferredPartnerId || ""]),
    ),
  );
  const [openNotes, setOpenNotes] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      findings.map((finding) => [
        finding.id,
        Boolean(finding.mechanicalOwnerReviewStatus === "clarification_requested" || finding.mechanicalOwnerReviewNotes),
      ]),
    ),
  );
  const [openResolved, setOpenResolved] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState("");

  async function review(
    finding: InventoryFindingView,
    decision: "accept" | "clarification" | "dismiss",
  ) {
    const needsDifferentPartner =
      finding.mechanicalCanPerform === false &&
      finding.mechanicalValidationStatus !== "not_found";

    if (decision === "clarification" && !(notes[finding.id] || "").trim()) {
      setOpenNotes((current) => ({ ...current, [finding.id]: true }));
      setMessage("Add the question or clarification you want the inspector to answer.");
      return;
    }

    if (
      decision === "accept" &&
      needsDifferentPartner &&
      !(alternatePartners[finding.id] || "").trim()
    ) {
      setMessage(`Choose who should handle ${finding.title} before routing the work.`);
      return;
    }

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
            notes: notes[finding.id] || "",
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

      setMessage(
        decision === "accept"
          ? needsDifferentPartner
            ? `${finding.title} approved and routed.`
            : `${finding.title} accepted.`
          : decision === "dismiss"
            ? `${finding.title} dismissed from the mechanical scope.`
            : `Clarification requested from the inspector for ${finding.title}.`,
      );
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Finding review could not be saved.",
      );
    } finally {
      setWorkingId(null);
    }
  }

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

  function renderFacts(finding: InventoryFindingView) {
    const needsDifferentPartner =
      finding.mechanicalCanPerform === false &&
      finding.mechanicalValidationStatus !== "not_found";

    return (
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 border-y border-slate-100 py-3 text-xs font-semibold text-slate-600">
        <span>
          <span className="text-slate-400">Inspector can perform:</span>{" "}
          <span className={needsDifferentPartner ? "font-black text-amber-800" : "font-black text-slate-800"}>
            {finding.mechanicalCanPerform === null
              ? "Unknown"
              : finding.mechanicalCanPerform
                ? "Yes"
                : "No"}
          </span>
        </span>
        <span>
          <span className="text-slate-400">Labor:</span>{" "}
          <span className="font-black text-slate-800">
            {finding.mechanicalLaborHours === null
              ? "TBD"
              : `${finding.mechanicalLaborHours} hr`}
          </span>
        </span>
        <span>
          <span className="text-slate-400">Estimate:</span>{" "}
          <span className="font-black text-slate-800">
            {money(finding.mechanicalProposedLaborPrice)}
          </span>
        </span>
        {finding.mechanicalRecommendedAction ? (
          <span className="min-w-0 sm:flex-1">
            <span className="text-slate-400">Recommended:</span>{" "}
            <span className="font-black text-slate-800">
              {finding.mechanicalRecommendedAction}
            </span>
          </span>
        ) : null}
      </div>
    );
  }

  function renderParts(finding: InventoryFindingView) {
    if (finding.mechanicalSuggestedParts.length) {
      return (
        <div className="mt-3">
          <div className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-400">
            Suggested parts
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {finding.mechanicalSuggestedParts.map((part, index) => (
              <span
                key={`${part.description}-${index}`}
                className="rounded-lg bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700"
              >
                <span className="font-black">
                  {part.quantity}× {part.description}
                </span>
                {part.partNumber ? ` · #${part.partNumber}` : ""}
                {part.notes ? ` · ${part.notes}` : ""}
              </span>
            ))}
          </div>
        </div>
      );
    }

    if (finding.mechanicalPartsRequired) {
      return (
        <div className="mt-3 text-xs font-semibold text-slate-600">
          <span className="font-black text-slate-800">Parts needed:</span>{" "}
          {finding.mechanicalPartsRequired}
        </div>
      );
    }

    return null;
  }

  function renderUnresolvedFinding(finding: InventoryFindingView) {
    const clarification =
      finding.mechanicalOwnerReviewStatus === "clarification_requested";
    const needsDifferentPartner =
      finding.mechanicalCanPerform === false &&
      finding.mechanicalValidationStatus !== "not_found";
    const noteOpen = Boolean(openNotes[finding.id]);

    return (
      <article
        key={finding.id}
        className={`rounded-2xl border bg-white p-4 shadow-sm sm:p-5 ${
          clarification ? "border-amber-300" : "border-slate-200"
        }`}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h4 className="text-base font-black leading-6 text-slate-950">
              {finding.title}
            </h4>
            {finding.description ? (
              <p className="mt-1 text-sm leading-5 text-slate-600">
                {finding.description}
              </p>
            ) : null}
            <div className="mt-2 text-[10px] font-bold text-slate-400">
              {sourceLabel(finding.source)}
              {finding.mechanicalValidationStatus
                ? ` · ${finding.mechanicalValidationStatus.replaceAll("_", " ")}`
                : ""}
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

        {finding.mechanicalValidationNotes ? (
          <div className="mt-3 text-xs font-semibold leading-5 text-slate-500">
            <span className="font-black text-slate-700">Mechanic note:</span>{" "}
            {finding.mechanicalValidationNotes}
          </div>
        ) : null}

        {renderFacts(finding)}
        {renderParts(finding)}

        {needsDifferentPartner ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/70 p-3.5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div className="text-xs font-black text-amber-950">
                  Assign alternate partner
                </div>
                <div className="mt-0.5 text-[11px] font-semibold text-amber-800">
                  The inspector cannot perform this work. Your selection carries into the Work Plan and Active Work.
                </div>
              </div>

              <select
                value={alternatePartners[finding.id] || ""}
                onChange={(event) =>
                  setAlternatePartners((current) => ({
                    ...current,
                    [finding.id]: event.target.value,
                  }))
                }
                className="w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-bold text-slate-800 lg:w-[320px]"
              >
                <option value="">Choose alternate partner</option>
                {availablePartners.map((partner) => (
                  <option key={partner.id} value={partner.id}>
                    {partner.displayName}
                    {partner.secondaryLabel ? ` · ${partner.secondaryLabel}` : ""}
                  </option>
                ))}
              </select>
            </div>

            {!availablePartners.length ? (
              <div className="mt-2 text-xs font-bold text-red-700">
                No other active partners are available. Add or enable a partner in Admin → Partners before routing this work.
              </div>
            ) : null}
          </div>
        ) : null}

        {clarification && finding.mechanicalOwnerReviewNotes ? (
          <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
            <span className="font-black">Question sent:</span>{" "}
            {finding.mechanicalOwnerReviewNotes}
          </div>
        ) : null}

        <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 lg:flex-row lg:items-end lg:justify-between">
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
                  placeholder="Add context, or type the question for the inspector"
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

          <div className="flex flex-wrap gap-2">
            <button
              disabled={
                workingId === finding.id ||
                (needsDifferentPartner && !(alternatePartners[finding.id] || ""))
              }
              onClick={() => void review(finding, "accept")}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-black text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {needsDifferentPartner ? "Approve & Route" : "Accept Finding"}
            </button>
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
              className="rounded-lg border border-amber-300 bg-white px-4 py-2 text-xs font-black text-amber-800 hover:bg-amber-50 disabled:opacity-40"
            >
              Request Clarification
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
      (partner) =>
        partner.id ===
        (finding.ownerPreferredPartnerId || alternatePartners[finding.id]),
    );
    const needsDifferentPartner =
      finding.mechanicalCanPerform === false &&
      finding.mechanicalValidationStatus !== "not_found";

    const summaryBits = [
      accepted ? "Accepted" : "Dismissed",
      accepted && needsDifferentPartner && selectedPartner
        ? `Routed to ${selectedPartner.displayName}`
        : accepted && finding.mechanicalCanPerform
          ? "Inspector will perform"
          : null,
      finding.mechanicalLaborHours !== null
        ? `${finding.mechanicalLaborHours} hr`
        : null,
      finding.mechanicalProposedLaborPrice !== null
        ? money(finding.mechanicalProposedLaborPrice)
        : null,
    ].filter(Boolean);

    return (
      <article
        key={finding.id}
        className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-start gap-2">
              <span className={`mt-0.5 font-black ${accepted ? "text-emerald-600" : "text-slate-400"}`}>
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
            {renderParts(finding)}
            {accepted && needsDifferentPartner && selectedPartner ? (
              <div className="mt-3 text-xs font-semibold text-slate-600">
                <span className="font-black text-slate-800">Preferred partner:</span>{" "}
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
              ? `${unresolvedFindings.length} decision${unresolvedFindings.length === 1 ? "" : "s"} remaining`
              : "Owner review complete"}
          </div>
          <div className="mt-1 text-xs font-semibold text-slate-500">
            Resolve each open finding before accepting the mechanical inspection.
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
