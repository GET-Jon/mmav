import { readFileSync, writeFileSync } from "node:fs";

function patchWorkLoader() {
  const path = "lib/partner-portal/work.ts";
  let source = readFileSync(path, "utf8");
  if (source.includes("partRequirements: Array<{")) {
    console.log("Partner Work loader already exposes part requirements.");
    return;
  }

  source = source.replace(
    "  latestEstimate: {",
    `  partRequirements: Array<{\n    id: string;\n    description: string;\n    quantity: number | null;\n    partNumber: string | null;\n    requirementStatus: string;\n    partnerOfferUnitPrice: number | null;\n    partnerOfferNote: string | null;\n    origin: string | null;\n  }>;\n  latestEstimate: {`,
  );

  source = source.replace(
    "const [vehiclesResult, locationsResult, estimatesResult, partsResult] = await Promise.all([",
    "const [vehiclesResult, locationsResult, estimatesResult, partsResult, partRequirementsResult] = await Promise.all([",
  );

  const partsQueryEnd = `    admin\n      .from("mindful_inventory_work_order_parts")\n      .select("id,work_order_id,description,quantity,part_number,status,eta_at,dependency_resolution")\n      .in("work_order_id", workOrderIds)\n      .order("created_at", { ascending: true }),\n  ]);`;
  if (!source.includes(partsQueryEnd)) {
    console.log("Partner pending parts loader skipped: parts query anchor not found.");
    return;
  }
  source = source.replace(
    partsQueryEnd,
    `    admin\n      .from("mindful_inventory_work_order_parts")\n      .select("id,work_order_id,description,quantity,part_number,status,eta_at,dependency_resolution")\n      .in("work_order_id", workOrderIds)\n      .order("created_at", { ascending: true }),\n    admin\n      .from("mindful_inventory_part_requirements")\n      .select("id,work_order_id,description,quantity,part_number,requirement_status,partner_offer_unit_price,partner_offer_note,origin")\n      .in("work_order_id", workOrderIds)\n      .order("created_at", { ascending: true }),\n  ]);`,
  );

  source = source.replace(
    "  if (partsResult.error) throw new Error(partsResult.error.message);",
    "  if (partsResult.error) throw new Error(partsResult.error.message);\n  if (partRequirementsResult.error) throw new Error(partRequirementsResult.error.message);",
  );

  const beforeReturn = `  return workOrders\n    .filter((row) => vehicles.has(row.vehicle_id))`;
  if (!source.includes(beforeReturn)) {
    console.log("Partner pending parts loader skipped: return anchor not found.");
    return;
  }
  const requirementMap = `  const partRequirementsByWorkOrder = new Map<string, PartnerWorkItem["partRequirements"]>();\n  for (const row of partRequirementsResult.data ?? []) {\n    const current = partRequirementsByWorkOrder.get(row.work_order_id) ?? [];\n    current.push({\n      id: row.id,\n      description: row.description,\n      quantity: row.quantity == null ? null : Number(row.quantity),\n      partNumber: row.part_number,\n      requirementStatus: row.requirement_status,\n      partnerOfferUnitPrice: row.partner_offer_unit_price == null ? null : Number(row.partner_offer_unit_price),\n      partnerOfferNote: row.partner_offer_note,\n      origin: row.origin,\n    });\n    partRequirementsByWorkOrder.set(row.work_order_id, current);\n  }\n\n`;
  source = source.replace(beforeReturn, requirementMap + beforeReturn);

  source = source.replace(
    "        parts: partsByWorkOrder.get(row.id) ?? [],\n        latestEstimate:",
    "        parts: partsByWorkOrder.get(row.id) ?? [],\n        partRequirements: partRequirementsByWorkOrder.get(row.id) ?? [],\n        latestEstimate:",
  );

  writeFileSync(path, source, "utf8");
  console.log("Partner Work loader now exposes pending part requirements.");
}

