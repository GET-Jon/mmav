import { readFileSync, writeFileSync } from "node:fs";

function patchWorkLoader() {
  const path = "lib/partner-portal/work.ts";
  let source = readFileSync(path, "utf8");

  if (!source.includes("ownerPartsReviewComplete: boolean;")) {
    source = source.replace(
      "  partnerPartsConfirmationStatus: string | null;",
      "  partnerPartsConfirmationStatus: string | null;\n  ownerPartsReviewComplete: boolean;",
    );
  }

  source = source.replace(
    "partner_estimate_status,location_id,partner_location_confirmation_status,partner_location_request,partner_parts_confirmation_status,partner_parts_note,partner_completion_notes",
    "partner_estimate_status,parts_review_status,location_id,partner_location_confirmation_status,partner_location_request,partner_parts_confirmation_status,partner_parts_note,partner_completion_notes",
  );

  if (!source.includes("ownerPartsReviewComplete: row.parts_review_status === \"resolved\"")) {
    source = source.replace(
      "        partnerPartsConfirmationStatus: row.partner_parts_confirmation_status,",
      "        partnerPartsConfirmationStatus: row.partner_parts_confirmation_status,\n        ownerPartsReviewComplete: row.parts_review_status === \"resolved\",",
    );
  }

  writeFileSync(path, source, "utf8");
}

