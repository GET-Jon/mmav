import { readFileSync, writeFileSync } from "node:fs";

function patchOwnerWorkPage() {
  const path = "app/mindful/inventory/[id]/work/page.tsx";
  let source = readFileSync(path, "utf8");

  source = source.replace(
    'import { OwnerPartRequirementReview } from "@/components/mindful-inventory/owner-part-requirement-review";\n',
    '',
  );
  source = source.replace(
    '  const pendingPartnerPartRequirements = partRequirements.filter((requirement) => requirement.requirementStatus === "suggested" && Boolean(requirement.suggestedByPartnerId));\n',
    '',
  );

  const panelStart = source.indexOf('    {pendingPartnerPartRequirements.length ? <section data-owner-partner-proposals-panel="true"');
  if (panelStart >= 0) {
    const activeWorkStart = source.indexOf('    <InventoryActiveWork', panelStart);
    if (activeWorkStart < 0) throw new Error("Could not locate InventoryActiveWork after standalone Owner proposal panel.");
    source = source.slice(0, panelStart) + source.slice(activeWorkStart);
  }

  if (!source.includes('      partRequirements={partRequirements}')) {
    source = source.replace(
      '      workOrders={workOrders}\n',
      '      workOrders={workOrders}\n      partRequirements={partRequirements}\n',
    );
  }

  writeFileSync(path, source, "utf8");
}

