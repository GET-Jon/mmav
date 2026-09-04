import { readFileSync, writeFileSync } from "node:fs";

function updateFile(path, transform) {
  const source = readFileSync(path, "utf8");
  const updated = transform(source);

  if (updated !== source) {
    writeFileSync(path, updated, "utf8");
    return true;
  }

  return false;
}

const evaluatorPath = "components/evaluation/evaluation-workspace.tsx";
const evaluatorChanged = updateFile(evaluatorPath, (source) => {
  const oldGate = `                  {marketCheckSearchMeta &&\n                  marketCheckSearchMeta.loadedCount === 0 &&\n                  marketCheckSearchMeta.searchStage !== "metro" &&\n                  !marketCheckLoading ? (`;

  const correctedGate = `                  {marketCheckSearchMeta &&\n                  marketCheckSearchMeta.searchStage !== "metro" &&\n                  !marketCheckLoading ? (`;

  if (source.includes(correctedGate)) {
    return source;
  }

  if (!source.includes(oldGate)) {
    throw new Error(
      "Could not find the expected Comparable Vehicles search-expansion gate. Refusing to modify the evaluator automatically.",
    );
  }

  return source.replace(oldGate, correctedGate);
});

const ownerReviewPath =
  "components/mindful-inventory/mechanical-owner-finding-review.tsx";
const ownerReviewChanged = updateFile(ownerReviewPath, (source) => {
  let updated = source;

  updated = updated.replace(
    'className={`rounded-2xl border bg-white p-4 shadow-sm sm:p-5 ${',
    'className={`rounded-2xl border bg-white p-4 shadow-sm ${',
  );

  updated = updated.replace(
    '"lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start"',
    '"lg:grid-cols-[minmax(0,1fr)_390px] lg:items-start"',
  );

  const columnClose = `          </div>\n\n          {needsDifferentPartner ? (`;
  const filledColumnClose = `            {renderFacts(finding)}\n            {renderParts(finding)}\n          </div>\n\n          {needsDifferentPartner ? (`;

  if (!updated.includes(filledColumnClose)) {
    if (!updated.includes(columnClose)) {
      throw new Error(
        "Could not find the unresolved finding content column. Refusing to modify the Owner Review layout automatically.",
      );
    }
    updated = updated.replace(columnClose, filledColumnClose);
  }

  updated = updated.replace(
    `        {renderFacts(finding)}\n        {renderParts(finding)}\n\n        {clarification && finding.mechanicalOwnerReviewNotes ? (`,
    `        {clarification && finding.mechanicalOwnerReviewNotes ? (`,
  );

  updated = updated.replace(
    'className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 lg:flex-row lg:items-end lg:justify-between"',
    'className="mt-3 flex flex-col gap-3 border-t border-slate-100 pt-3 lg:flex-row lg:items-end lg:justify-between"',
  );

  return updated;
});

if (evaluatorChanged) {
  console.log("Enabled Expand Search after successful comp pulls.");
}

if (ownerReviewChanged) {
  console.log("Tightened Mechanical Owner Review finding layout.");
}