function patchPartnerWorkUi() {
  const path = "components/partner/partner-work-list-v4.tsx";
  let source = readFileSync(path, "utf8");
  if (source.includes('data-readiness-truth="owner-v1"')) return;

  const scheduleConfirmedAnchor = '    const scheduleConfirmed = work.partnerConfirmationStatus === "confirmed" && Boolean(work.scheduledStartAt);';
  if (!source.includes(scheduleConfirmedAnchor)) {
    throw new Error("Partner readiness pass could not locate scheduleConfirmed.");
  }
  source = source.replace(
    scheduleConfirmedAnchor,
    scheduleConfirmedAnchor + '\n    const ownerPartsReady = work.ownerPartsReviewComplete;\n    const scheduleDisplayState = scheduleConfirmed ? "scheduled" : awaitingOwnerSchedule && hasRequestedSchedule ? "proposed" : hasRequestedSchedule ? "requested" : "none";',
  );

  source = source.replace(
    /const setupReady = estimateApproved && partsConfirmed(?: && pendingPartRequirements\.length === 0)? && locationConfirmed && scheduleConfirmed;/,
    'const setupReady = estimateApproved && partsConfirmed && ownerPartsReady && locationConfirmed && scheduleConfirmed;',
  );

  const currentActionPattern = /const currentAction = ([^;]+);/;
  const currentMatch = source.match(currentActionPattern);
  if (!currentMatch) throw new Error("Partner readiness pass could not locate currentAction.");
  const currentReplacement = 'const currentAction = needsEstimate ? "Submit your labor estimate" : estimateStatus === "awaiting_review" ? "Waiting for estimate approval" : pendingPartRequirements.length ? "Waiting for Owner to review proposed parts" : !partsConfirmed ? "Confirm the parts plan" : !ownerPartsReady ? "Waiting for Owner to complete Parts Review" : !locationConfirmed ? "Set the work location" : scheduleDisplayState === "none" ? "Choose or suggest a work time" : scheduleDisplayState === "proposed" ? "Waiting for Owner to confirm your proposed time" : !scheduleConfirmed ? "Confirm or adjust the requested time" : inProgress ? "Finish the job and mark it complete" : complete ? "Work complete" : "Ready to begin";';
  source = source.replace(currentActionPattern, currentReplacement);

  source = source.replace(
    '{!hasRequestedSchedule ? <><div className="mt-1 text-sm font-black">No work time proposed yet</div><div className="mt-1 text-xs font-semibold text-slate-500">You can suggest one now. Lot Logic will show conflict-aware available times.</div></> : awaitingOwnerSchedule ? <><div className="mt-1 text-sm font-black">You proposed: {dateTime(work.proposedStartAt)}</div><div className="mt-1 text-xs text-slate-500">Through {dateTime(work.proposedEndAt)}</div><div className="mt-1 text-xs font-bold text-amber-700">Waiting for dealer confirmation.</div></> : <><div className="mt-1 text-sm font-black">Requested: {dateTime(work.proposedStartAt)}</div><div className="mt-1 text-xs text-slate-500">Through {dateTime(work.proposedEndAt)}</div><div className={`mt-1 text-xs font-bold ${scheduleConfirmed ? "text-emerald-700" : "text-amber-700"}`}>{scheduleConfirmed ? `✓ Confirmed for ${dateTime(work.scheduledStartAt)}` : "Confirm this time or choose another available slot."}</div></>}',
    '{scheduleConfirmed ? <><div className="mt-1 text-sm font-black">Scheduled: {dateTime(work.scheduledStartAt)}</div>{work.scheduledEndAt ? <div className="mt-1 text-xs text-slate-500">Through {dateTime(work.scheduledEndAt)}</div> : null}<div className="mt-1 text-xs font-bold text-emerald-700">✓ Confirmed work time</div></> : awaitingOwnerSchedule && hasRequestedSchedule ? <><div className="mt-1 text-sm font-black">You proposed: {dateTime(work.proposedStartAt)}</div><div className="mt-1 text-xs text-slate-500">Through {dateTime(work.proposedEndAt)}</div><div className="mt-1 text-xs font-bold text-amber-700">Waiting for Owner confirmation.</div></> : hasRequestedSchedule ? <><div className="mt-1 text-sm font-black">Requested: {dateTime(work.proposedStartAt)}</div><div className="mt-1 text-xs text-slate-500">Through {dateTime(work.proposedEndAt)}</div><div className="mt-1 text-xs font-bold text-amber-700">Confirm this time or choose another available slot.</div></> : <><div className="mt-1 text-sm font-black">No work time set yet</div><div className="mt-1 text-xs font-semibold text-slate-500">Choose a conflict-aware time for this Work Order.</div></>}',
  );

  source = source.replace(
    '{editingScheduleId === work.id ? "Close" : !hasRequestedSchedule ? "Suggest a work time" : awaitingOwnerSchedule ? "Change proposal" : "Choose another time"}',
    '{editingScheduleId === work.id ? "Close" : scheduleConfirmed ? "Request different time" : !hasRequestedSchedule ? "Choose a work time" : awaitingOwnerSchedule ? "Change proposal" : "Choose another time"}',
  );

  source = source.replace(
    '<div className="text-[9px] font-black uppercase tracking-[0.14em] text-emerald-700">Ready to begin</div>\n              <div className="mt-1 text-lg font-black">Everything is confirmed</div>',
    '<div data-readiness-truth="owner-v1" className="text-[9px] font-black uppercase tracking-[0.14em] text-emerald-700">Ready to begin</div>\n              <div className="mt-1 text-lg font-black">Everything is confirmed</div>',
  );

  source = source.replace(
    '{canStart ? <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-4">',
    '{canStart ? <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-4">',
  );

  source = source.replace(
    /\{!canStart && !inProgress && !complete \? <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700">[^<]*<\/div> : null\}/,
    '{!canStart && !inProgress && !complete ? <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3"><div className="text-[9px] font-black uppercase tracking-[0.12em] text-amber-700">Waiting</div><div className="mt-1 text-sm font-black text-amber-950">{!ownerPartsReady ? "Owner Parts Review is still required" : currentAction}</div><div className="mt-1 text-xs font-semibold text-amber-800">Start work will unlock automatically when every prerequisite is confirmed.</div></div> : null}',
  );

  if (!source.includes('data-readiness-truth="owner-v1"')) {
    source = source.replace(
      '<div className="text-[9px] font-black uppercase tracking-[0.14em] text-emerald-700">Ready to begin</div>',
      '<div data-readiness-truth="owner-v1" className="text-[9px] font-black uppercase tracking-[0.14em] text-emerald-700">Ready to begin</div>',
    );
  }

  writeFileSync(path, source, "utf8");
}

function patchGroupedSummary() {
  const path = "components/partner/partner-work-grouped-v2.tsx";
  let source = readFileSync(path, "utf8");
  if (source.includes('data-collapsed-schedule-state="true"')) return;

  const oldSummary = '{shortDate(work.scheduledStartAt || work.proposedStartAt)}{work.locationName ? ` · ${work.locationName}` : ""}';
  const newSummary = '{work.scheduledStartAt ? <>Scheduled · {shortDate(work.scheduledStartAt)}</> : work.proposedStartAt ? <>Proposed · {shortDate(work.proposedStartAt)}</> : <>Time not set</>}{work.locationName ? ` · ${work.locationName}` : ""}';
  if (!source.includes(oldSummary)) {
    throw new Error("Partner readiness pass could not locate collapsed schedule summary.");
  }
  source = source.replace(oldSummary, newSummary);
  source = source.replace(
    '<div className="mt-1 text-xs font-semibold text-slate-500">{work.scheduledStartAt ?',
    '<div data-collapsed-schedule-state="true" className="mt-1 text-xs font-semibold text-slate-500">{work.scheduledStartAt ?',
  );
  writeFileSync(path, source, "utf8");
}

patchWorkLoader();
patchPartnerWorkUi();
patchGroupedSummary();
console.log("Partner Work readiness, schedule truth, and collapsed schedule state are aligned.");
