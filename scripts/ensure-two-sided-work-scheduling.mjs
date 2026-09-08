import { readFileSync, writeFileSync } from "node:fs";

function patchFile(path, transform) {
  const source = readFileSync(path, "utf8");
  const updated = transform(source);
  if (updated !== source) {
    writeFileSync(path, updated, "utf8");
    return true;
  }
  return false;
}

let changed = false;

changed = patchFile("lib/mindful-inventory/active-work.ts", (source) => source
  .replace('partnerConfirmationStatus: "awaiting_partner" | "confirmed" | "declined" | null;', 'partnerConfirmationStatus: "awaiting_partner" | "awaiting_owner" | "confirmed" | "declined" | null;')
  .replace('scheduleSource: "suggested" | "manual" | null;', 'scheduleSource: "suggested" | "manual" | "partner" | null;')) || changed;

changed = patchFile("app/api/partner/work-orders/[workOrderId]/schedule/route.ts", (source) => {
  let updated = source;
  const oldUpdate = `    const { data: updated, error: updateError } = await admin
      .from("mindful_inventory_work_orders")
      .update({
        proposed_start_at: requestedStartAt,
        proposed_end_at: requestedEndAt,
        scheduled_start_at: startAt,
        scheduled_end_at: endAt,
        partner_confirmation_status: "confirmed",
        schedule_source: scheduleChanged ? "partner" : "manual",
        status: work.status === "ready_to_schedule" ? "scheduled" : work.status,
        updated_at: now,
        updated_by: user.id,
      })`;
  const newUpdate = `    const partnerIsConfirmingDealerProposal = Boolean(requestedStartAt && requestedEndAt && !scheduleChanged);
    const scheduleUpdate = partnerIsConfirmingDealerProposal
      ? {
          proposed_start_at: requestedStartAt,
          proposed_end_at: requestedEndAt,
          scheduled_start_at: startAt,
          scheduled_end_at: endAt,
          partner_confirmation_status: "confirmed",
          schedule_source: work.proposed_start_at ? "suggested" : "manual",
          status: work.status === "ready_to_schedule" ? "scheduled" : work.status,
          updated_at: now,
          updated_by: user.id,
        }
      : {
          proposed_start_at: startAt,
          proposed_end_at: endAt,
          scheduled_start_at: null,
          scheduled_end_at: null,
          partner_confirmation_status: "awaiting_owner",
          schedule_source: "partner",
          status: "ready_to_schedule",
          updated_at: now,
          updated_by: user.id,
        };

    const { data: updated, error: updateError } = await admin
      .from("mindful_inventory_work_orders")
      .update(scheduleUpdate)`;
  if (updated.includes(oldUpdate)) updated = updated.replace(oldUpdate, newUpdate);

  updated = updated.replace(
    'summary: `${partnerLabel} changed the proposed work schedule.`,',
    'summary: `${partnerLabel} proposed a work time for Owner confirmation.`,',
  );
  updated = updated.replace(
    'automaticallyAccepted: true,',
    'automaticallyAccepted: false,',
  );
  return updated;
}) || changed;

changed = patchFile("app/api/mindful/inventory/work-orders/[workOrderId]/schedule/route.ts", (source) => {
  let updated = source;
  updated = updated.replace(
    '.select("id,vehicle_id,status,estimated_elapsed_minutes,estimated_duration_minutes,assigned_partner_id,assigned_user_id,location_id,resource_id,parts_review_status,partner_estimate_status")',
    '.select("id,vehicle_id,status,estimated_elapsed_minutes,estimated_duration_minutes,assigned_partner_id,assigned_user_id,location_id,resource_id,parts_review_status,partner_estimate_status,proposed_start_at,proposed_end_at,partner_confirmation_status,schedule_source")',
  );
  const durationAnchor = `    const duration = Number(existing.estimated_elapsed_minutes ?? existing.estimated_duration_minutes ?? 60);
    const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 60;
    const end = new Date(start.getTime() + safeDuration * 60_000);`;
  if (updated.includes(durationAnchor) && !updated.includes("const acceptingPartnerProposal")) {
    updated = updated.replace(durationAnchor, `${durationAnchor}
    const acceptingPartnerProposal = existing.partner_confirmation_status === "awaiting_owner"
      && Boolean(existing.proposed_start_at && existing.proposed_end_at)
      && new Date(existing.proposed_start_at).getTime() === start.getTime();`);
  }
  const branchOld = `    const update = isPartnerWork
      ? {
          proposed_start_at: start.toISOString(),
          proposed_end_at: end.toISOString(),
          scheduled_start_at: null,
          scheduled_end_at: null,
          partner_confirmation_status: "awaiting_partner",
          schedule_source: "suggested",
          status: "ready_to_schedule",
          updated_by: access.userId,
          updated_at: now,
        }
      : {`;
  const branchNew = `    const update = isPartnerWork
      ? acceptingPartnerProposal
        ? {
            proposed_start_at: existing.proposed_start_at,
            proposed_end_at: existing.proposed_end_at,
            scheduled_start_at: existing.proposed_start_at,
            scheduled_end_at: existing.proposed_end_at,
            partner_confirmation_status: "confirmed",
            schedule_source: "partner",
            status: "scheduled",
            updated_by: access.userId,
            updated_at: now,
          }
        : {
            proposed_start_at: start.toISOString(),
            proposed_end_at: end.toISOString(),
            scheduled_start_at: null,
            scheduled_end_at: null,
            partner_confirmation_status: "awaiting_partner",
            schedule_source: "suggested",
            status: "ready_to_schedule",
            updated_by: access.userId,
            updated_at: now,
          }
      : {`;
  if (updated.includes(branchOld)) updated = updated.replace(branchOld, branchNew);
  return updated;
}) || changed;

