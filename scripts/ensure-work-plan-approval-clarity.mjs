import { readFileSync, writeFileSync } from "node:fs";

const path = "components/mindful-inventory/inventory-work-plan-v2.tsx";
const source = readFileSync(path, "utf8");
let updated = source;

function replaceIfPresent(oldText, newText) {
  if (updated.includes(newText)) return;
  if (updated.includes(oldText)) updated = updated.replace(oldText, newText);
}

// Decision progress is the primary state on this screen. Quotes and partner
// assignments are intentionally allowed to continue later in Active Work.
const pricedAnchor = '  const pricedTotal = activeItems.reduce((sum, item) => sum + ((item.costSource === "unknown" || item.costSource === "ai_estimate" || item.planningAmount <= 0) ? 0 : item.planningAmount), 0);';
if (updated.includes(pricedAnchor) && !updated.includes('const decisionCompleteCount =')) {
  updated = updated.replace(
    pricedAnchor,
    `${pricedAnchor}\n  const decisionCompleteCount = plan.draftItems.filter((item) => item.decision === "approved" || item.decision === "declined" || item.decision === "monitor").length;\n  const decisionTotal = plan.draftItems.length;\n  const decisionPendingCount = activeItems.filter((item) => item.decision !== "approved").length;\n  const includedItems = activeItems.filter((item) => item.decision === "approved");`,
  );
}

replaceIfPresent(
  '<span className="rounded-xl bg-slate-50 px-3 py-2 text-xs font-black text-slate-700">{activeItems.length} included</span>\n          <span className="rounded-xl bg-slate-50 px-3 py-2 text-xs font-black text-slate-700">{hours(laborTotal)} labor</span>\n          <span className={`rounded-xl px-3 py-2 text-xs font-black ${quotePending ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-800"}`}>{quotePending ? `${quotePending} quote${quotePending === 1 ? "" : "s"} pending` : `${money(pricedTotal)} priced`}</span>',
  '<span className={`rounded-xl px-3 py-2 text-xs font-black ${decisionPendingCount ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-800"}`}>{decisionCompleteCount} of {decisionTotal} decisions complete</span>\n          <span className="rounded-xl bg-slate-50 px-3 py-2 text-xs font-black text-slate-700">{hours(laborTotal)} planned labor</span>\n          {quotePending ? <span className="rounded-xl bg-slate-50 px-3 py-2 text-xs font-black text-slate-600">{quotePending} final quote{quotePending === 1 ? "" : "s"} to collect later</span> : <span className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700">Pricing ready ✓</span>}',
);

replaceIfPresent(
  '<p className="mt-1 text-sm text-slate-500">Confirm the scope and the next authorization for each item.</p>',
  '<p className="mt-1 max-w-4xl text-sm text-slate-500"><span className="font-bold text-slate-700">Review each item and choose Include or Defer.</span> Partner assignment and final quotes can be completed later in Active Work.</p>',
);
replaceIfPresent(
  '<p className="mt-1 text-sm text-slate-500">Decide what belongs in the Work Plan. Quotes and partner assignments can be finalized later in Active Work.</p>',
  '<p className="mt-1 max-w-4xl text-sm text-slate-500"><span className="font-bold text-slate-700">Review each item and choose Include or Defer.</span> Partner assignment and final quotes can be completed later in Active Work.</p>',
);

const computeAnchor = '          const investigation = item.classification === "investigate" || item.decision === "investigate" || item.managerInvestigationRequired;\n          const inspectionEvidence = getInspectionCostEvidence(item);';
if (updated.includes(computeAnchor) && !updated.includes('const decisionIncluded = item.decision === "approved";')) {
  updated = updated.replace(computeAnchor, `${computeAnchor}\n          const decisionIncluded = item.decision === "approved";`);
}

replaceIfPresent(
  'return <article key={item.id} className={`rounded-xl border p-4 ${quoteRequired || !partner ? "border-amber-200 bg-amber-50/30" : "border-slate-200 bg-white"}`}>',
  'return <article key={item.id} className={`rounded-xl border p-4 transition ${decisionIncluded ? "border-emerald-200 bg-emerald-50/35" : "border-amber-200 bg-amber-50/30"}`}>',
);
replaceIfPresent(
  'return <article key={item.id} className={`rounded-xl border p-4 ${item.decision === "approved" ? "border-emerald-200 bg-emerald-50/25" : "border-amber-200 bg-amber-50/30"}`}>',
  'return <article key={item.id} className={`rounded-xl border p-4 transition ${decisionIncluded ? "border-emerald-200 bg-emerald-50/35" : "border-amber-200 bg-amber-50/30"}`}>',
);

replaceIfPresent(
  '<div className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-400">Partner</div>',
  '<div className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-400">Preferred partner <span className="normal-case tracking-normal text-slate-300">(optional)</span></div>',
);
replaceIfPresent(
  '<select disabled={partnerSaving === item.id} value={item.suggestedPartnerId || ""} onChange={(e) => void updatePartner(item, e.target.value || null)} className={`mt-1 w-full rounded-lg border px-2.5 py-2 text-xs font-black outline-none ${partner ? "border-slate-200 bg-white text-slate-800" : "border-amber-300 bg-amber-50 text-amber-900"}`}>',
  '<select disabled={partnerSaving === item.id} value={item.suggestedPartnerId || ""} onChange={(e) => void updatePartner(item, e.target.value || null)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-black text-slate-800 outline-none">',
);
replaceIfPresent('<option value="">Assign in Active Work</option>', '<option value="">Assign later in Active Work</option>');

