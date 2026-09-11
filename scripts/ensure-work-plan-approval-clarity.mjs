import { readFileSync } from "node:fs";

const path = "components/mindful-inventory/inventory-work-plan-v2.tsx";
const source = readFileSync(path, "utf8");

// The current Work Plan deliberately carries Owner-authorized scope forward.
// Do not reintroduce the legacy Include / Defer approval checklist at build time.
if (source.includes("WORK_PLAN_SETUP_V2")) {
  console.log("Work Plan setup already uses inherited authorization; legacy approval checklist patch skipped.");
} else {
  console.log("Legacy Work Plan approval patch retired; source left unchanged.");
}
