import { readFileSync } from "node:fs";

const path = "components/mindful-inventory/inventory-work-plan-v2.tsx";
const source = readFileSync(path, "utf8");

// Cost evidence remains editable in Work Plan Setup, but it is no longer an
// Owner re-authorization step. The current component owns these semantics
// directly; do not mutate it back into the legacy approval UI during prebuild.
if (source.includes("WORK_PLAN_SETUP_V2")) {
  console.log("Work Plan setup owns current cost semantics; legacy cost patch skipped.");
} else {
  console.log("Legacy Work Plan cost patch retired; source left unchanged.");
}
