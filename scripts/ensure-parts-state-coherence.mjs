import { readFileSync, writeFileSync } from "node:fs";

function patch(path, transform) {
  const source = readFileSync(path, "utf8");
  const updated = transform(source);
  if (updated !== source) writeFileSync(path, updated, "utf8");
}

patch("app/api/mindful/inventory/vehicles/[id]/parts/review/route.ts", (source) => {
  let updated = source;
  const anchor = '    if (action === "no_parts_required") {\n      const { count, error: countError } = await access.supabase';
  if (!updated.includes("unresolved part requirement")) {
    const replacement = '    if (action === "no_parts_required") {\n      const { data: requirementRows, error: requirementError } = await access.supabase\n        .from("mindful_inventory_part_requirements")\n        .select("id,description,requirement_status,fulfillment_method")\n        .eq("work_order_id", workOrderId);\n      if (requirementError) throw new Error(requirementError.message);\n      const unresolvedRequirements = (requirementRows || []).filter((item) =>\n        item.requirement_status === "suggested" ||\n        (item.requirement_status === "required" && !item.fulfillment_method)\n      );\n      if (unresolvedRequirements.length) {\n        return NextResponse.json({ error: "Review the pending part proposal or unresolved part requirement before marking this Work Order as having no parts." }, { status: 409 });\n      }\n\n      const { count, error: countError } = await access.supabase';
    if (!updated.includes(anchor)) throw new Error("Parts coherence pass could not locate no-parts review block.");
    updated = updated.replace(anchor, replacement);
  }
  return updated;
});

patch("lib/mindful-inventory/active-work.ts", (source) => {
  let updated = source;
  if (!updated.includes("unresolvedRequirementWorkOrderIds")) {
    const anchor = '  const partnerIds = Array.from(new Set((data || []).map((row) => row.assigned_partner_id).filter(Boolean))) as string[];';
    const addition = '  const { data: requirementRows, error: requirementError } = workOrderIds.length\n    ? await supabase\n        .from("mindful_inventory_part_requirements")\n        .select("work_order_id,requirement_status,fulfillment_method")\n        .in("work_order_id", workOrderIds)\n    : { data: [], error: null };\n  if (requirementError) throw new Error(requirementError.message);\n  const unresolvedRequirementWorkOrderIds = new Set(\n    (requirementRows || [])\n      .filter((item) => item.requirement_status === "suggested" || (item.requirement_status === "required" && !item.fulfillment_method))\n      .map((item) => item.work_order_id),\n  );\n\n' + anchor;
    if (!updated.includes(anchor)) throw new Error("Parts coherence pass could not locate Active Work partnerIds anchor.");
    updated = updated.replace(anchor, addition);
  }
  updated = updated.replace(
    '    const partsReviewStatus = row.parts_review_status === "resolved" ? "resolved" : "pending";',
    '    const partsReviewStatus = unresolvedRequirementWorkOrderIds.has(row.id) ? "pending" : row.parts_review_status === "resolved" ? "resolved" : "pending";',
  );
  return updated;
});

patch("lib/partner-portal/work.ts", (source) => {
  let updated = source;
  if (!updated.includes("unresolvedRequirementWorkOrderIds")) {
    const anchor = '  return workOrders\n    .filter((row) => vehicles.has(row.vehicle_id))';
    const addition = '  const { data: requirementRows, error: requirementError } = await admin\n    .from("mindful_inventory_part_requirements")\n    .select("work_order_id,requirement_status,fulfillment_method")\n    .in("work_order_id", workOrderIds);\n  if (requirementError) throw new Error(requirementError.message);\n  const unresolvedRequirementWorkOrderIds = new Set(\n    (requirementRows || [])\n      .filter((item) => item.requirement_status === "suggested" || (item.requirement_status === "required" && !item.fulfillment_method))\n      .map((item) => item.work_order_id),\n  );\n\n' + anchor;
    if (!updated.includes(anchor)) throw new Error("Parts coherence pass could not locate Partner Work return anchor.");
    updated = updated.replace(anchor, addition);
  }
  updated = updated.replace(
    '        ownerPartsReviewComplete: row.parts_review_status === "resolved",',
    '        ownerPartsReviewComplete: row.parts_review_status === "resolved" && !unresolvedRequirementWorkOrderIds.has(row.id),',
  );
  return updated;
});

patch("scripts/ensure-partner-work-readiness-truth.mjs", (source) => {
  return source.replace(
    'if (!source.includes("ownerPartsReviewComplete: row.parts_review_status === \\"resolved\\"")) {',
    'if (!source.includes("ownerPartsReviewComplete:")) {',
  );
});

patch("app/api/mindful/inventory/vehicles/[id]/part-requirements/route.ts", (source) => {
  let updated = source;
  const oldLinkedUpdate = '      } else if (approvedPartnerPrice !== null) {\n        const { error: priceError } = await access.supabase.from("mindful_inventory_work_order_parts").update({\n          quoted_unit_price: approvedPartnerPrice,\n          supplier: "Partner",\n          updated_by: access.userId,\n          updated_at: now,\n        }).eq("id", linkedPartId);\n        if (priceError) throw new Error(priceError.message);\n      }';
  if (updated.includes(oldLinkedUpdate)) {
    const newLinkedUpdate = '      } else {\n        const dependencyResolution = fulfillmentMethod === "in_stock" ? "in_stock" : fulfillmentMethod === "partner_supplied" ? "partner_supplied" : fulfillmentMethod === "customer_supplied" ? "customer_supplied" : null;\n        const { error: linkedPartError } = await access.supabase.from("mindful_inventory_work_order_parts").update({\n          requirement_id: requirement.id,\n          description: requirement.description,\n          quantity: requirement.quantity,\n          part_number: requirement.part_number,\n          dependency_resolution: dependencyResolution,\n          dependency_resolved_at: dependencyResolution ? now : null,\n          dependency_resolved_by: dependencyResolution ? access.userId : null,\n          quoted_unit_price: approvedPartnerPrice,\n          supplier: fulfillmentMethod === "partner_supplied" ? "Partner" : null,\n          notes: note,\n          updated_by: access.userId,\n          updated_at: now,\n        }).eq("id", linkedPartId);\n        if (linkedPartError) throw new Error(linkedPartError.message);\n      }';
    updated = updated.replace(oldLinkedUpdate, newLinkedUpdate);
  }
  return updated;
});

console.log("Aligned Partner proposals, Owner Parts Review, executable parts, and Partner readiness around one canonical requirement state.");
