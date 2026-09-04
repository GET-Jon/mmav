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

const overviewPath = "components/mindful-inventory/inventory-overview-intake.tsx";
const overviewChanged = updateFile(overviewPath, (source) => {
  let updated = source;

  const oldTitleCard = `            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">\n              <div className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-400">Title Status</div>\n              <select className="mt-1 w-full bg-transparent text-base font-black text-slate-950 outline-none" value={titleStatus} onChange={(e) => setTitleStatus(e.target.value as InventoryTitleStatus)}>\n                <option value="unknown">Unknown</option>\n                <option value="awaiting">Awaiting Title</option>\n                <option value="received">Received</option>\n                <option value="issue">Issue</option>\n                <option value="not_applicable">Not Applicable</option>\n              </select>\n            </div>`;

  const guidedTitleCard = `            <div className={\`relative rounded-xl border-2 px-4 py-3 transition \${titleStatus === "unknown" ? "border-amber-400 bg-amber-50/70 shadow-sm" : "border-emerald-200 bg-white"}\`}>\n              <div className="flex items-center justify-between gap-2">\n                <div className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-400">Title Status</div>\n                {titleStatus === "unknown" ? <span className="rounded-full bg-amber-100 px-2 py-1 text-[9px] font-black uppercase tracking-[0.08em] text-amber-800">Next step</span> : null}\n              </div>\n              <div className="mt-1 flex min-h-9 items-center justify-between gap-3">\n                <div className="relative inline-flex min-w-0 items-center">\n                  <select aria-label="Title status" className="appearance-none bg-transparent pr-5 text-base font-black text-slate-950 outline-none" value={titleStatus} onChange={(e) => setTitleStatus(e.target.value as InventoryTitleStatus)}>\n                    <option value="unknown">Unknown</option>\n                    <option value="awaiting">Awaiting Title</option>\n                    <option value="received">Received</option>\n                    <option value="issue">Issue</option>\n                    <option value="not_applicable">Not Applicable</option>\n                  </select>\n                  <span aria-hidden="true" className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-700">▼</span>\n                </div>\n                <span aria-hidden="true" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-lg font-black leading-none text-white">✓</span>\n              </div>\n              {titleStatus === "unknown" ? <div className="mt-1.5 text-[11px] font-bold text-amber-800">Set the current title status to clear this step.</div> : null}\n            </div>`;

  if (!updated.includes(guidedTitleCard) && updated.includes(oldTitleCard)) {
    updated = updated.replace(oldTitleCard, guidedTitleCard);
  }

  updated = updated.replace(
    '<div className="rounded-2xl border border-slate-200 bg-slate-950 p-5 text-white shadow-sm">\n          <div className="text-xs font-black uppercase tracking-[0.1em] text-slate-500">Vehicle Owner</div>',
    '<div className={`rounded-2xl border-2 p-5 text-white shadow-sm transition ${ownerId ? "border-slate-800 bg-slate-950" : "border-amber-400 bg-slate-950 ring-4 ring-amber-100"}`}>\n          <div className="flex items-center justify-between gap-3"><div className="text-xs font-black uppercase tracking-[0.1em] text-slate-500">Vehicle Owner</div>{!ownerId ? <span className="rounded-full bg-amber-300 px-2 py-1 text-[9px] font-black uppercase tracking-[0.08em] text-amber-950">Next step</span> : null}</div>',
  );

  updated = updated.replace(
    '<p className="mt-1 text-sm font-medium text-slate-400">The internal Mindful person accountable for this car and approval decisions.</p>',
    '<p className="mt-1 text-sm font-medium text-slate-400">The internal Mindful person accountable for this car and approval decisions.</p>{!ownerId ? <p className="mt-2 text-xs font-bold text-amber-300">Assign an owner before proceeding to Mechanical.</p> : null}',
  );

  return updated;
});

const routingPath = "components/mindful-inventory/work-plan-routing-summary.tsx";
const routingChanged = updateFile(routingPath, (source) => {
  let updated = source;
  updated = updated.replace(
    '<div key={item.id} className="grid gap-3 px-4 py-3 lg:grid-cols-[minmax(0,1fr)_220px_220px] lg:items-center">',
    '<div key={item.id} className={`grid gap-3 px-4 py-3 lg:grid-cols-[minmax(0,1fr)_220px_220px] lg:items-center ${!partner ? "bg-amber-50/70 ring-1 ring-inset ring-amber-200" : ""}`}>',
  );
  updated = updated.replace(
    '{partner ? "Confirmation requested after approval" : "Assign before execution"}',
    '{partner ? "Confirmation requested after approval" : "NEXT STEP · Assign before execution"}',
  );
  return updated;
});

const partsBoardPath = "components/mindful-inventory/inventory-parts-board.tsx";
const partsBoardChanged = updateFile(partsBoardPath, (source) => {
  let updated = source;
  updated = updated.replace(
    '!item.fulfillmentMethod ? "border-amber-200" : "border-slate-200"',
    '!item.fulfillmentMethod ? "border-2 border-amber-400 bg-amber-50/40 shadow-sm" : "border-slate-200"',
  );
  updated = updated.replace(
    '{fulfillmentLabel(item.fulfillmentMethod)}</span>',
    '{!item.fulfillmentMethod ? "NEXT STEP · " : ""}{fulfillmentLabel(item.fulfillmentMethod)}</span>',
  );
  return updated;
});

const partnerWorkPath = "components/partner/partner-work-list-v4.tsx";
const partnerWorkChanged = updateFile(partnerWorkPath, (source) => {
  return source.replace(
    'className="mt-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3"',
    'className="mt-3 rounded-xl border-2 border-amber-300 bg-amber-50 px-4 py-3 shadow-sm"',
  ).replace(
    'className="text-[9px] font-black uppercase tracking-[0.12em] text-blue-700">Action required',
    'className="text-[9px] font-black uppercase tracking-[0.12em] text-amber-800">Next step',
  );
});

if (evaluatorChanged) console.log("Enabled Expand Search after successful comp pulls.");
if (ownerReviewChanged) console.log("Tightened Mechanical Owner Review finding layout.");
if (overviewChanged) console.log("Added guided next-action cues to Overview / Intake.");
if (routingChanged) console.log("Added Work Plan next-action routing cues.");
if (partsBoardChanged) console.log("Strengthened Parts Board sourcing cues.");
if (partnerWorkChanged) console.log("Standardized partner next-step guidance.");