function patchPartnerWorkUi() {
  const path = "components/partner/partner-work-list-v4.tsx";
  let source = readFileSync(path, "utf8");
  if (source.includes('data-pending-owner-part="true"')) {
    console.log("Partner Work already shows pending Owner part approvals.");
    return;
  }
  if (!source.includes('data-partner-work-parts-editor="ai-v1"')) {
    console.log("Partner pending parts UI skipped: Partner Work parts editor is not present yet.");
    return;
  }

  source = source.replace(
    '    const partsConfirmed = work.partnerPartsConfirmationStatus === "confirmed";',
    '    const pendingPartRequirements = work.partRequirements.filter((requirement) => requirement.requirementStatus === "suggested");\n    const partsConfirmed = work.partnerPartsConfirmationStatus === "confirmed" && pendingPartRequirements.length === 0;',
  );

  source = source.replace(
    '    const setupReady = estimateApproved && partsConfirmed && locationConfirmed && scheduleConfirmed;',
    '    const setupReady = estimateApproved && partsConfirmed && pendingPartRequirements.length === 0 && locationConfirmed && scheduleConfirmed;',
  );

  source = source.replace(
    '!partsConfirmed ? "Confirm the parts plan" : !locationConfirmed ?',
    'pendingPartRequirements.length ? "Waiting for Owner to review proposed parts" : !partsConfirmed ? "Confirm the parts plan" : !locationConfirmed ?',
  );

  source = source.replace(
    '{work.parts.length ? `${work.parts.length} tracked part${work.parts.length === 1 ? "" : "s"}` : "No parts listed"}',
    '{pendingPartRequirements.length ? `${pendingPartRequirements.length} proposed part${pendingPartRequirements.length === 1 ? "" : "s"}` : work.parts.length ? `${work.parts.length} tracked part${work.parts.length === 1 ? "" : "s"}` : "No parts listed"}',
  );

  source = source.replace(
    '{partsConfirmed ? "✓ Parts plan confirmed" : "Confirm the parts are correct, or add what the job needs."}',
    '{pendingPartRequirements.length ? "Waiting for Owner approval before this parts step can be confirmed." : partsConfirmed ? "✓ Parts plan confirmed" : "Confirm the parts are correct, or add what the job needs."}',
  );

  source = source.replace(
    '{!partsConfirmed ? <button disabled={workingId === work.id} onClick={() => void updateLogistics(work, "parts", "confirm")} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-black text-white">Confirm</button> : null}',
    '{!partsConfirmed && pendingPartRequirements.length === 0 ? <button disabled={workingId === work.id} onClick={() => void updateLogistics(work, "parts", "confirm")} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-black text-white">Confirm</button> : null}',
  );

  const existingPartsAnchor = '            {work.parts.length ? <div className="mt-3 space-y-2">';
  if (!source.includes(existingPartsAnchor)) {
    console.log("Partner pending parts UI skipped: existing parts anchor not found.");
    return;
  }
  const pendingBlock = `            {pendingPartRequirements.length ? <div className="mt-3 space-y-2">\n              {pendingPartRequirements.map((requirement) => <div key={requirement.id} data-pending-owner-part="true" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">\n                <div className="flex flex-wrap items-start justify-between gap-3">\n                  <div>\n                    <div className="text-sm font-black text-slate-950">{requirement.description}{requirement.quantity && requirement.quantity > 1 ? \\` × \\${requirement.quantity}\\` : ""}</div>\n                    <div className="mt-0.5 text-[10px] font-black uppercase tracking-[0.08em] text-amber-700">Pending Owner approval</div>\n                    {requirement.partnerOfferNote ? <div className="mt-1 text-xs font-semibold text-slate-600">{requirement.partnerOfferNote}</div> : null}\n                  </div>\n                  <div className="text-right">\n                    {requirement.partnerOfferUnitPrice != null ? <div className="text-sm font-black text-slate-950">{money(requirement.partnerOfferUnitPrice)}{requirement.quantity && requirement.quantity > 1 ? " each" : ""}</div> : null}\n                    {requirement.origin === "ai" ? <div className="mt-0.5 text-[10px] font-bold uppercase text-violet-700">Lot Logic suggested</div> : null}\n                  </div>\n                </div>\n              </div>)}\n            </div> : null}\n`;
  source = source.replace(existingPartsAnchor, pendingBlock + existingPartsAnchor);

  writeFileSync(path, source, "utf8");
  console.log("Partner Work now keeps proposed parts visible while Owner approval is pending.");
}

patchWorkLoader();
patchPartnerWorkUi();
