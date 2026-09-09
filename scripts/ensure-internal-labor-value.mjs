import { readFileSync, writeFileSync } from "node:fs";

function patchFile(path, transform, label) {
  let source = readFileSync(path, "utf8");
  const original = source;
  source = transform(source);
  if (source !== original) {
    writeFileSync(path, source, "utf8");
    console.log(`Enabled ${label}.`);
  } else {
    console.log(`${label} already enabled.`);
  }
}

patchFile("lib/mindful-inventory/active-work.ts", (source) => {
  if (!source.includes("internalLaborValue: number | null;")) {
    source = source.replace("  actualCost: number | null;", "  actualCost: number | null;\n  internalLaborValue: number | null;");
  }
  source = source.replace(
    "approved_budget,current_forecast,actual_cost,assigned_partner_id",
    "approved_budget,current_forecast,actual_cost,internal_labor_value,assigned_partner_id",
  );
  if (!source.includes("internalLaborValue: nullableNumber(row.internal_labor_value)")) {
    source = source.replace(
      "      actualCost: nullableNumber(row.actual_cost),",
      "      actualCost: nullableNumber(row.actual_cost),\n      internalLaborValue: nullableNumber(row.internal_labor_value),",
    );
  }
  return source;
}, "internal labor value data");

patchFile("app/api/mindful/inventory/work-orders/[workOrderId]/route.ts", (source) => {
  if (!source.includes("internalLaborMinutesProvided")) {
    source = source.replace(
      "    const blockerReason = String(body.blockerReason || \"\").trim() || null;",
      `    const blockerReason = String(body.blockerReason || "").trim() || null;\n    const internalLaborMinutesProvided = Object.prototype.hasOwnProperty.call(body, "internalLaborMinutes");\n    const internalLaborValueProvided = Object.prototype.hasOwnProperty.call(body, "internalLaborValue");\n    const internalLaborMinutes = internalLaborMinutesProvided ? Number(body.internalLaborMinutes) : null;\n    const internalLaborValue = internalLaborValueProvided ? Number(body.internalLaborValue) : null;`,
    );
    source = source.replace(
      "    if (!requestedStatus && performerKey === undefined && !locationProvided && !resourceProvided) {",
      "    if (!requestedStatus && performerKey === undefined && !locationProvided && !resourceProvided && !internalLaborMinutesProvided && !internalLaborValueProvided) {",
    );
  }
  source = source.replace(
    "parts_review_status,partner_estimate_status,partner_confirmation_status\")",
    "parts_review_status,partner_estimate_status,partner_confirmation_status,estimated_labor_minutes,internal_labor_value\")",
  );
  source = source.replace(
    "parts_review_status,partner_estimate_status\")",
    "parts_review_status,partner_estimate_status,estimated_labor_minutes,internal_labor_value\")",
  );

  if (!source.includes("Internal labor value can only be recorded")) {
    const anchor = "    const effectiveHasPerformer = Object.prototype.hasOwnProperty.call(patch, \"assigned_partner_id\") || Object.prototype.hasOwnProperty.call(patch, \"assigned_user_id\")";
    const insert = `    const effectiveInternalAssignee = performerKey !== undefined\n      ? performerKey.startsWith("user:")\n      : Boolean(existing.assigned_user_id);\n    if ((internalLaborMinutesProvided || internalLaborValueProvided) && !effectiveInternalAssignee) {\n      return NextResponse.json({ error: "Internal labor value can only be recorded for work assigned to the Mindful team." }, { status: 409 });\n    }\n    if (internalLaborMinutesProvided) {\n      if (!Number.isFinite(internalLaborMinutes) || internalLaborMinutes == null || internalLaborMinutes < 0) return NextResponse.json({ error: "Internal labor time must be zero or greater." }, { status: 400 });\n      patch.estimated_labor_minutes = Math.round(internalLaborMinutes);\n      metadata.internalLaborMinutes = Math.round(internalLaborMinutes);\n    }\n    if (internalLaborValueProvided) {\n      if (!Number.isFinite(internalLaborValue) || internalLaborValue == null || internalLaborValue < 0) return NextResponse.json({ error: "Internal labor value must be zero or greater." }, { status: 400 });\n      patch.internal_labor_value = internalLaborValue;\n      metadata.internalLaborValue = internalLaborValue;\n    }\n\n${anchor}`;
    source = source.replace(anchor, insert);
  }

  // A partner quote and internal labor valuation are mutually exclusive active models.
  source = source.replace(
    "        patch.assigned_partner_id = partnerId;\n        patch.assigned_user_id = null;",
    "        patch.assigned_partner_id = partnerId;\n        patch.assigned_user_id = null;\n        patch.internal_labor_value = null;",
  );
  source = source.replace(
    "        patch.assigned_partner_id = null;\n        patch.assigned_user_id = null;",
    "        patch.assigned_partner_id = null;\n        patch.assigned_user_id = null;\n        patch.internal_labor_value = null;",
  );

  if (!source.includes("work_order_internal_labor_valued")) {
    const anchor = "    if (requestedStatus) {\n      await access.supabase.from(\"mindful_inventory_history\").insert({";
    const history = `    if (internalLaborMinutesProvided || internalLaborValueProvided) {\n      await access.supabase.from("mindful_inventory_history").insert({\n        company_id: access.company.companyId,\n        vehicle_id: existing.vehicle_id,\n        event_type: "work_order_internal_labor_valued",\n        entity_type: "work_order",\n        entity_id: workOrderId,\n        actor_user_id: access.userId,\n        summary: "Internal Mindful labor hours/value updated.",\n        metadata: {\n          previousLaborMinutes: existing.estimated_labor_minutes ?? null,\n          previousInternalLaborValue: existing.internal_labor_value ?? null,\n          ...metadata,\n        },\n      });\n    }\n\n${anchor}`;
    source = source.replace(anchor, history);
  }
  return source;
}, "internal labor update API");