changed = patchFile("components/mindful-inventory/inventory-active-work-v6.tsx", (source) => {
  let updated = source;
  updated = updated.replace(
    'if (work.partnerConfirmationStatus === "awaiting_partner") return `Waiting for ${work.performerName || "partner"} to confirm timing`;\n  if (!work.scheduledStartAt) return "Schedule the work";',
    'if (work.partnerConfirmationStatus === "awaiting_owner") return `${work.performerName || "Partner"} proposed a work time`;\n  if (work.partnerConfirmationStatus === "awaiting_partner") return `Waiting for ${work.performerName || "partner"} to confirm timing`;\n  if (!work.scheduledStartAt) return "Schedule the work";',
  );
  updated = updated.replace(
    'if (work.partnerConfirmationStatus === "awaiting_partner") return { label: "Awaiting Partner", cls: "bg-blue-100 text-blue-800" };',
    'if (work.partnerConfirmationStatus === "awaiting_owner") return { label: "Schedule Approval", cls: "bg-amber-100 text-amber-800" };\n  if (work.partnerConfirmationStatus === "awaiting_partner") return { label: "Awaiting Partner", cls: "bg-blue-100 text-blue-800" };',
  );

  const scheduleOld = `{(scheduleActive || editing) && work.partsReviewComplete && work.performerName && quoteComplete && work.locationId ? <div className="mt-2 rounded-lg border border-slate-200 bg-white p-3"><div className="mb-2 text-[10px] font-black uppercase text-slate-400">5 · Schedule</div>{!work.partsReadyForExecution ? <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">Locked until all required parts are received. {partsPendingLabel(work)}</div> : <div className="flex flex-col gap-2 sm:flex-row"><input disabled={workingId === work.id} type="datetime-local" value={draftValue} onChange={(event) => setScheduleDrafts((current) => ({ ...current, [work.id]: event.target.value }))} className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs font-bold" /><button disabled={workingId === work.id || !draftValue} onClick={() => void scheduleWork(work, draftValue)} className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-black text-white disabled:bg-slate-200 disabled:text-slate-400">{work.scheduledStartAt ? "Save New Time" : "Save Schedule"}</button></div>}</div> : null}`;
  const scheduleNew = `{(scheduleActive || editing) && work.partsReviewComplete && work.performerName && quoteComplete && work.locationId ? <div className="mt-2 rounded-lg border border-slate-200 bg-white p-3"><div className="mb-2 text-[10px] font-black uppercase text-slate-400">5 · Schedule</div>{!work.partsReadyForExecution ? <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">Locked until all required parts are received. {partsPendingLabel(work)}</div> : <>{work.partnerConfirmationStatus === "awaiting_owner" && work.proposedStartAt ? <div className="mb-3 flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"><div><div className="text-xs font-black text-amber-900">{work.performerName || "Partner"} proposed {dateTimeLabel(work.proposedStartAt)}</div><div className="mt-0.5 text-[11px] font-semibold text-amber-800">Accept it, or choose a different time to send back for partner confirmation.</div></div><button disabled={workingId === work.id} onClick={() => void scheduleWork(work, localInput(work.proposedStartAt))} className="shrink-0 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-black text-white disabled:opacity-50">Accept Partner Time</button></div> : null}<div className="flex flex-col gap-2 sm:flex-row"><input disabled={workingId === work.id} type="datetime-local" value={draftValue} onChange={(event) => setScheduleDrafts((current) => ({ ...current, [work.id]: event.target.value }))} className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs font-bold" /><button disabled={workingId === work.id || !draftValue} onClick={() => void scheduleWork(work, draftValue)} className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-black text-white disabled:bg-slate-200 disabled:text-slate-400">{work.partnerConfirmationStatus === "awaiting_owner" ? "Suggest Different Time" : work.scheduledStartAt ? "Save New Time" : "Propose Time"}</button></div></>}</div> : null}`;
  if (updated.includes(scheduleOld)) updated = updated.replace(scheduleOld, scheduleNew);
  return updated;
}) || changed;

