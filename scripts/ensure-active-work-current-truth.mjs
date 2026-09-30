import { readFileSync, writeFileSync } from "node:fs";

function patchActiveWork() {
  const path = "components/mindful-inventory/inventory-active-work-v6.tsx";
  let source = readFileSync(path, "utf8");

  if (!source.includes('if (!work.partsReviewComplete) return null;')) {
    source = source.replace(
      'function partsPendingLabel(work: InventoryWorkOrderView) {\n  if (work.partsReadyForExecution) return null;',
      'function partsPendingLabel(work: InventoryWorkOrderView) {\n  if (!work.partsReviewComplete) return null;\n  if (work.partsReadyForExecution) return null;',
    );
  }

  if (!source.includes('function hasPendingScheduleProposal(work: InventoryWorkOrderView)')) {
    source = source.replace(
      'function behindScheduleLabel(work: InventoryWorkOrderView, nowMs = Date.now()) {',
      'function hasPendingScheduleProposal(work: InventoryWorkOrderView) {\n  return Boolean(work.proposedStartAt) && ["awaiting_owner", "awaiting_partner"].includes(work.partnerConfirmationStatus || "");\n}\n\nfunction behindScheduleLabel(work: InventoryWorkOrderView, nowMs = Date.now()) {',
    );
  }

  source = source.replace(
    '  if (!work.scheduledStartAt || ["complete", "cancelled"].includes(work.status)) return null;\n  if (work.partnerConfirmationStatus === "awaiting_owner" && work.proposedStartAt) return null;',
    '  if (!work.scheduledStartAt || ["complete", "cancelled"].includes(work.status)) return null;\n  if (hasPendingScheduleProposal(work)) return null;',
  );
  source = source.replace(
    '  if (!work.scheduledStartAt || ["complete", "cancelled"].includes(work.status)) return null;',
    '  if (!work.scheduledStartAt || ["complete", "cancelled"].includes(work.status)) return null;\n  if (hasPendingScheduleProposal(work)) return null;',
  );

  source = source.replaceAll(
    'active={!work.scheduledStartAt && (Boolean(work.proposedStartAt) || scheduleActive)}',
    'active={hasPendingScheduleProposal(work) || (!work.scheduledStartAt && (Boolean(work.proposedStartAt) || scheduleActive))}',
  );
  source = source.replaceAll(
    'active={work.partnerConfirmationStatus === "awaiting_owner" || (!work.scheduledStartAt && (Boolean(work.proposedStartAt) || scheduleActive))}',
    'active={hasPendingScheduleProposal(work) || (!work.scheduledStartAt && (Boolean(work.proposedStartAt) || scheduleActive))}',
  );
  source = source.replaceAll(
    'done={Boolean(work.scheduledStartAt)}',
    'done={Boolean(work.scheduledStartAt) && !hasPendingScheduleProposal(work)}',
  );
  source = source.replaceAll(
    'done={Boolean(work.scheduledStartAt) && work.partnerConfirmationStatus !== "awaiting_owner"}',
    'done={Boolean(work.scheduledStartAt) && !hasPendingScheduleProposal(work)}',
  );

  source = source.replaceAll(
    'Scheduling guidance: required parts are not ready yet.',
    'Scheduling guidance: parts setup is not complete yet.',
  );

  source = source.replaceAll(
    'work.scheduledStartAt || work.proposedStartAt',
    '(hasPendingScheduleProposal(work) ? work.proposedStartAt : work.scheduledStartAt || work.proposedStartAt)',
  );
  source = source.replaceAll(
    '(work.partnerConfirmationStatus === "awaiting_owner" && work.proposedStartAt ? work.proposedStartAt : work.scheduledStartAt || work.proposedStartAt)',
    '(hasPendingScheduleProposal(work) ? work.proposedStartAt : work.scheduledStartAt || work.proposedStartAt)',
  );

  source = source.replaceAll(
    'detail={work.scheduledStartAt ? dateTimeLabel(work.scheduledStartAt) : undefined}',
    'detail={hasPendingScheduleProposal(work) && work.proposedStartAt ? `Pending · ${dateTimeLabel(work.proposedStartAt)}` : work.scheduledStartAt ? dateTimeLabel(work.scheduledStartAt) : undefined}',
  );

  if (!source.includes('Current schedule:')) {
    source = source.replaceAll(
      '<div className="mb-2 text-[10px] font-black uppercase text-slate-400">5 · Schedule</div>',
      '<div className="mb-2 text-[10px] font-black uppercase text-slate-400">5 · Schedule</div>{hasPendingScheduleProposal(work) && work.proposedStartAt ? <div className="mb-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-800">Pending proposed time: {dateTimeLabel(work.proposedStartAt)}{work.scheduledStartAt ? ` · Previous confirmed time: ${dateTimeLabel(work.scheduledStartAt)}` : ""}</div> : work.scheduledStartAt ? <div className="mb-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800">Current schedule: {dateTimeLabel(work.scheduledStartAt)}{work.assignedPartnerId ? " · Confirmed" : ""}</div> : <div className="mb-2 rounded-lg bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600">No confirmed time yet.</div>}',
    );
  }

  if (!source.includes('locationDrafts, setLocationDrafts')) {
    source = source.replace(
      '  const [scheduleDrafts, setScheduleDrafts] = useState<Record<string, string>>({});',
      '  const [scheduleDrafts, setScheduleDrafts] = useState<Record<string, string>>({});\n  const [locationDrafts, setLocationDrafts] = useState<Record<string, string>>({});\n  const [resourceDrafts, setResourceDrafts] = useState<Record<string, string>>({});',
    );
  }

  if (!source.includes('const assignedPerformer = performerOptions.find')) {
    source = source.replace(
      '            const suggestion = !work.performerName && work.partsReviewComplete ? suggestedPerformerForWork(work, performerOptions) : null;',
      '            const suggestion = !work.performerName && work.partsReviewComplete ? suggestedPerformerForWork(work, performerOptions) : null;\n            const assignedPerformer = performerOptions.find((option) => option.key === performerKey(work)) || null;',
    );
  }

  if (!source.includes('const locationDraft = locationDrafts[work.id]')) {
    source = source.replace(
      '            const assignedPerformer = performerOptions.find((option) => option.key === performerKey(work)) || null;',
      '            const assignedPerformer = performerOptions.find((option) => option.key === performerKey(work)) || null;\n            const locationDraft = locationDrafts[work.id] ?? work.locationId ?? "";\n            const resourceDraft = resourceDrafts[work.id] ?? work.resourceId ?? "";',
    );
  }

  source = source.replace(
    '            const resources = resourceOptions.filter((resource) => !work.locationId || resource.locationId === work.locationId);',
    '            const resources = resourceOptions.filter((resource) => !locationDraft || resource.locationId === locationDraft);',
  );

  if (!source.includes('Use partner default')) {
    source = source.replaceAll(
      '<div className="mb-2 text-[10px] font-black uppercase text-slate-400">4 · Location</div><div className="grid gap-2 sm:grid-cols-2">',
      '<div className="mb-2 text-[10px] font-black uppercase text-slate-400">4 · Location</div>{!work.locationId && assignedPerformer?.type === "partner" && assignedPerformer.primaryLocationId ? <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-blue-50 px-3 py-2"><div className="text-xs font-bold text-blue-900">Default for {assignedPerformer.displayName}: {assignedPerformer.primaryLocationName || "Partner location"}</div><button type="button" disabled={workingId === work.id} onClick={() => { setLocationDrafts((current) => ({ ...current, [work.id]: assignedPerformer.primaryLocationId || "" })); setResourceDrafts((current) => ({ ...current, [work.id]: "" })); }} className="rounded-lg bg-blue-700 px-3 py-1.5 text-[10px] font-black text-white disabled:opacity-50">Use partner default</button></div> : null}<div className="grid gap-2 sm:grid-cols-2">',
    );
  }

  source = source.replaceAll(
    'value={work.locationId || ""} onChange={(event) => void patchWork(work.id, { locationId: event.target.value || null }, "Location updated.")}',
    'value={locationDraft} onChange={(event) => { const nextLocation = event.target.value; setLocationDrafts((current) => ({ ...current, [work.id]: nextLocation })); setResourceDrafts((current) => ({ ...current, [work.id]: "" })); }}',
  );
  source = source.replaceAll(
    'disabled={workingId === work.id || !work.locationId} value={work.resourceId || ""} onChange={(event) => void patchWork(work.id, { resourceId: event.target.value || null }, "Resource updated.")}',
    'disabled={workingId === work.id || !locationDraft} value={resourceDraft} onChange={(event) => setResourceDrafts((current) => ({ ...current, [work.id]: event.target.value }))}',
  );

  if (!source.includes('Save location')) {
    source = source.replaceAll(
      '<option value="">No specific resource</option>{resources.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select></div></div> : null}',
      '<option value="">No specific resource</option>{resources.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select></div><div className="mt-2 flex items-center justify-end gap-2"><span className="text-[10px] font-semibold text-slate-500">Choose both fields before saving. This card will stay in place until you submit.</span><button type="button" disabled={workingId === work.id || !locationDraft} onClick={() => void patchWork(work.id, { locationId: locationDraft || null, resourceId: resourceDraft || null }, "Location saved.")} className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-black text-white disabled:bg-slate-200 disabled:text-slate-400">Save location</button></div></div> : null}',
    );
  }

  source = source.replace(
    '      const text = payload.scheduleCleared ? `${success} Previous schedule cleared; choose a new time after setup is ready.` : success;',
    '      const text = payload.scheduleCleared ? `Saved. ${success} The previously confirmed schedule was cleared because the Work Order setup changed; choose or re-confirm the work time after this setup change.` : `Saved. ${success}`;',
  );

  writeFileSync(path, source, "utf8");
}

