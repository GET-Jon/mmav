import { readFileSync, writeFileSync } from "node:fs";

function patch(path, transform) {
  const source = readFileSync(path, "utf8");
  const updated = transform(source);
  if (updated !== source) writeFileSync(path, updated, "utf8");
  return updated !== source;
}

let changed = false;

changed = patch("app/api/mindful/inventory/vehicles/[id]/work-plan/generate/route.ts", (source) => {
  if (!source.includes("ai_estimated_labor_hours: item.estimatedLaborHours")) {
    source = source.replace(
      "            estimated_labor_hours: item.estimatedLaborHours,\n            estimated_elapsed_hours: item.estimatedElapsedHours,",
      "            estimated_labor_hours: item.estimatedLaborHours,\n            estimated_elapsed_hours: item.estimatedElapsedHours,\n            ai_estimated_labor_hours: item.estimatedLaborHours,\n            ai_estimated_elapsed_hours: item.estimatedElapsedHours,",
    );
  }
  return source;
}) || changed;

changed = patch("lib/mindful-inventory/car-plan.ts", (source) => {
  if (!source.includes("aiEstimatedLaborHours: number | null;")) {
    source = source.replace(
      "  estimatedElapsedHours: number | null;",
      "  estimatedElapsedHours: number | null;\n  aiEstimatedLaborHours: number | null;\n  aiEstimatedElapsedHours: number | null;",
    );
  }

  source = source.replace(
    "estimated_duration_hours,estimated_labor_hours,estimated_elapsed_hours,labor_estimate_rationale,elapsed_estimate_rationale,suggested_partner_id",
    "estimated_duration_hours,estimated_labor_hours,estimated_elapsed_hours,ai_estimated_labor_hours,ai_estimated_elapsed_hours,labor_estimate_rationale,elapsed_estimate_rationale,suggested_partner_id",
  );
  source = source.replace(
    "estimated_duration_hours,estimated_labor_hours,estimated_elapsed_hours,suggested_partner_id",
    "estimated_duration_hours,estimated_labor_hours,estimated_elapsed_hours,ai_estimated_labor_hours,ai_estimated_elapsed_hours,suggested_partner_id",
  );

  if (!source.includes("aiEstimatedLaborHours: nullableNumber(row.ai_estimated_labor_hours")) {
    const plain = "    estimatedElapsedHours: nullableNumber(row.estimated_elapsed_hours),";
    const casted = "    estimatedElapsedHours: nullableNumber(row.estimated_elapsed_hours as number | string | null),";
    const anchor = source.includes(plain) ? plain : source.includes(casted) ? casted : null;
    if (anchor) {
      source = source.replace(
        anchor,
        `${anchor}\n    aiEstimatedLaborHours: nullableNumber(row.ai_estimated_labor_hours),\n    aiEstimatedElapsedHours: nullableNumber(row.ai_estimated_elapsed_hours),`,
      );
    }
  }

  return source;
}) || changed;

changed = patch("components/mindful-inventory/inventory-work-plan.tsx", (source) => {
  source = source.replace(
    "        const laborBase = editingItem.estimatedLaborHours;\n        const elapsedBase = editingItem.estimatedElapsedHours ?? editingItem.estimatedDurationHours;",
    "        const laborBase = editingItem.aiEstimatedLaborHours ?? editingItem.estimatedLaborHours;\n        const elapsedBase = editingItem.aiEstimatedElapsedHours ?? editingItem.estimatedElapsedHours ?? editingItem.estimatedDurationHours;",
  );
  return source;
}) || changed;

console.log(changed ? "Preserved original AI timing baselines through Work Plan edits." : "AI timing baseline already aligned.");