patchFile("components/mindful-inventory/inventory-active-work-v6.tsx", (source) => {
  source = source.replace(
    /function quoteDone\(work: InventoryWorkOrderView\) \{[\s\S]*?\n\}/,
    `function quoteDone(work: InventoryWorkOrderView) {\n  if (!work.performerName) return false;\n  if (work.performerType === "internal") return Boolean((work.estimatedLaborMinutes || 0) > 0 && (work.internalLaborValue || 0) > 0);\n  if (!work.assignedPartnerId) return false;\n  return ["approved", "not_required"].includes(work.partnerEstimateStatus || "");\n}`,
  );
  source = source.replace(
    /function quoteDetail\(work: InventoryWorkOrderView\) \{[\s\S]*?\n\}/,
    `function quoteDetail(work: InventoryWorkOrderView) {\n  if (!work.performerName) return "Choose assignee";\n  if (work.performerType === "internal") return quoteDone(work) ? \`${"${hours(work.estimatedLaborMinutes)} · ${money(work.internalLaborValue)} value"}\` : "Enter hours & value";\n  if (work.partnerEstimateStatus === "approved") return "Approved";\n  if (work.partnerEstimateStatus === "not_required") return "Not required";\n  if (work.partnerEstimateStatus === "awaiting_estimate") return "Awaiting quote";\n  if (work.partnerEstimateStatus === "awaiting_review") return "Review required";\n  if (work.partnerEstimateStatus === "revision_requested") return "Revision requested";\n  return "Awaiting quote";\n}`,
  );
  source = source.replace(
    "  if (!work.performerName) return \"Choose a Partner\";\n  const estimate = estimateIssue(work);",
    "  if (!work.performerName) return \"Choose an assignee\";\n  if (work.performerType === \"internal\" && !quoteDone(work)) return \"Enter internal labor hours and value\";\n  const estimate = estimateIssue(work);",
  );
  source = source.replace(
    "  if (!work.performerName) return { label: \"Needs Partner\", cls: \"bg-amber-100 text-amber-800\" };\n  if (estimateIssue(work))",
    "  if (!work.performerName) return { label: \"Needs Assignee\", cls: \"bg-amber-100 text-amber-800\" };\n  if (work.performerType === \"internal\" && !quoteDone(work)) return { label: \"Internal Labor\", cls: \"bg-amber-100 text-amber-800\" };\n  if (estimateIssue(work))",
  );

  if (!source.includes("internalLaborHours")) {
    source = source.replace(
      "  const [partsWorkOrderId, setPartsWorkOrderId] = useState<string | null>(null);",
      "  const [partsWorkOrderId, setPartsWorkOrderId] = useState<string | null>(null);\n  const [internalLaborHours, setInternalLaborHours] = useState<Record<string, string>>({});\n  const [internalLaborValues, setInternalLaborValues] = useState<Record<string, string>>({});",
    );
  }

  source = source.replaceAll(
    'label="Quote"',
    'label={work.performerType === "internal" ? "Internal Labor" : "Quote"}',
  );
  source = source.replaceAll(
    'editingStep === 3 ? "Edit quote"',
    'editingStep === 3 ? (work.performerType === "internal" ? "Edit internal labor" : "Edit quote")',
  );
  source = source.replaceAll(
    '>3 · Quote</div>',
    '>3 · {work.performerType === "internal" ? "Internal Labor" : "Quote"}</div>',
  );

  const internalMessage = '<div className="text-xs font-bold text-emerald-700">✓ Internal Mindful work · quote not required.</div>';
  const internalEditor = `<div className="space-y-3"><div><div className="text-xs font-black text-slate-900">Internal Mindful labor</div><div className="mt-1 text-[11px] font-semibold text-slate-500">Track our team&apos;s time and the managerial value created separately from vendor cash cost. The value is carried into the vehicle&apos;s projected value.</div></div><div className="grid gap-2 sm:grid-cols-2"><label className="text-[10px] font-black uppercase text-slate-500">Labor hours<input type="number" min="0" step="0.25" value={internalLaborHours[work.id] ?? String(Math.round(((work.estimatedLaborMinutes || 0) / 60) * 100) / 100)} onChange={(event) => setInternalLaborHours((current) => ({ ...current, [work.id]: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900" /></label><label className="text-[10px] font-black uppercase text-slate-500">Internal work value<input type="number" min="0" step="25" value={internalLaborValues[work.id] ?? String(work.internalLaborValue || 0)} onChange={(event) => setInternalLaborValues((current) => ({ ...current, [work.id]: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900" /></label></div><div className="flex items-center justify-between gap-3"><div className="text-[11px] font-semibold text-slate-500">Not added to vendor cost. Applied as internal value contribution to projected vehicle value.</div><button type="button" disabled={workingId === work.id || Number(internalLaborHours[work.id] ?? ((work.estimatedLaborMinutes || 0) / 60)) <= 0 || Number(internalLaborValues[work.id] ?? (work.internalLaborValue || 0)) <= 0} onClick={() => void patchWork(work.id, { internalLaborMinutes: Math.round(Number(internalLaborHours[work.id] ?? ((work.estimatedLaborMinutes || 0) / 60)) * 60), internalLaborValue: Number(internalLaborValues[work.id] ?? (work.internalLaborValue || 0)) }, "Internal labor value saved.")} className="shrink-0 rounded-lg bg-slate-950 px-4 py-2 text-xs font-black text-white disabled:bg-slate-200 disabled:text-slate-400">Save Internal Labor</button></div></div>`;
  source = source.replaceAll(internalMessage, internalEditor);

  return source;
}, "internal labor command-center UI");

