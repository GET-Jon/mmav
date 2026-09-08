import { readFileSync, writeFileSync } from "node:fs";

const path = "components/mindful-inventory/inventory-work-plan-v2.tsx";
const source = readFileSync(path, "utf8");
let updated = source;

// Estimate refinement is useful as underlying planning evidence, but it is not
// an Owner approval decision. Keep it out of the Approval Review UI so the
// user only has to decide Include vs Defer here.
updated = updated.replace(
  'import { WorkPlanRefineEstimateButton } from "@/components/mindful-inventory/work-plan-refine-estimate-button";\n',
  "",
);
updated = updated.replace(
  /\n\s*\{\(item\.costSource === "ai_estimate" \|\| item\.costSource === "unknown"\) \? <WorkPlanRefineEstimateButton vehicleId=\{vehicleId\} itemId=\{item\.id\} \/> : null\}/g,
  "",
);

if (updated !== source) {
  writeFileSync(path, updated, "utf8");
  console.log("Removed Refine Estimate from Work Plan approval; pricing refinement continues downstream.");
} else {
  console.log("Work Plan approval already excludes Refine Estimate.");
}