replaceIfPresent(
  '<div className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-400">Next authorization</div>\n                <div className={`mt-1 text-sm font-black ${quoteRequired ? "text-amber-800" : "text-emerald-700"}`}>\n                  {quoteRequired ? (investigation ? "Authorize diagnosis / quote" : "Quote required before repair") : `${money(item.planningAmount)} repair authorization`}\n                </div>\n                <button type="button" onClick={() => openEdit(item)} className="mt-1 cursor-pointer text-xs font-black text-slate-600 underline decoration-slate-300 underline-offset-2 hover:text-slate-950">{quoteRequired ? "Add / update quote" : "Review cost"}</button>',
  '<div className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-400">After approval</div>\n                <div className="mt-1 text-sm font-black text-slate-700">\n                  {quoteRequired ? (investigation ? "Diagnosis / final quote in Active Work" : "Final quote before repair") : `${money(item.planningAmount)} currently priced`}\n                </div>\n                <button type="button" onClick={() => openEdit(item)} className="mt-1 cursor-pointer text-xs font-bold text-slate-500 underline decoration-slate-300 underline-offset-2 hover:text-slate-800">{quoteRequired ? "Enter quote now (optional)" : "Review pricing"}</button>',
);
replaceIfPresent(
  '<div className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-400">After approval</div>\n                <div className={`mt-1 text-sm font-black ${quoteRequired ? "text-amber-800" : "text-emerald-700"}`}>\n                  {quoteRequired ? (investigation ? "Authorize diagnosis / quote" : "Quote required before repair") : `${money(item.planningAmount)} repair authorization`}\n                </div>\n                <button type="button" onClick={() => openEdit(item)} className="mt-1 cursor-pointer text-xs font-black text-slate-600 underline decoration-slate-300 underline-offset-2 hover:text-slate-950">{quoteRequired ? "Enter quote now (optional)" : "Review cost"}</button>',
  '<div className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-400">After approval</div>\n                <div className="mt-1 text-sm font-black text-slate-700">\n                  {quoteRequired ? (investigation ? "Diagnosis / final quote in Active Work" : "Final quote before repair") : `${money(item.planningAmount)} currently priced`}\n                </div>\n                <button type="button" onClick={() => openEdit(item)} className="mt-1 cursor-pointer text-xs font-bold text-slate-500 underline decoration-slate-300 underline-offset-2 hover:text-slate-800">{quoteRequired ? "Enter quote now (optional)" : "Review pricing"}</button>',
);

// Remove any legacy refinement UI if an older checkout still contains it.
updated = updated.replace('import { WorkPlanRefineEstimateButton } from "@/components/mindful-inventory/work-plan-refine-estimate-button";\n', "");
updated = updated.replace(/\n\s*\{\(item\.costSource === "ai_estimate" \|\| item\.costSource === "unknown"\) \? <WorkPlanRefineEstimateButton vehicleId=\{vehicleId\} itemId=\{item\.id\} \/> : null\}/g, "");

replaceIfPresent(
  '<h3 className="mt-1 text-lg font-black text-slate-950">{activeItems.length} items · {money(pricedTotal)} authorized now{quotePending ? ` · ${quotePending} quote${quotePending === 1 ? "" : "s"} pending` : ""}</h3>\n          <p className="mt-1 max-w-3xl text-sm font-medium text-slate-500">Approval creates the next executable work. Quote-only or diagnostic items can move forward without authorizing unknown downstream repair.</p>',
  '<h3 className="mt-1 text-lg font-black text-slate-950">{includedItems.length} included · {deferredItems.length} deferred{decisionPendingCount ? ` · ${decisionPendingCount} decision${decisionPendingCount === 1 ? "" : "s"} remaining` : ""}</h3>\n          <p className="mt-1 max-w-3xl text-sm font-medium text-slate-500">Once every item is included or deferred, create Active Work. Final quotes, partner confirmation, parts, and scheduling continue there.</p>',
);

replaceIfPresent(
  '<button disabled={working || activeItems.length === 0} type="button" onClick={activatePlan} className="shrink-0 cursor-pointer rounded-xl bg-slate-950 px-6 py-3 text-sm font-black text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300">{working ? "Creating Active Work…" : "Approve & Create Active Work →"}</button>',
  '<button disabled={working || includedItems.length === 0 || decisionPendingCount > 0} type="button" onClick={activatePlan} className="shrink-0 cursor-pointer rounded-xl bg-slate-950 px-6 py-3 text-sm font-black text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300">{working ? "Creating Active Work…" : decisionPendingCount > 0 ? `Resolve ${decisionPendingCount} decision${decisionPendingCount === 1 ? "" : "s"} above` : "Approve & Create Active Work →"}</button>',
);

if (updated !== source) {
  writeFileSync(path, updated, "utf8");
  console.log("Clarified Work Plan approval as an Include/Defer decision checklist.");
} else {
  console.log("Work Plan approval clarity already applied.");
}
