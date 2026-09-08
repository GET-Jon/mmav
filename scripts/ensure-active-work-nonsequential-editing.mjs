import { readFileSync, writeFileSync } from "node:fs";

function patchFile(path, patcher, label) {
  let source = readFileSync(path, "utf8");
  const original = source;
  source = patcher(source);
  if (source !== original) {
    writeFileSync(path, source, "utf8");
    console.log(`Enabled ${label}.`);
  } else {
    console.log(`${label} already enabled.`);
  }
}

function ownerUiPatch(source) {
  // Opening a tile should always expose that tile's editor, regardless of which
  // setup step Lot Logic currently considers "next".
  source = source.replaceAll(
    `(partnerActive || editingStep === 2) && work.partsReviewComplete`,
    `(partnerActive || editingStep === 2)`,
  );
  source = source.replaceAll(
    `(quoteActive || editingStep === 3) && work.partsReviewComplete && work.performerName`,
    `(quoteActive || editingStep === 3)`,
  );
  source = source.replaceAll(
    `(locationActive || editingStep === 4) && work.partsReviewComplete && work.performerName && quoteComplete`,
    `(locationActive || editingStep === 4)`,
  );
  source = source.replaceAll(
    `(scheduleActive || editingStep === 5) && work.partsReviewComplete && work.performerName && quoteComplete && work.locationId`,
    `(scheduleActive || editingStep === 5)`,
  );
  source = source.replaceAll(
    `(scheduleActive || editingStep === 5) && work.partsReviewComplete && work.performerName && work.locationId`,
    `(scheduleActive || editingStep === 5)`,
  );

  // Quote can be inspected before a Partner is assigned; make that state explicit
  // rather than incorrectly calling it internal work.
  source = source.replace(
    `{!work.assignedPartnerId ? <div className="text-xs font-bold text-emerald-700">✓ Internal Mindful work · quote not required.</div> : work.partnerEstimateStatus === "awaiting_review" ?`,
    `{!work.performerName ? <div className="text-xs font-bold text-slate-600">No Partner assigned yet. Assign one when you are ready to request or review a labor quote.</div> : !work.assignedPartnerId ? <div className="text-xs font-bold text-emerald-700">✓ Internal Mindful work · quote not required.</div> : work.partnerEstimateStatus === "awaiting_review" ?`,
  );

  // Scheduling is a planning decision and is NEVER locked. Parts / quote readiness
  // become guidance only; execution readiness is still enforced when work starts.
  const unlockedSchedule = `<div>{!work.partsReadyForExecution ? <div className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">Scheduling guidance: required parts are not ready yet. {partsPendingLabel(work)} You can still change the work time.</div> : null}{estimate ? <div className="mb-2 rounded-lg bg-violet-50 px-3 py-2 text-xs font-bold text-violet-800">Scheduling guidance: {estimate}. You can still propose or change the work time.</div> : null}<div className="flex flex-col gap-2 sm:flex-row"><input disabled={workingId === work.id} type="datetime-local" value={draftValue} onChange={(event) => setScheduleDrafts((current) => ({ ...current, [work.id]: event.target.value }))} className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs font-bold" /><button disabled={workingId === work.id || !draftValue} onClick={() => void scheduleWork(work, draftValue)} className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-black text-white disabled:bg-slate-200 disabled:text-slate-400">{work.scheduledStartAt || work.proposedStartAt ? "Propose New Time" : "Propose Time"}</button></div></div>`;

  source = source.replace(
    `{!work.partsReadyForExecution ? <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">Locked until all required parts are received. {partsPendingLabel(work)}</div> : <div className="flex flex-col gap-2 sm:flex-row"><input disabled={workingId === work.id} type="datetime-local" value={draftValue} onChange={(event) => setScheduleDrafts((current) => ({ ...current, [work.id]: event.target.value }))} className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs font-bold" /><button disabled={workingId === work.id || !draftValue} onClick={() => void scheduleWork(work, draftValue)} className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-black text-white disabled:bg-slate-200 disabled:text-slate-400">{work.scheduledStartAt ? "Save New Time" : "Save Schedule"}</button></div>}`,
    unlockedSchedule,
  );
  source = source.replace(
    `{!work.partsReadyForExecution ? <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">Locked until all required parts are received. {partsPendingLabel(work)}</div> : estimate ? <div className="rounded-lg bg-violet-50 px-3 py-2 text-xs font-bold text-violet-800">Locked: {estimate}.</div> : <div className="flex flex-col gap-2 sm:flex-row"><input disabled={workingId === work.id} type="datetime-local" value={draftValue} onChange={(event) => setScheduleDrafts((current) => ({ ...current, [work.id]: event.target.value }))} className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs font-bold" /><button disabled={workingId === work.id || !draftValue} onClick={() => void scheduleWork(work, draftValue)} className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-black text-white disabled:bg-slate-200 disabled:text-slate-400">{work.scheduledStartAt ? "Save New Time" : "Save Schedule"}</button></div>}`,
    unlockedSchedule,
  );

  source = source.replace(
    `Select Parts, Partner, Quote, Location, or Schedule above to review or change it.`,
    `Every setup tile is independent. Select Parts, Partner, Quote, Location, or Schedule at any time to review or change it.`,
  );

  return source;
}