function patchPartnerDefaultLocation() {
  const path = "app/api/mindful/inventory/work-orders/[workOrderId]/route.ts";
  let source = readFileSync(path, "utf8");

  const oldBlock = `        if (!locationProvided && !existing.location_id) {\n          const { data: primary } = await access.supabase\n            .from("mindful_inventory_partner_locations")\n            .select("location_id")\n            .eq("partner_id", partnerId)\n            .eq("is_primary", true)\n            .limit(1)\n            .maybeSingle();\n          patch.location_id = primary?.location_id || null;\n          patch.resource_id = null;\n        }`;
  const newBlock = `        if (!locationProvided && !existing.location_id) {\n          const { data: locationLinks } = await access.supabase\n            .from("mindful_inventory_partner_locations")\n            .select("location_id,is_primary")\n            .eq("partner_id", partnerId);\n          const linkedLocations = locationLinks || [];\n          const primary = linkedLocations.find((row) => row.is_primary);\n          const defaultLocationId = primary?.location_id || (linkedLocations.length === 1 ? linkedLocations[0].location_id : null);\n          patch.location_id = defaultLocationId;\n          patch.resource_id = null;\n        }`;
  source = source.replace(oldBlock, newBlock);

  const originalBlock = `        if (!locationProvided) {\n          const { data: primary } = await access.supabase\n            .from("mindful_inventory_partner_locations")\n            .select("location_id")\n            .eq("partner_id", partnerId)\n            .eq("is_primary", true)\n            .limit(1)\n            .maybeSingle();\n          patch.location_id = primary?.location_id || null;\n          patch.resource_id = null;\n        }`;
  source = source.replace(originalBlock, newBlock);

  writeFileSync(path, source, "utf8");
}

function patchAvailabilityGuidance() {
  const path = "app/api/mindful/inventory/work-orders/[workOrderId]/availability/route.ts";
  let source = readFileSync(path, "utf8");
  source = source.replace(
    'if (work.parts_review_status !== "resolved") guidance.push("parts review pending");',
    'if (work.parts_review_status !== "resolved") guidance.push("parts decision pending · schedule can be planned now, but work cannot begin until Parts Review is resolved");',
  );
  writeFileSync(path, source, "utf8");
}

patchActiveWork();
patchPartnerDefaultLocation();
patchAvailabilityGuidance();
console.log("Aligned Active Work with pending schedule truth, stable location editing, and Partner default locations.");
await import("./ensure-parts-state-coherence.mjs");