changed = patchFile("components/partner/partner-work-list-v4.tsx", (source) => {
  let updated = source;
  updated = updated.replace(
    'const scheduleConfirmed = work.partnerConfirmationStatus === "confirmed" && Boolean(work.scheduledStartAt);',
    'const scheduleConfirmed = work.partnerConfirmationStatus === "confirmed" && Boolean(work.scheduledStartAt);\n    const awaitingOwnerSchedule = work.partnerConfirmationStatus === "awaiting_owner";',
  );
  updated = updated.replace(
    '!hasRequestedSchedule ? "Waiting for the dealer to propose a work time" : !scheduleConfirmed ? "Confirm or adjust the requested time"',
    '!hasRequestedSchedule ? "Choose or suggest a work time" : awaitingOwnerSchedule ? "Waiting for the dealer to confirm your proposed time" : !scheduleConfirmed ? "Confirm or adjust the requested time"',
  );

  const scheduleBlockOld = `<div className={\`rounded-xl border p-4 \${hasRequestedSchedule && !scheduleConfirmed ? "border-amber-300 bg-amber-50/40" : "border-slate-200"}\`}><div className="flex items-start justify-between gap-3"><div><div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">4 · Schedule</div>{!hasRequestedSchedule ? <><div className="mt-1 text-sm font-black">Awaiting dealer schedule</div><div className="mt-1 text-xs font-semibold text-slate-500">There is nothing for you to confirm yet.</div></> : <><div className="mt-1 text-sm font-black">Requested: {dateTime(work.proposedStartAt)}</div><div className="mt-1 text-xs text-slate-500">Through {dateTime(work.proposedEndAt)}</div><div className={\`mt-1 text-xs font-bold \${scheduleConfirmed ? "text-emerald-700" : "text-amber-700"}\`}>{scheduleConfirmed ? \`✓ Confirmed for \${dateTime(work.scheduledStartAt)}\` : "Confirm this time or choose another available slot."}</div></>}</div>{permissions.rescheduleWork && hasRequestedSchedule && !["in_progress", "complete", "cancelled"].includes(work.status) ? <div className="flex gap-2">{!scheduleConfirmed ? <button disabled={workingId === work.id} onClick={() => void confirmSchedule(work)} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-black text-white">Confirm</button> : null}<button onClick={() => openSchedule(work)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-black">{editingScheduleId === work.id ? "Close" : "Choose another time"}</button></div> : null}</div>`;
  const scheduleBlockNew = `<div className={\`rounded-xl border p-4 \${!scheduleConfirmed ? "border-amber-300 bg-amber-50/40" : "border-slate-200"}\`}><div className="flex items-start justify-between gap-3"><div><div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">4 · Schedule</div>{!hasRequestedSchedule ? <><div className="mt-1 text-sm font-black">No work time proposed yet</div><div className="mt-1 text-xs font-semibold text-slate-500">You can suggest one now. Lot Logic will show conflict-aware available times.</div></> : awaitingOwnerSchedule ? <><div className="mt-1 text-sm font-black">You proposed: {dateTime(work.proposedStartAt)}</div><div className="mt-1 text-xs text-slate-500">Through {dateTime(work.proposedEndAt)}</div><div className="mt-1 text-xs font-bold text-amber-700">Waiting for dealer confirmation.</div></> : <><div className="mt-1 text-sm font-black">Requested: {dateTime(work.proposedStartAt)}</div><div className="mt-1 text-xs text-slate-500">Through {dateTime(work.proposedEndAt)}</div><div className={\`mt-1 text-xs font-bold \${scheduleConfirmed ? "text-emerald-700" : "text-amber-700"}\`}>{scheduleConfirmed ? \`✓ Confirmed for \${dateTime(work.scheduledStartAt)}\` : "Confirm this time or choose another available slot."}</div></>}</div>{permissions.rescheduleWork && !["in_progress", "complete", "cancelled"].includes(work.status) ? <div className="flex gap-2">{hasRequestedSchedule && !scheduleConfirmed && !awaitingOwnerSchedule ? <button disabled={workingId === work.id} onClick={() => void confirmSchedule(work)} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-black text-white">Confirm</button> : null}<button onClick={() => openSchedule(work)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-black">{editingScheduleId === work.id ? "Close" : !hasRequestedSchedule ? "Suggest a work time" : awaitingOwnerSchedule ? "Change proposal" : "Choose another time"}</button></div> : null}</div>`;
  if (updated.includes(scheduleBlockOld)) updated = updated.replace(scheduleBlockOld, scheduleBlockNew);

  updated = updated.replace(
    'onClick={() => void saveScheduleValues(work, schedule.startAt, schedule.endAt, "Schedule updated and confirmed.")}',
    'onClick={() => void saveScheduleValues(work, schedule.startAt, schedule.endAt, hasRequestedSchedule && !awaitingOwnerSchedule ? "Schedule response saved." : "Work time proposed to the dealer for confirmation.")}',
  );
  updated = updated.replace('>Save time</button>', '>{awaitingOwnerSchedule || !hasRequestedSchedule ? "Propose time" : "Save time"}</button>');
  return updated;
}) || changed;

console.log(changed ? "Enabled two-sided Owner / Partner work-time proposals." : "Two-sided work scheduling already applied.");
