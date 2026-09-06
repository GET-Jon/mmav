import { readFileSync, writeFileSync } from "node:fs";

const path = "components/mindful-inventory/inventory-work-plan-v2.tsx";
const source = readFileSync(path, "utf8");
let updated = source;

function replaceOnce(oldText, newText, label) {
  if (updated.includes(newText)) return;
  if (!updated.includes(oldText)) {
    throw new Error(`Could not find ${label}. Refusing to patch Work Plan cost semantics automatically.`);
  }
  updated = updated.replace(oldText, newText);
}

replaceOnce(
  '  const quotePending = activeItems.filter((item) => item.costSource === "unknown" || item.planningAmount <= 0).length;',
  '  const quotePending = activeItems.filter((item) => item.costSource === "unknown" || item.costSource === "ai_estimate" || item.planningAmount <= 0).length;',
  "AI estimate pending-confirmation count",
);

replaceOnce(
  '  const pricedTotal = activeItems.reduce((sum, item) => sum + ((item.costSource === "unknown" || item.planningAmount <= 0) ? 0 : item.planningAmount), 0);',
  [
    '  const pricedTotal = activeItems.reduce((sum, item) => sum + ((item.costSource === "unknown" || item.costSource === "ai_estimate" || item.planningAmount <= 0) ? 0 : item.planningAmount), 0);',
    '',
    '  function getInspectionCostEvidence(item: InventoryPlanItemView) {',
    '    const linked = item.findingIds.map((id) => findingsById.get(id)).filter(Boolean) as InventoryFindingView[];',
    '    const laborPrices = linked',
    '      .map((finding) => finding.mechanicalProposedLaborPrice)',
    '      .filter((value): value is number => value !== null && value !== undefined && Number.isFinite(value));',
    '    const estimateLows = linked',
    '      .map((finding) => finding.estimatedCostLow)',
    '      .filter((value): value is number => value !== null && value !== undefined && Number.isFinite(value));',
    '    const estimateHighs = linked',
    '      .map((finding) => finding.estimatedCostHigh)',
    '      .filter((value): value is number => value !== null && value !== undefined && Number.isFinite(value));',
    '',
    '    return {',
    '      labor: laborPrices.reduce((sum, value) => sum + value, 0),',
    '      laborContributors: laborPrices.length,',
    '      estimateLow: estimateLows.length ? estimateLows.reduce((sum, value) => sum + value, 0) : null,',
    '      estimateHigh: estimateHighs.length ? estimateHighs.reduce((sum, value) => sum + value, 0) : null,',
    '      sourceCount: linked.length,',
    '    };',
    '  }',
    '',
    '  const editingEvidence = editing ? getInspectionCostEvidence(editing) : null;',
  ].join('\n'),
  "Work Plan cost totals anchor",
);

replaceOnce(
  '    setCostDetail(item.costSourceDetail || "");',
  '    setCostDetail(item.costSource === "unknown" ? "" : item.costSourceDetail || "");',
  "cost editor initialization",
);

replaceOnce(
  '          costSourceDetail: costDetail,',
  '          costSourceDetail: costDetail.trim() || (costSource === "unknown" ? editing.costSourceDetail || "" : ""),',
  "cost detail persistence",
);

replaceOnce(
  '          const quoteRequired = item.costSource === "unknown" || item.planningAmount <= 0;',
  '          const quoteRequired = item.costSource === "unknown" || item.costSource === "ai_estimate" || item.planningAmount <= 0;',
  "AI estimate remains provisional",
);

replaceOnce(
  '          const investigation = item.classification === "investigate" || item.decision === "investigate" || item.managerInvestigationRequired;',
  '          const investigation = item.classification === "investigate" || item.decision === "investigate" || item.managerInvestigationRequired;\n          const inspectionEvidence = getInspectionCostEvidence(item);',
  "Approval Review evidence computation",
);

