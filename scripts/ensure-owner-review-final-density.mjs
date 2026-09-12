import { readFileSync, writeFileSync } from "node:fs";

const path = "components/mindful-inventory/mechanical-owner-finding-review-v2.tsx";
let source = readFileSync(path, "utf8");

if (source.includes('data-owner-review-density="decision-v2"')) {
  console.log("Owner mechanical review already uses the final decision-density layout.");
  process.exit(0);
}

let changed = false;

const provenance = '            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 text-[10px] font-bold text-slate-400">\n              <span>{sourceLabel(finding.source)}</span>\n              <span>·</span>\n              <span>{validationLabel(finding.mechanicalValidationStatus)}</span>\n            </div>\n';
if (source.includes(provenance)) {
  source = source.replace(provenance, "");
  changed = true;
}

const decisionStart = source.indexOf('  function renderDecisionSummary(finding: InventoryFindingView) {');
const evidenceStart = source.indexOf('  function renderMechanicEvidence(finding: InventoryFindingView) {', decisionStart);
if (decisionStart !== -1 && evidenceStart !== -1) {
  const block = source.slice(decisionStart, evidenceStart);
  const normalStart = block.lastIndexOf('    const cost = summarizeFindingApprovalCost(');
  if (normalStart !== -1) {
    const prefix = block.slice(0, normalStart);
    const compact = [
      '    const cost = summarizeFindingApprovalCost(',
      '      finding.mechanicalProposedLaborPrice,',
      '      finding.mechanicalSuggestedParts,',
      '    );',
      '    const legacyPartsMissing = hasLegacyUnpricedParts(finding);',
      '    const pricingReady = cost.pricingComplete && !legacyPartsMissing;',
      '    const performerReady = finding.mechanicalCanPerform !== null;',
      '',
      '    return (',
      '      <section data-owner-review-density="decision-v2" className="mt-2 rounded-lg bg-slate-50/70 px-3 py-2.5">',
      '        <div className="flex flex-wrap items-end gap-x-3 gap-y-1.5">',
      '          <div className={`text-2xl font-black tracking-tight ${pricingReady && performerReady ? "text-slate-950" : "text-amber-900"}`}>',
      '            {pricingReady ? approvalAuthorizationLabel(cost) : "Pricing incomplete"}',
      '          </div>',
      '          <div className="pb-0.5 text-sm font-semibold text-slate-600">',
      '            <span className="font-black text-slate-800">{performerSummary(finding)}</span>',
      '            {finding.mechanicalLaborHours !== null ? <><span className="text-slate-300"> · </span><span>{finding.mechanicalLaborHours} hr</span></> : null}',
      '            <span className="text-slate-300"> · </span><span>{money(cost.laborPrice)} labor</span>',
      '            <span className="text-slate-300"> + </span><span>{partsSpendLabel(finding)}</span>',
      '          </div>',
      '        </div>',
      '      </section>',
      '    );',
      '  }',
      '',
      '',
    ].join("\n");
    source = source.slice(0, decisionStart) + prefix + compact + source.slice(evidenceStart);
    changed = true;
  }
}

const evidenceAt = source.indexOf('  function renderMechanicEvidence(finding: InventoryFindingView) {');
const conversationAt = source.indexOf('  function renderConversation(finding: InventoryFindingView) {', evidenceAt);
const partnerAt = source.indexOf('  function renderPartnerChoice(finding: InventoryFindingView) {', evidenceAt);
const evidenceEnd = conversationAt !== -1 && conversationAt < partnerAt ? conversationAt : partnerAt;

if (evidenceAt !== -1 && evidenceEnd !== -1) {
  const compactEvidence = [
    '  function renderMechanicEvidence(finding: InventoryFindingView) {',
    '    const mechanicName = inspector?.displayName || "Assigned mechanic";',
    '    const recommendation = finding.mechanicalRecommendedAction?.trim() || null;',
    '',
    '    return (',
    '      <div className="mt-2 text-sm leading-5 text-slate-600">',
    '        <div className="flex flex-wrap items-center gap-x-1.5">',
    '          <span className="font-black text-slate-900">{validationLabel(finding.mechanicalValidationStatus)} by {mechanicName}</span>',
    '          {inspector?.secondaryLabel ? <span className="text-slate-400">· {inspector.secondaryLabel}</span> : null}',
    '        </div>',
    '        {finding.mechanicalValidationNotes ? (',
    '          <div className="mt-0.5"><span className="font-black text-slate-700">Note:</span> {finding.mechanicalValidationNotes}</div>',
    '        ) : recommendation ? (',
    '          <div className="mt-0.5"><span className="font-black text-slate-700">Recommended:</span> {recommendation}</div>',
    '        ) : null}',
    '      </div>',
    '    );',
    '  }',
    '',
    '',
  ].join("\n");
  source = source.slice(0, evidenceAt) + compactEvidence + source.slice(evidenceEnd);
  changed = true;
}

source = source.replaceAll(' to purchase` : null', ' buy` : null');
source = source.replaceAll('className="mt-3 border-t border-slate-100 pt-2.5"', 'className="mt-2 border-t border-slate-100 pt-2"');
source = source.replaceAll('className="mt-3 flex flex-col gap-2 border-t border-slate-100 pt-3 lg:flex-row lg:items-end lg:justify-between"', 'className="mt-2 flex flex-col gap-2 border-t border-slate-100 pt-2 lg:flex-row lg:items-end lg:justify-between"');

if (!changed) {
  console.log("Owner mechanical review density pass found nothing to change.");
  process.exit(0);
}

writeFileSync(path, source, "utf8");
console.log("Applied final Owner mechanical review decision-density layout.");
