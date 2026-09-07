import { readFileSync, writeFileSync } from "node:fs";

const path = "components/mindful-inventory/inventory-work-plan-v2.tsx";
let source = readFileSync(path, "utf8");
let changed = false;

function replaceOnce(oldText, newText, label) {
  if (source.includes(newText)) return;
  if (!source.includes(oldText)) throw new Error(`Could not find ${label}. Refusing to patch Work Plan approval clarity automatically.`);
  source = source.replace(oldText, newText);
  changed = true;
}

// Refine Estimate adds a second, ambiguous cost action. The approval screen only needs
// an optional quote-entry action; deeper estimate refinement belongs outside this decision pass.
const refineImport = 'import { WorkPlanRefineEstimateButton } from "@/components/mindful-inventory/work-plan-refine-estimate-button";\n';
if (source.includes(refineImport)) {
  source = source.replace(refineImport, "");
  changed = true;
}
const refineMarkup = '                {(item.costSource === "ai_estimate" || item.costSource === "unknown") ? <WorkPlanRefineEstimateButton vehicleId={vehicleId} itemId={item.id} /> : null}\n';
if (source.includes(refineMarkup)) {
  source = source.replace(refineMarkup, "");
  changed = true;
}

replaceOnce(
  '<p className="mt-1 text-sm text-slate-500">Confirm the scope and the next authorization for each item.</p>',
  '<p className="mt-1 text-sm text-slate-500">Decide what belongs in the Work Plan. Quotes and partner assignments can be finalized later in Active Work.</p>',
  "Approval Review helper text",
);

replaceOnce(
  'return <article key={item.id} className={`rounded-xl border p-4 ${quoteRequired || !partner ? "border-amber-200 bg-amber-50/30" : "border-slate-200 bg-white"}`}>',
  'return <article key={item.id} className={`rounded-xl border p-4 ${item.decision === "approved" ? "border-emerald-200 bg-emerald-50/25" : "border-amber-200 bg-amber-50/30"}`}>',
  "Work Plan item readiness color",
);

replaceOnce(
  '<div className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-400">Partner</div>',
  '<div className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-400">Preferred partner <span className="normal-case tracking-normal text-slate-300">(optional)</span></div>',
  "partner label",
);

replaceOnce(
  '<select disabled={partnerSaving === item.id} value={item.suggestedPartnerId || ""} onChange={(e) => void updatePartner(item, e.target.value || null)} className={`mt-1 w-full rounded-lg border px-2.5 py-2 text-xs font-black outline-none ${partner ? "border-slate-200 bg-white text-slate-800" : "border-amber-300 bg-amber-50 text-amber-900"}`}>',
  '<select disabled={partnerSaving === item.id} value={item.suggestedPartnerId || ""} onChange={(e) => void updatePartner(item, e.target.value || null)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-black text-slate-800 outline-none">',
  "partner selector tone",
);

replaceOnce(
  '<option value="">Assign in Active Work</option>',
  '<option value="">Assign later in Active Work</option>',
  "partner placeholder",
);

replaceOnce(
  '<div className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-400">Next authorization</div>',
  '<div className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-400">After approval</div>',
  "next authorization label",
);

replaceOnce(
  '<button type="button" onClick={() => openEdit(item)} className="mt-1 cursor-pointer text-xs font-black text-slate-600 underline decoration-slate-300 underline-offset-2 hover:text-slate-950">{quoteRequired ? "Add / update quote" : "Review cost"}</button>',
  '<button type="button" onClick={() => openEdit(item)} className="mt-1 cursor-pointer text-xs font-black text-slate-600 underline decoration-slate-300 underline-offset-2 hover:text-slate-950">{quoteRequired ? "Enter quote now (optional)" : "Review cost"}</button>',
  "quote action label",
);

replaceOnce(
  '{quotePending ? `${quotePending} quote${quotePending === 1 ? "" : "s"} pending` : `${money(pricedTotal)} priced`}',
  '{quotePending ? `${quotePending} quote${quotePending === 1 ? "" : "s"} needed later` : `${money(pricedTotal)} priced`}',
  "quote summary badge",
);

if (changed) {
  writeFileSync(path, source, "utf8");
  console.log("Clarified Work Plan approval versus downstream quote/routing work.");
} else {
  console.log("Work Plan approval clarity already applied.");
}