replaceOnce(
  '{sourceFindings.length ? <div className="mt-2 text-xs font-semibold text-slate-400">Based on: {sourceFindings.map((finding) => finding!.title).join(" · ")}</div> : null}',
  '{sourceFindings.length ? <div className="mt-2 text-xs font-semibold text-slate-400">Based on: {sourceFindings.map((finding) => finding!.title).join(" · ")}</div> : null}\n                {quoteRequired && inspectionEvidence.labor > 0 ? <div className="mt-2 inline-flex rounded-lg bg-blue-50 px-2.5 py-1.5 text-xs font-bold text-blue-800">Inspection evidence: {money(inspectionEvidence.labor)} labor known · final parts / total quote pending</div> : null}',
  "Approval Review inspection evidence display",
);

replaceOnce(
  '<div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">Cost & quote</div>',
  '<div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">Cost evidence & quote</div>',
  "cost modal heading",
);

const evidencePanel = [
  '        {editingEvidence ? <div className="mt-5 rounded-2xl border border-blue-200 bg-blue-50/50 p-4">',
  '          <div className="text-[10px] font-black uppercase tracking-[0.1em] text-blue-700">Inspection cost evidence</div>',
  '          <div className="mt-2 grid gap-3 sm:grid-cols-3">',
  '            <div><div className="text-[10px] font-black uppercase text-slate-400">Known labor</div><div className="mt-1 text-lg font-black text-slate-950">{editingEvidence.labor > 0 ? money(editingEvidence.labor) : "Not provided"}</div></div>',
  '            <div><div className="text-[10px] font-black uppercase text-slate-400">Inspection estimate</div><div className="mt-1 text-sm font-black text-slate-800">{editingEvidence.estimateLow !== null || editingEvidence.estimateHigh !== null ? <>{money(editingEvidence.estimateLow)} – {money(editingEvidence.estimateHigh)}</> : "Not provided"}</div></div>',
  '            <div><div className="text-[10px] font-black uppercase text-slate-400">Formal quote</div><div className="mt-1 text-sm font-black text-amber-800">{editing.costSource === "known_quote" && editing.planningAmount > 0 ? money(editing.planningAmount) : "Pending"}</div></div>',
  '          </div>',
  '          <p className="mt-3 text-xs font-semibold leading-5 text-slate-600">Mechanical values and AI estimates are planning evidence, not a formal downstream quote. A repair is only financially authorized once a sufficiently known total is entered below.</p>',
  '          {editing.costSource === "unknown" && editing.costSourceDetail ? <div className="mt-3 rounded-lg bg-white/80 px-3 py-2 text-xs text-slate-600"><span className="font-black">Work Plan synthesis:</span> {editing.costSourceDetail}</div> : null}',
  '        </div> : null}',
  '        <div className="mt-5 grid gap-4 sm:grid-cols-2">',
].join('\n');

replaceOnce(
  '        <div className="mt-5 grid gap-4 sm:grid-cols-2">',
  evidencePanel,
  "inspection evidence panel",
);

replaceOnce(
  '<label><div className="mb-1 text-xs font-black uppercase text-slate-500">Planning amount</div><input className={inputClass} inputMode="decimal" value={planningAmount} onChange={(e) => setPlanningAmount(e.target.value)} /></label>',
  '<label><div className="mb-1 text-xs font-black uppercase text-slate-500">Authorized / quoted total</div><input className={inputClass} inputMode="decimal" value={planningAmount} onChange={(e) => setPlanningAmount(e.target.value)} placeholder="Total amount when sufficiently known" /></label>',
  "planning amount label",
);

replaceOnce(
  '<label className="sm:col-span-2"><div className="mb-1 text-xs font-black uppercase text-slate-500">Quote / cost detail</div><input className={inputClass} value={costDetail} onChange={(e) => setCostDetail(e.target.value)} placeholder="Partner, quote reference, or pricing context" /></label>',
  '<label className="sm:col-span-2"><div className="mb-1 text-xs font-black uppercase text-slate-500">Formal quote / pricing detail</div><input className={inputClass} value={costDetail} onChange={(e) => setCostDetail(e.target.value)} placeholder="Partner quote, quote reference, or manager pricing context" /></label>',
  "formal quote detail label",
);

replaceOnce(
  '>Save Cost Details</button>',
  '>Save Pricing Details</button>',
  "cost save button label",
);

if (updated !== source) {
  writeFileSync(path, updated, "utf8");
  console.log("Separated Mechanical/AI cost evidence from formal Work Plan authorization.");
}
