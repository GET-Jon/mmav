import { readFileSync, writeFileSync } from "node:fs";

const path = "components/mindful-inventory/inventory-work-plan-v2.tsx";
let source = readFileSync(path, "utf8");
let changed = false;

const importLine = 'import { WorkPlanRefineEstimateButton } from "@/components/mindful-inventory/work-plan-refine-estimate-button";';
if (!source.includes(importLine)) {
  const anchor = 'import type { InventoryPerformerOption } from "@/lib/mindful-inventory/performers";';
  if (!source.includes(anchor)) throw new Error("Could not find Work Plan import anchor for Refine Estimate UI.");
  source = source.replace(anchor, `${anchor}\n${importLine}`);
  changed = true;
}

const refineMarkup = '{(item.costSource === "ai_estimate" || item.costSource === "unknown") ? <WorkPlanRefineEstimateButton vehicleId={vehicleId} itemId={item.id} /> : null}';
if (!source.includes(refineMarkup)) {
  const anchor = '<button type="button" onClick={() => openEdit(item)} className="mt-1 cursor-pointer text-xs font-black text-slate-600 underline decoration-slate-300 underline-offset-2 hover:text-slate-950">{quoteRequired ? "Add / update quote" : "Review cost"}</button>';
  if (!source.includes(anchor)) throw new Error("Could not find Work Plan cost-action anchor for Refine Estimate UI.");
  source = source.replace(anchor, `${anchor}\n                ${refineMarkup}`);
  changed = true;
}

if (changed) {
  writeFileSync(path, source, "utf8");
  console.log("Added Refine Estimate action to Work Plan AI/unknown-cost items.");
}