function workOrderRoutePatch(source) {
  // Planning fields are intentionally independent. Execution readiness remains
  // enforced only when status moves to in_progress.
  source = source.replace(/\n    if \(performerKey !== undefined && existing\.parts_review_status !== "resolved"\) \{\n      return NextResponse\.json\(\{ error: "Resolve Parts Review before assigning the performer\." \}, \{ status: 409 \}\);\n    \}\n/, "\n");
  source = source.replace(/\n    if \(locationProvided && !existing\.assigned_partner_id && !existing\.assigned_user_id && performerKey === undefined\) \{\n      return NextResponse\.json\(\{ error: "Assign the performer before choosing the work location\." \}, \{ status: 409 \}\);\n    \}\n/, "\n");
  source = source.replace(
    `      if (!effectiveHasPerformer && locationId) return NextResponse.json({ error: "Assign the performer before choosing the work location." }, { status: 409 });\n`,
    ``,
  );

  // Respect a location the Owner already chose before assigning a Partner.
  source = source.replace(
    `        if (!locationProvided) {\n          const { data: primary } = await access.supabase`,
    `        if (!locationProvided && !existing.location_id) {\n          const { data: primary } = await access.supabase`,
  );

  return source;
}

function scheduleRoutePatch(source) {
  // Scheduling is planning, not execution authorization. Preserve collision checks,
  // but never block a proposed time because parts / quote / location are unfinished.
  source = source.replace(`import { summarizePartsReadiness } from "@/lib/mindful-inventory/parts-readiness";\n`, ``);

  source = source.replace(
    `.select("id,vehicle_id,status,estimated_elapsed_minutes,estimated_duration_minutes,assigned_partner_id,assigned_user_id,location_id,resource_id,parts_review_status,partner_estimate_status")`,
    `.select("id,vehicle_id,status,estimated_elapsed_minutes,estimated_duration_minutes,assigned_partner_id,assigned_user_id,location_id,resource_id,parts_review_status,partner_estimate_status,scheduled_start_at,scheduled_end_at,proposed_start_at,proposed_end_at,partner_confirmation_status")`,
  );

  source = source.replace(
    /\n    if \(existing\.parts_review_status !== "resolved"\) \{[\s\S]*?\n    const duration = Number\(existing\.estimated_elapsed_minutes \?\? existing\.estimated_duration_minutes \?\? 60\);/,
    `\n    const duration = Number(existing.estimated_elapsed_minutes ?? existing.estimated_duration_minutes ?? 60);`,
  );

  // Keep an explicit audit trail of every time/date change so missed, superseded,
  // proposed, countered, and confirmed times remain reconstructable in History.
  source = source.replace(
    `      metadata: { proposedStartAt: isPartnerWork ? start.toISOString() : null, scheduledStartAt: isPartnerWork ? null : start.toISOString(), endAt: end.toISOString(), elapsedMinutes: safeDuration },`,
    `      metadata: {\n        previousScheduledStartAt: existing.scheduled_start_at || null,\n        previousScheduledEndAt: existing.scheduled_end_at || null,\n        previousProposedStartAt: existing.proposed_start_at || null,\n        previousProposedEndAt: existing.proposed_end_at || null,\n        previousPartnerConfirmationStatus: existing.partner_confirmation_status || null,\n        proposedStartAt: isPartnerWork ? start.toISOString() : null,\n        scheduledStartAt: isPartnerWork ? null : start.toISOString(),\n        endAt: end.toISOString(),\n        elapsedMinutes: safeDuration,\n        changedAt: now,\n      },`,
  );

  source = source.replace(
    `        : "Work Order scheduled after parts, Partner, and location readiness were confirmed.",`,
    `        : "Work Order scheduled as an Owner planning decision; execution prerequisites remain independently enforced.",`,
  );

  return source;
}

patchFile("components/mindful-inventory/inventory-active-work-v6.tsx", ownerUiPatch, "non-sequential Owner setup editing");
patchFile("app/api/mindful/inventory/work-orders/[workOrderId]/route.ts", workOrderRoutePatch, "non-sequential Work Order planning");
patchFile("app/api/mindful/inventory/work-orders/[workOrderId]/schedule/route.ts", scheduleRoutePatch, "non-sequential Work Order scheduling");