function patchExecutionPlan() {
  const path = "components/mindful-inventory/inventory-active-work-v6.tsx";
  let source = readFileSync(path, "utf8");

  if (!source.includes('OwnerPartRequirementReview')) {
    source = source.replace(
      'import { WorkOrderPartsModal } from "@/components/mindful-inventory/work-order-parts-modal";\n',
      'import { WorkOrderPartsModal } from "@/components/mindful-inventory/work-order-parts-modal";\nimport { OwnerPartRequirementReview } from "@/components/mindful-inventory/owner-part-requirement-review";\n',
    );
  }
  if (!source.includes('type { PartRequirementView }')) {
    source = source.replace(
      'import type { PartSearchSuggestion } from "@/lib/mindful-inventory/part-suggestions";\n',
      'import type { PartSearchSuggestion } from "@/lib/mindful-inventory/part-suggestions";\nimport type { PartRequirementView } from "@/lib/mindful-inventory/part-requirements";\n',
    );
  }

  source = source.replace(
    'export function InventoryActiveWork({ vehicleId, vehicle: _vehicle, workOrders, performerOptions, locationOptions, resourceOptions, parts, partSuggestions }: {',
    'export function InventoryActiveWork({ vehicleId, vehicle: _vehicle, workOrders, partRequirements, performerOptions, locationOptions, resourceOptions, parts, partSuggestions }: {',
  );
  if (!source.includes('  partRequirements: PartRequirementView[];')) {
    source = source.replace(
      '  workOrders: InventoryWorkOrderView[];\n',
      '  workOrders: InventoryWorkOrderView[];\n  partRequirements: PartRequirementView[];\n',
    );
  }

  const jobPartsAnchor = '            const jobParts = parts.filter((part) => part.workOrderId === work.id && part.status !== "cancelled");';
  if (!source.includes('const workRequirements = partRequirements.filter((requirement) => requirement.workOrderId === work.id);')) {
    if (!source.includes(jobPartsAnchor)) throw new Error("Could not locate jobParts in InventoryActiveWork.");
    source = source.replace(
      jobPartsAnchor,
      [
        jobPartsAnchor,
        '            const workRequirements = partRequirements.filter((requirement) => requirement.workOrderId === work.id);',
        '            const unresolvedRequirements = workRequirements.filter((requirement) => requirement.requirementStatus === "suggested" || (requirement.requirementStatus === "required" && !requirement.fulfillmentMethod));',
        '            const pendingPartnerRequirements = unresolvedRequirements.filter((requirement) => Boolean(requirement.suggestedByPartnerId));',
        '            const pendingPartnerTotal = pendingPartnerRequirements.reduce((sum, requirement) => sum + ((requirement.partnerOfferUnitPrice || 0) * Math.max(1, requirement.quantity || 1)), 0);',
        '            const approvedPartsTotal = jobParts.reduce((sum, part) => sum + ((part.actualUnitPrice ?? part.quotedUnitPrice ?? 0) * Math.max(1, part.quantity || 1)), 0);',
        '            const partsDecisionPending = unresolvedRequirements.length > 0;',
      ].join('\n'),
    );
  }

  source = source.replace(
    '            const partsActive = !work.partsReviewComplete;',
    '            const partsActive = !work.partsReviewComplete || partsDecisionPending;',
  );
  source = source.replace(
    '            const partnerActive = work.partsReviewComplete && !work.performerName;',
    '            const partnerActive = work.partsReviewComplete && !partsDecisionPending && !work.performerName;',
  );
  source = source.replace(
    '            const quoteActive = work.partsReviewComplete && Boolean(work.performerName) && !quoteComplete;',
    '            const quoteActive = work.partsReviewComplete && !partsDecisionPending && Boolean(work.performerName) && !quoteComplete;',
  );
  source = source.replace(
    '            const locationActive = work.partsReviewComplete && Boolean(work.performerName) && quoteComplete && !work.locationId;',
    '            const locationActive = work.partsReviewComplete && !partsDecisionPending && Boolean(work.performerName) && quoteComplete && !work.locationId;',
  );
  source = source.replace(
    '            const scheduleActive = work.partsReviewComplete && Boolean(work.performerName) && quoteComplete && Boolean(work.locationId) && work.partsReadyForExecution && !work.scheduledStartAt;',
    '            const scheduleActive = work.partsReviewComplete && !partsDecisionPending && Boolean(work.performerName) && quoteComplete && Boolean(work.locationId) && work.partsReadyForExecution && !work.scheduledStartAt;',
  );
  source = source.replace(
    '            const canStart = !done && work.status !== "in_progress" && !issue;',
    '            const canStart = !done && work.status !== "in_progress" && !issue && !partsDecisionPending;',
  );

  source = source.replace(
    '<span>{money(work.approvedBudget)}</span><span>Labor {hours(work.estimatedLaborMinutes)}</span>',
    '<span>Labor {money(work.approvedBudget)}</span>{pendingPartnerTotal > 0 ? <span className="text-amber-700">Parts {money(pendingPartnerTotal)} pending</span> : approvedPartsTotal > 0 ? <span>Parts {money(approvedPartsTotal)}</span> : null}<span>{hours(work.estimatedLaborMinutes)} labor</span>',
  );
  source = source.replace(
    '<span>{jobParts.length ? `${jobParts.length} part${jobParts.length === 1 ? "" : "s"} tracked` : work.partsReviewComplete ? "No parts required" : "Parts not reviewed"}</span>',
    '<span>{pendingPartnerRequirements.length ? `${pendingPartnerRequirements.length} part${pendingPartnerRequirements.length === 1 ? "" : "s"} awaiting Owner` : jobParts.length ? `${jobParts.length} part${jobParts.length === 1 ? "" : "s"} tracked` : work.partsReviewComplete ? "No parts required" : "Parts not reviewed"}</span>',
  );

  source = source.replaceAll(
    '<Step n={1} label="Parts" done={work.partsReviewComplete} active={partsActive} detail={work.partsReviewComplete ? (work.partsReadyForExecution ? (jobParts.length ? "Ready" : "None required") : `${work.pendingPartCount} pending`) : "Review"} />',
    '<Step n={1} label="Parts" done={work.partsReviewComplete && !partsDecisionPending} active={partsActive} detail={pendingPartnerRequirements.length ? `${pendingPartnerRequirements.length} Owner decision${pendingPartnerRequirements.length === 1 ? "" : "s"}${pendingPartnerTotal > 0 ? ` · ${money(pendingPartnerTotal)}` : ""}` : work.partsReviewComplete ? (work.partsReadyForExecution ? (jobParts.length ? "Ready" : "None required") : `${work.pendingPartCount} pending`) : "Review"} />',
  );

  const genericPartsAnchor = '                      {(partsActive || editing) ? <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">';
  if (!source.includes('data-inline-part-requirement-review="true"')) {
    if (!source.includes(genericPartsAnchor)) throw new Error("Could not locate Owner Parts setup block in InventoryActiveWork.");
    const inlineReview = [
      '                      {pendingPartnerRequirements.length ? <div data-inline-part-requirement-review="true" className="mt-3 rounded-xl border border-amber-300 bg-amber-50/60 p-3">',
      '                        <div className="mb-2"><div className="text-[9px] font-black uppercase tracking-[0.12em] text-amber-800">1 · Parts · Owner decision</div><div className="mt-1 text-xs font-bold text-slate-700">Respond to the Partner proposal here. This decision controls the executable parts state for this Work Order.</div></div>',
      '                        <div className="space-y-2">{pendingPartnerRequirements.map((requirement) => <OwnerPartRequirementReview key={requirement.id} vehicleId={vehicleId} requirement={requirement} />)}</div>',
      '                      </div> : null}',
      '',
    ].join('\n');
    source = source.replace(genericPartsAnchor, inlineReview + genericPartsAnchor.replace('(partsActive || editing)', '(partsActive || editing) && pendingPartnerRequirements.length === 0'));
  } else {
    source = source.replace(genericPartsAnchor, genericPartsAnchor.replace('(partsActive || editing)', '(partsActive || editing) && pendingPartnerRequirements.length === 0'));
  }

  writeFileSync(path, source, "utf8");
}

patchOwnerWorkPage();
patchExecutionPlan();
console.log("Unified Partner part requirements with the Owner Execution Plan.");
