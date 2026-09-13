import { readFileSync, writeFileSync } from "node:fs";

const path = "app/mindful/inventory/[id]/work/page.tsx";
let source = readFileSync(path, "utf8");

if (!source.includes('OwnerPartRequirementReview')) {
  source = source.replace(
    'import { PartnerEstimateReviewPanel, type PartnerEstimateReviewItem } from "@/components/mindful-inventory/partner-estimate-review-panel";',
    'import { PartnerEstimateReviewPanel, type PartnerEstimateReviewItem } from "@/components/mindful-inventory/partner-estimate-review-panel";\nimport { OwnerPartRequirementReview } from "@/components/mindful-inventory/owner-part-requirement-review";',
  );
}

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

const suggestionsLine = '  const partSuggestions = workOrders.filter((work) => !["complete", "cancelled"].includes(work.status)).map((work) => buildPartSearchSuggestion(vehicle, work));';
if (source.includes(suggestionsLine) && !source.includes('const pendingPartnerPartRequirements')) {
  source = source.replace(
    suggestionsLine,
    suggestionsLine + '\n  const pendingPartnerPartRequirements = partRequirements.filter((requirement) => requirement.requirementStatus === "suggested" && Boolean(requirement.suggestedByPartnerId));',
  );
}

source = source.replace(/\n\s*partRequirements=\{partRequirements\}/g, '');

if (!source.includes('data-owner-partner-proposals-panel="true"')) {
  const inventoryAnchor = '    <InventoryActiveWork';
  if (!source.includes(inventoryAnchor)) {
    throw new Error("Owner Partner proposal pass could not locate InventoryActiveWork on the Work page.");
  }

  const panel = [
    '    {pendingPartnerPartRequirements.length ? <section data-owner-partner-proposals-panel="true" className="rounded-2xl border border-amber-300 bg-amber-50/60 p-4 shadow-sm">',
    '      <div className="mb-3">',
    '        <div className="text-[10px] font-black uppercase tracking-[0.12em] text-amber-800">Owner decision required</div>',
    '        <div className="mt-1 text-base font-black text-slate-950">Partner parts awaiting your review</div>',
    '        <div className="mt-1 text-xs font-semibold text-slate-600">Respond to the Partner\'s actual part proposal here. The Execution Plan will update after your decision.</div>',
    '      </div>',
    '      <div className="space-y-3">{pendingPartnerPartRequirements.map((requirement) => <div key={requirement.id}>',
    '        <div className="mb-1 text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">{requirement.workTitle}</div>',
    '        <OwnerPartRequirementReview vehicleId={vehicle.id} requirement={requirement} />',
    '      </div>)}</div>',
    '    </section> : null}',
    '',
  ].join('\n');

  source = source.replace(inventoryAnchor, panel + inventoryAnchor);
}

writeFileSync(path, source, "utf8");
console.log("Owner Work page now surfaces pending Partner part proposals without rewriting Active Work JSX.");
