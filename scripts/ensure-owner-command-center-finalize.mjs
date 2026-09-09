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

// Once the Owner explicitly selects a tile, that tile becomes the one and only
// editor shown below the status row. When nothing is selected, Lot Logic may still
// surface the current recommended setup item as a default suggestion.
for (const [step, active] of [
  [1, "partsActive"],
  [2, "partnerActive"],
  [3, "quoteActive"],
  [4, "locationActive"],
  [5, "scheduleActive"],
]) {
  source = source.replaceAll(
    `(${active} || editingStep === ${step})`,
    `(editing ? editingStep === ${step} : ${active})`,
  );
}

// Make the editor heading identify what the Owner intentionally opened.
source = source.replace(
  `{editing ? "Edit setup" : "Next setup step"}`,
  `{editing ? editingStep === 1 ? "Edit parts" : editingStep === 2 ? "Change partner" : editingStep === 3 ? "Edit quote" : editingStep === 4 ? "Edit location" : editingStep === 5 ? "Edit schedule" : "Edit setup" : "Next setup step"}`,
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
  console.log("Finalized Owner command-center tile independence, exclusive editing, and unlocked scheduling.");
} else {
  console.log("Owner command-center final state already aligned.");
}
