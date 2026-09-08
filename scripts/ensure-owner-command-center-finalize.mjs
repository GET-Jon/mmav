import { readFileSync, writeFileSync } from "node:fs";

const path = "components/mindful-inventory/inventory-active-work-v6.tsx";
let source = readFileSync(path, "utf8");
const original = source;

// Final pass after all earlier patchers: every command-center tile must open
// independently of the current readiness state.
source = source.replace(
  /\(locationActive \|\| editingStep === 4\)(?: && work\.[^?]+?)* \? <div/g,
  `(locationActive || editingStep === 4) ? <div`,
);
source = source.replace(
  /\(scheduleActive \|\| editingStep === 5\)(?: && work\.[^?]+?)* \? <div/g,
  `(scheduleActive || editingStep === 5) ? <div`,
);

// Two-sided scheduling used to leave a hard parts gate in the rendered editor.
// Convert that gate to guidance while preserving the existing proposal / accept UI.
const lockedSchedulePrefix = `{!work.partsReadyForExecution ? <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">Locked until all required parts are received. {partsPendingLabel(work)}</div> : <>`;
const unlockedSchedulePrefix = `{<>{!work.partsReadyForExecution ? <div className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">Scheduling guidance: required parts are not ready yet. {partsPendingLabel(work)} You can still propose or change the work time.</div> : null}`;
source = source.replaceAll(lockedSchedulePrefix, unlockedSchedulePrefix);

// Older schedule variants may include a quote gate after the parts gate. Neither
// should prevent the Owner from opening the scheduler.
const lockedPartsAndQuotePrefix = `{!work.partsReadyForExecution ? <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">Locked until all required parts are received. {partsPendingLabel(work)}</div> : estimate ? <div className="rounded-lg bg-violet-50 px-3 py-2 text-xs font-bold text-violet-800">Locked: {estimate}.</div> : <>`;
const unlockedPartsAndQuotePrefix = `{<>{!work.partsReadyForExecution ? <div className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">Scheduling guidance: required parts are not ready yet. {partsPendingLabel(work)} You can still propose or change the work time.</div> : null}{estimate ? <div className="mb-2 rounded-lg bg-violet-50 px-3 py-2 text-xs font-bold text-violet-800">Scheduling guidance: {estimate}. You can still propose or change the work time.</div> : null}`;
source = source.replaceAll(lockedPartsAndQuotePrefix, unlockedPartsAndQuotePrefix);

if (source !== original) {
  writeFileSync(path, source, "utf8");
  console.log("Finalized Owner command-center tile independence and unlocked scheduling.");
} else {
  console.log("Owner command-center final state already aligned.");
}
