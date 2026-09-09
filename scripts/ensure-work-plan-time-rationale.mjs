import { readFileSync, writeFileSync } from "node:fs";

function patch(path, transform) {
  const source = readFileSync(path, "utf8");
  const updated = transform(source);
  if (updated !== source) writeFileSync(path, updated, "utf8");
  return updated !== source;
}

let changed = false;

changed = patch("lib/mindful-inventory/car-plan.ts", (source) => {
  if (!source.includes("laborEstimateRationale: string | null;")) {
    source = source.replace(
      "  estimatedElapsedHours: number | null;",
      "  estimatedElapsedHours: number | null;\n  laborEstimateRationale: string | null;\n  elapsedEstimateRationale: string | null;",
    );
  }

  source = source.replace(
    "planning_amount,estimated_duration_hours,estimated_labor_hours,estimated_elapsed_hours,suggested_partner_id",
    "planning_amount,estimated_duration_hours,estimated_labor_hours,estimated_elapsed_hours,labor_estimate_rationale,elapsed_estimate_rationale,suggested_partner_id",
  );

  if (!source.includes("laborEstimateRationale: (row.labor_estimate_rationale")) {
    const plain = "    estimatedElapsedHours: nullableNumber(row.estimated_elapsed_hours),";
    const casted = "    estimatedElapsedHours: nullableNumber(row.estimated_elapsed_hours as number | string | null),";
    const anchor = source.includes(plain) ? plain : source.includes(casted) ? casted : null;
    if (anchor) {
      source = source.replace(
        anchor,
        `${anchor}\n    laborEstimateRationale: (row.labor_estimate_rationale as string | null) ?? null,\n    elapsedEstimateRationale: (row.elapsed_estimate_rationale as string | null) ?? null,`,
      );
    }
  }

  return source;
}) || changed;

changed = patch("components/mindful-inventory/inventory-work-plan.tsx", (source) => {
  if (!source.includes("Lot Logic timing rationale")) {
    source = source.replace(
      "                    {item.description ? <p className=\"mt-2 text-sm text-slate-600\">{item.description}</p> : null}",
      "                    {item.description ? <p className=\"mt-2 text-sm text-slate-600\">{item.description}</p> : null}\n                    {(item.laborEstimateRationale || item.elapsedEstimateRationale) ? <div className=\"mt-2 rounded-lg bg-blue-50 px-3 py-2 text-[11px] text-blue-900\"><div className=\"font-black\">Lot Logic timing rationale</div>{item.laborEstimateRationale ? <div className=\"mt-1\"><span className=\"font-black\">Labor:</span> {item.laborEstimateRationale}</div> : null}{item.elapsedEstimateRationale ? <div className=\"mt-1\"><span className=\"font-black\">Turnaround:</span> {item.elapsedEstimateRationale}</div> : null}</div> : null}",
    );
  }

  if (!source.includes("Material timing change was not confirmed")) {
    source = source.replace(
      "    try {\n      const response = await fetch(`/api/mindful/inventory/vehicles/${vehicleId}/car-plan/items`, {",
      `    try {\n      if (editingItem) {\n        const nextLabor = numberOrNull(laborHours);\n        const nextElapsed = numberOrNull(turnaroundHours);\n        const laborBase = editingItem.estimatedLaborHours;\n        const elapsedBase = editingItem.estimatedElapsedHours ?? editingItem.estimatedDurationHours;\n        const laborDeviation = nextLabor != null && laborBase != null && laborBase > 0 ? Math.abs(nextLabor - laborBase) / laborBase : 0;\n        const elapsedDeviation = nextElapsed != null && elapsedBase != null && elapsedBase > 0 ? Math.abs(nextElapsed - elapsedBase) / elapsedBase : 0;\n        if (laborDeviation > 0.25 || elapsedDeviation > 0.25) {\n          const details = [laborDeviation > 0.25 ? \`Labor changes from \${laborBase} hr to \${nextLabor} hr (\${Math.round(laborDeviation * 100)}%).\\nAI rationale: \${editingItem.laborEstimateRationale || "Legacy estimate; detailed rationale was not recorded."}\` : null, elapsedDeviation > 0.25 ? \`Turnaround changes from \${elapsedBase} hr to \${nextElapsed} hr (\${Math.round(elapsedDeviation * 100)}%).\\nAI rationale: \${editingItem.elapsedEstimateRationale || "Legacy estimate; detailed rationale was not recorded."}\` : null].filter(Boolean).join("\\n\\n");\n          if (!window.confirm(\`Lot Logic flagged a material timing change (>25%).\\n\\n\${details}\\n\\nConfirm this estimate anyway?\`)) throw new Error("Material timing change was not confirmed.");\n        }\n      }\n      const response = await fetch(\`/api/mindful/inventory/vehicles/\${vehicleId}/car-plan/items\`, {`,
    );
  }

  return source;
}) || changed;

console.log(changed ? "Made AI timing rationale visible and protected material Work Plan overrides." : "Work Plan timing rationale already aligned.");
