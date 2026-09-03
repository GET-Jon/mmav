import { readFileSync, writeFileSync } from "node:fs";

const evaluatorPath = "components/evaluation/evaluation-workspace.tsx";
const source = readFileSync(evaluatorPath, "utf8");

const oldGate = `                  {marketCheckSearchMeta &&
                  marketCheckSearchMeta.loadedCount === 0 &&
                  marketCheckSearchMeta.searchStage !== "metro" &&
                  !marketCheckLoading ? (`;

const correctedGate = `                  {marketCheckSearchMeta &&
                  marketCheckSearchMeta.searchStage !== "metro" &&
                  !marketCheckLoading ? (`;

if (source.includes(correctedGate)) {
  process.exit(0);
}

if (!source.includes(oldGate)) {
  throw new Error(
    "Could not find the expected Comparable Vehicles search-expansion gate. Refusing to modify the evaluator automatically.",
  );
}

writeFileSync(evaluatorPath, source.replace(oldGate, correctedGate), "utf8");
console.log("Enabled Expand Search after successful comp pulls.");