patchFile("lib/mindful-inventory/types.ts", (source) => {
  if (!source.includes("internalLaborValue?: number | null;")) {
    source = source.replace("  actualCost: number | null;", "  actualCost: number | null;\n  internalLaborValue?: number | null;\n  performerType?: \"partner\" | \"internal\" | null;");
  }
  source = source.replace(
    '  workItems: Array<Pick<InventoryWorkItem, "status" | "estimatedCost" | "actualCost">>;',
    '  workItems: Array<Pick<InventoryWorkItem, "status" | "estimatedCost" | "actualCost" | "internalLaborValue" | "performerType">>;',
  );
  if (!source.includes("internalWorkValue: number;")) {
    source = source.replace(
      "  projectedAllInCost: number;",
      "  projectedAllInCost: number;\n  internalWorkValue: number;\n  projectedVehicleValue: number | null;",
    );
  }
  return source;
}, "internal labor financial types");

patchFile("lib/mindful-inventory/financials.ts", (source) => {
  if (!source.includes("let internalWorkValue = 0;")) {
    source = source.replace("  let outstandingWorkCost = 0;", "  let outstandingWorkCost = 0;\n  let internalWorkValue = 0;");
    source = source.replace(
      "    if (item.status === \"cancelled\") {\n      continue;\n    }",
      "    if (item.status === \"cancelled\") {\n      continue;\n    }\n\n    if (item.performerType === \"internal\") internalWorkValue += safeMoney(item.internalLaborValue);",
    );
    source = source.replace(
      "  const projectedGrossProfit =\n    inputs.expectedSalePrice == null\n      ? null\n      : safeMoney(inputs.expectedSalePrice) -\n        projectedAllInCost;",
      "  const projectedVehicleValue = inputs.expectedSalePrice == null ? null : safeMoney(inputs.expectedSalePrice) + internalWorkValue;\n\n  const projectedGrossProfit =\n    projectedVehicleValue == null\n      ? null\n      : projectedVehicleValue - projectedAllInCost;",
    );
    source = source.replace(
      "    projectedAllInCost,\n    projectedGrossProfit,",
      "    projectedAllInCost,\n    internalWorkValue,\n    projectedVehicleValue,\n    projectedGrossProfit,",
    );
  }
  return source;
}, "internal labor projected-value accounting");
