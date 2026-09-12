import { readFileSync, writeFileSync } from "node:fs";

const path = "components/mindful-inventory/mechanical-owner-finding-review-v2.tsx";
let source = readFileSync(path, "utf8");

if (source.includes('data-owner-review-density="decision-v2"')) {
  console.log("Owner mechanical review already uses the final decision-density layout.");
  process.exit(0);
}

let changed = false;

function replaceOnce(oldText, newText) {
  if (!source.includes(oldText)) return false;
  source = source.replace(oldText, newText);
  changed = true;
  return true;
}

// Remove source/provenance metadata from the default unresolved card. It remains available
// in the underlying finding/history; the Owner decision card should emphasize current truth.
replaceOnce(
  '            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 text-[10px] font-bold text-slate-400">\n              <span>{sourceLabel(finding.source)}</span>\n              <span>·</span>\n              <span>{validationLabel(finding.mechanicalValidationStatus)}</span>\n            </div>\n',
  '',
);

// Replace the normal priced-repair summary with one compact decision line. Special
// needs-diagnosis and quote-pending routing states return earlier and are left untouched.
const decisionFunctionStart = source.indexOf('  function renderDecisionSummary(finding: InventoryFindingView) {');
const mechanicEvidenceStart = source.indexOf('  function renderMechanicEvidence(finding: InventoryFindingView) {', decisionFunctionStart);
if (decisionFunctionStart !== -1 && mechanicEvidenceStart !== -1) {
  const decisionFunction = source.slice(decisionFunctionStart, mechanicEvidenceStart);
  const normalCostStart = decisionFunction.lastIndexOf('    const cost = summarizeFindingApprovalCost(');
  if (normalCostStart !== -1) {
    const prefix = decisionFunction.slice(0, normalCostStart);
    const compactNormal = `    const cost = summarizeFindingApprovalCost(
      finding.mechanicalProposedLaborPrice,
      finding.mechanicalSuggestedParts,
    );
    const legacyPartsMissing = hasLegacyUnpricedParts(finding);
    const pricingReady = cost.pricingComplete && !legacyPartsMissing;
    const performerReady = finding.mechanicalCanPerform !== null;

    return (
      <section data-owner-review-density="decision-v2" className="mt-2 rounded-lg bg-slate-50/70 px-3 py-2.5">
        <div className="flex flex-wrap items-end gap-x-3 gap-y-1.5">
          <div className={\`text-2xl font-black tracking-tight ${
            pricingReady && performerReady ? "text-slate-950" : "text-amber-900"
          }\`}>
            {pricingReady ? approvalAuthorizationLabel(cost) : "Pricing incomplete"}
          </div>
          <div className="pb-0.5 text-sm font-semibold text-slate-600">
            <span className="font-black text-slate-800">{performerSummary(finding)}</span>
            {finding.mechanicalLaborHours !== null ? <><span className="text-slate-300"> · </span><span>{finding.mechanicalLaborHours} hr</span></> : null}
            <span className="text-slate-300"> · </span><span>{money(cost.laborPrice)} labor</span>
            <span className="text-slate-300"> + </span><span>{partsSpendLabel(finding)}</span>
          </div>
        </div>
      </section>
    );
  }

`;
    source = source.slice(0, decisionFunctionStart) + prefix + compactNormal + source.slice(mechanicEvidenceStart);
    changed = true;
  }
}

// Compress mechanic evidence to current assessment + note. Labor and performer already
// appear in the decision summary, so do not repeat them here.
const evidenceStart = source.indexOf('  function renderMechanicEvidence(finding: InventoryFindingView) {');
const partnerChoiceStart = source.indexOf('  function renderPartnerChoice(finding: InventoryFindingView) {', evidenceStart);
if (evidenceStart !== -1 && partnerChoiceStart !== -1) {
  const compactEvidence = `  function renderMechanicEvidence(finding: InventoryFindingView) {
    const mechanicName = inspector?.displayName || "Assigned mechanic";
    const recommendation = finding.mechanicalRecommendedAction?.trim() || null;

    return (
      <div className="mt-2 text-sm leading-5 text-slate-600">
        <div className="flex flex-wrap items-center gap-x-1.5">
          <span className="font-black text-slate-900">{validationLabel(finding.mechanicalValidationStatus)} by {mechanicName}</span>
          {inspector?.secondaryLabel ? <span className="text-slate-400">· {inspector.secondaryLabel}</span> : null}
        </div>
        {finding.mechanicalValidationNotes ? (
          <div className="mt-0.5"><span className="font-black text-slate-700">Note:</span> {finding.mechanicalValidationNotes}</div>
        ) : recommendation ? (
          <div className="mt-0.5"><span className="font-black text-slate-700">Recommended:</span> {recommendation}</div>
        ) : null}
      </div>
    );
  }

`;
  source = source.slice(0, evidenceStart) + compactEvidence + source.slice(partnerChoiceStart);
  changed = true;
}

// Shorten the default parts summary wording and tighten its spacing.
source = source.replaceAll(' to purchase` : null', ' buy` : null');
source = source.replaceAll('className="mt-3 border-t border-slate-100 pt-2.5"', 'className="mt-2 border-t border-slate-100 pt-2"');
source = source.replaceAll('className="mt-3 flex flex-col gap-2 border-t border-slate-100 pt-3 lg:flex-row lg:items-end lg:justify-between"', 'className="mt-2 flex flex-col gap-2 border-t border-slate-100 pt-2 lg:flex-row lg:items-end lg:justify-between"');

if (!changed) {
  console.log("Owner mechanical review density pass found nothing to change.");
  process.exit(0);
}

writeFileSync(path, source, "utf8");
console.log("Applied final Owner mechanical review decision-density layout.");
