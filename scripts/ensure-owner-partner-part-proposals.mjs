import { readFileSync, writeFileSync } from "node:fs";

function patchOwnerWorkPage() {
  const path = "app/mindful/inventory/[id]/work/page.tsx";
  let source = readFileSync(path, "utf8");

  if (!source.includes('getInventoryPartRequirements')) {
    source = source.replace(
      'import { getInventoryPartsTransportData } from "@/lib/mindful-inventory/parts-transport";',
      'import { getInventoryPartsTransportData } from "@/lib/mindful-inventory/parts-transport";\nimport { getInventoryPartRequirements } from "@/lib/mindful-inventory/part-requirements";',
    );
  }

  source = source.replace(
    'const [partsData, performerOptions, schedulingOptions, partnerEstimateReviews, partnerScheduleChanges] = await Promise.all([',
    'const [partsData, performerOptions, schedulingOptions, partnerEstimateReviews, partnerScheduleChanges, partRequirements] = await Promise.all([',
  );

  const scheduleLoader = '    getPartnerScheduleChanges(access.supabase, vehicle.id),';
  if (source.includes(scheduleLoader) && !source.includes('getInventoryPartRequirements(access.supabase, access.company.companyId, vehicle.id)')) {
    source = source.replace(
      scheduleLoader,
      scheduleLoader + '\n    getInventoryPartRequirements(access.supabase, access.company.companyId, vehicle.id),',
    );
  }

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
    if (activeWorkStart >= 0) source = source.slice(0, panelStart) + source.slice(activeWorkStart);
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
      'import { WorkOrderPartsModal } from "@/components/mindful-inventory/work-order-parts-modal";',
      'import { WorkOrderPartsModal } from "@/components/mindful-inventory/work-order-parts-modal";\nimport { OwnerPartRequirementReview } from "@/components/mindful-inventory/owner-part-requirement-review";',
    );
  }
  if (!source.includes('PartRequirementView')) {
    source = source.replace(
      'import type { PartSearchSuggestion } from "@/lib/mindful-inventory/part-suggestions";',
      'import type { PartSearchSuggestion } from "@/lib/mindful-inventory/part-suggestions";\nimport type { PartRequirementView } from "@/lib/mindful-inventory/part-requirements";',
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
  if (source.includes(jobPartsAnchor) && !source.includes('const pendingPartnerRequirements = workRequirements.filter')) {
    source = source.replace(
      jobPartsAnchor,
      [
        jobPartsAnchor,
        '            const workRequirements = partRequirements.filter((requirement) => requirement.workOrderId === work.id);',
        '            const pendingPartnerRequirements = workRequirements.filter((requirement) => requirement.requirementStatus === "suggested" && Boolean(requirement.suggestedByPartnerId));',
        '            const pendingPartnerPartsTotal = pendingPartnerRequirements.reduce((sum, requirement) => sum + ((requirement.partnerOfferUnitPrice || 0) * Math.max(1, requirement.quantity || 1)), 0);',
        '            const approvedPartsTotal = jobParts.reduce((sum, part) => sum + ((part.actualUnitPrice ?? part.quotedUnitPrice ?? 0) * Math.max(1, part.quantity || 1)), 0);',
      ].join('\n'),
    );
  }

  source = source.replace(
    '<span>{money(work.approvedBudget)}</span><span>Labor {hours(work.estimatedLaborMinutes)}</span>',
    '<span>Labor {money(work.approvedBudget)}</span>{pendingPartnerPartsTotal > 0 ? <span className="text-amber-700">Parts {money(pendingPartnerPartsTotal)} pending</span> : approvedPartsTotal > 0 ? <span>Parts {money(approvedPartsTotal)}</span> : null}<span>{hours(work.estimatedLaborMinutes)} labor</span>',
  );

  source = source.replace(
    '<span>{jobParts.length ? `${jobParts.length} part${jobParts.length === 1 ? "" : "s"} tracked` : work.partsReviewComplete ? "No parts required" : "Parts not reviewed"}</span>',
    '<span>{pendingPartnerRequirements.length ? `${pendingPartnerRequirements.length} part${pendingPartnerRequirements.length === 1 ? "" : "s"} awaiting Owner` : jobParts.length ? `${jobParts.length} part${jobParts.length === 1 ? "" : "s"} tracked` : work.partsReviewComplete ? "No parts required" : "Parts not reviewed"}</span>',
  );

  const oldStep = '<Step n={1} label="Parts" done={work.partsReviewComplete} active={partsActive} detail={work.partsReviewComplete ? (work.partsReadyForExecution ? (jobParts.length ? "Ready" : "None required") : `${work.pendingPartCount} pending`) : "Review"} />';
  const newStep = '<Step n={1} label="Parts" done={work.partsReviewComplete && pendingPartnerRequirements.length === 0} active={partsActive} detail={pendingPartnerRequirements.length ? `${pendingPartnerRequirements.length} Owner decision${pendingPartnerRequirements.length === 1 ? "" : "s"}${pendingPartnerPartsTotal > 0 ? ` · ${money(pendingPartnerPartsTotal)}` : ""}` : work.partsReviewComplete ? (work.partsReadyForExecution ? (jobParts.length ? "Ready" : "None required") : `${work.pendingPartCount} pending`) : "Review"} />';
  source = source.replaceAll(oldStep, newStep);

  const genericPartsAnchor = '                      {(partsActive || editing) ? <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">';
  if (source.includes(genericPartsAnchor) && !source.includes('data-inline-part-requirement-review="true"')) {
    const inlineReview = [
      '                      {pendingPartnerRequirements.length ? <div data-inline-part-requirement-review="true" className="mt-3 rounded-xl border border-amber-300 bg-amber-50/60 p-3">',
      '                        <div className="mb-2">',
      '                          <div className="text-[9px] font-black uppercase tracking-[0.12em] text-amber-800">1 · Parts · Owner decision</div>',
      '                          <div className="mt-1 text-xs font-bold text-slate-700">Respond to the Partner proposal here. This is the parts decision for this Work Order.</div>',
      '                        </div>',
      '                        <div className="space-y-2">{pendingPartnerRequirements.map((requirement) => <OwnerPartRequirementReview key={requirement.id} vehicleId={vehicleId} requirement={requirement} />)}</div>',
      '                      </div> : null}',
      '',
    ].join('\n');
    source = source.replace(genericPartsAnchor, inlineReview + genericPartsAnchor.replace('(partsActive || editing)', 'pendingPartnerRequirements.length === 0 && (partsActive || editing)'));
  }

  writeFileSync(path, source, "utf8");
}

function patchResolvedSuggestionState() {
  const path = "components/mindful-inventory/inventory-part-suggestions-v4.tsx";
  let source = readFileSync(path, "utf8");

  source = source.replace(
    '        const workParts = activeParts.filter((p) => p.workOrderId === suggestion.workOrderId);',
    '        const workParts = activeParts.filter((p) => p.workOrderId === suggestion.workOrderId);\n        const allWorkParts = parts.filter((p) => p.workOrderId === suggestion.workOrderId);',
  );

  source = source.replace(
    '              const existing = workParts.find((p) => normalizeName(p.description) === normalizeName(rec.name)) || null;',
    '              const existing = allWorkParts.find((p) => normalizeName(p.description) === normalizeName(rec.name)) || null;',
  );

  source = source.replace(
    '{existing.status === "backordered" ? "Delayed" : labelize(existing.status)}',
    '{sourceFor(existing) === "not_required" ? "Not Required" : existing.status === "backordered" ? "Delayed" : labelize(existing.status)}',
  );

  writeFileSync(path, source, "utf8");
}

patchOwnerWorkPage();
patchExecutionPlan();
patchResolvedSuggestionState();
console.log("Owner Work page renders Partner part proposals inline and resolved suggestions retain their saved disposition.");
