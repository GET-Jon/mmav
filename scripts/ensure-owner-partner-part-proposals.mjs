import { readFileSync, writeFileSync } from "node:fs";

function patchWorkPage() {
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

  if (!source.includes('partRequirements={partRequirements}')) {
    source = source.replace(
      '      partSuggestions={partSuggestions}\n',
      '      partSuggestions={partSuggestions}\n      partRequirements={partRequirements}\n',
    );
  }

  writeFileSync(path, source, "utf8");
}

function patchActiveWork() {
  const path = "components/mindful-inventory/inventory-active-work-v6.tsx";
  let source = readFileSync(path, "utf8");
  if (source.includes('data-owner-partner-proposal="true"')) return;

  if (!source.includes('OwnerPartRequirementReview')) {
    source = source.replace(
      'import { WorkOrderPartsModal } from "@/components/mindful-inventory/work-order-parts-modal";',
      'import { WorkOrderPartsModal } from "@/components/mindful-inventory/work-order-parts-modal";\nimport { OwnerPartRequirementReview } from "@/components/mindful-inventory/owner-part-requirement-review";',
    );
  }
  if (!source.includes('type { PartRequirementView }')) {
    source = source.replace(
      'import type { PartSearchSuggestion } from "@/lib/mindful-inventory/part-suggestions";',
      'import type { PartSearchSuggestion } from "@/lib/mindful-inventory/part-suggestions";\nimport type { PartRequirementView } from "@/lib/mindful-inventory/part-requirements";',
    );
  }

  source = source.replace(
    'export function InventoryActiveWork({ vehicleId, vehicle: _vehicle, workOrders, performerOptions, locationOptions, resourceOptions, parts, partSuggestions }: {',
    'export function InventoryActiveWork({ vehicleId, vehicle: _vehicle, workOrders, performerOptions, locationOptions, resourceOptions, parts, partSuggestions, partRequirements }: {',
  );
  source = source.replace(
    '  partSuggestions: PartSearchSuggestion[];\n}) {',
    '  partSuggestions: PartSearchSuggestion[];\n  partRequirements: PartRequirementView[];\n}) {',
  );

  const jobPartsLine = '            const jobParts = parts.filter((part) => part.workOrderId === work.id && part.status !== "cancelled");';
  if (source.includes(jobPartsLine) && !source.includes('const pendingRequirements = partRequirements.filter')) {
    source = source.replace(
      jobPartsLine,
      jobPartsLine + '\n            const pendingRequirements = partRequirements.filter((requirement) => requirement.workOrderId === work.id && requirement.requirementStatus === "suggested");',
    );
  }

  source = source.replace(
    'detail={work.partsReviewComplete ? (work.partsReadyForExecution ? (jobParts.length ? "Ready" : "None required") : `${work.pendingPartCount} pending`) : "Review"}',
    'detail={work.partsReviewComplete ? (work.partsReadyForExecution ? (jobParts.length ? "Ready" : "None required") : `${work.pendingPartCount} pending`) : pendingRequirements.length ? `${pendingRequirements.length} proposal${pendingRequirements.length === 1 ? "" : "s"}` : "Review"}',
  );

  const newPartsBlock = [
    '{(partsActive || editing) ? <div data-owner-partner-proposal="true" className="mt-3 rounded-lg border border-slate-200 bg-white p-3">',
    '  <div className="mb-2 flex flex-wrap items-center justify-between gap-3">',
    '    <div><div className="text-[10px] font-black uppercase text-slate-400">1 · Parts</div><div className="mt-1 text-xs font-bold text-slate-700">{work.partsReviewComplete ? (work.partsReadyForExecution ? "Parts resolved and ready." : partsPendingLabel(work)) : pendingRequirements.length ? "Review the Partner proposal below." : "Determine what is needed and resolve the source for every dependency."}</div></div>',
    '    {pendingRequirements.length === 0 ? <div className="flex flex-wrap gap-2"><button onClick={() => setPartsWorkOrderId(work.id)} className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-black text-white">{work.partsReviewComplete ? "Manage Parts" : "Review Parts"}</button>{!work.partsReviewComplete && jobParts.length === 0 ? <button disabled={workingId === work.id} onClick={() => void confirmNoParts(work)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-black text-slate-700">No Parts Required</button> : null}</div> : null}',
    '  </div>',
    '  {pendingRequirements.length ? <div className="space-y-2">{pendingRequirements.map((requirement) => <OwnerPartRequirementReview key={requirement.id} vehicleId={vehicleId} requirement={requirement} />)}</div> : null}',
    '</div> : null}',
  ].join('\n');

  const partsStart = source.indexOf('{(partsActive || editing) ? <div');
  const partnerStart = source.indexOf('{(partnerActive || editing)', partsStart);
  if (partsStart === -1 || partnerStart === -1) {
    throw new Error("Owner Partner proposal pass could not locate the Parts/Partner setup boundaries.");
  }

  source = source.slice(0, partsStart) + newPartsBlock + '\n\n                      ' + source.slice(partnerStart);
  writeFileSync(path, source, "utf8");
}

patchWorkPage();
patchActiveWork();
console.log("Owner Execution Plan now surfaces pending Partner part proposals directly.");
