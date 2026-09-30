import { readFileSync, writeFileSync } from "node:fs";

function applyOwnerReviewDensity() {
  const path = "components/mindful-inventory/mechanical-owner-finding-review-v2.tsx";
  let source = readFileSync(path, "utf8");

  if (source.includes('data-owner-review-density="decision-v2"')) {
    console.log("Owner mechanical review already uses the final decision-density layout.");
    return false;
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
    return false;
  }

  writeFileSync(path, source, "utf8");
  console.log("Applied final Owner mechanical review decision-density layout.");
  return true;
}

function applyPartnerTimingModal() {
  const path = "components/partner/partner-work-list-v4.tsx";
  let source = readFileSync(path, "utf8");

  if (source.includes('data-partner-timing-modal="plain-language-v1"')) {
    console.log("Partner timing confirmation already uses the Lot Logic modal.");
    return false;
  }

  const stateAnchor = '  const [availabilityText, setAvailabilityText] = useState<Record<string, string>>({});';
  if (!source.includes(stateAnchor)) {
    console.log("Partner timing modal skipped: state anchor was not found.");
    return false;
  }
  source = source.replace(
    stateAnchor,
    stateAnchor + '\n  const [timingCheck, setTimingCheck] = useState<{ workId: string; laborMinutes: number | null; elapsedMinutes: number | null; laborComparison: string | null; elapsedComparison: string | null } | null>(null);',
  );

  const warningStart = source.indexOf('      if (response.status === 409 && data.requiresTimingConfirmation && !confirmed) {');
  const warningEnd = warningStart === -1 ? -1 : source.indexOf('      if (!response.ok)', warningStart);
  if (warningStart === -1 || warningEnd === -1) {
    console.log("Partner timing modal skipped: timing confirmation block was not found.");
    return false;
  }

  const plainLanguageWarning = [
    '      if (response.status === 409 && data.requiresTimingConfirmation && !confirmed) {',
    '        const proposedLabor = typeof data.proposedLaborMinutes === "number" ? data.proposedLaborMinutes : null;',
    '        const proposedElapsed = typeof data.proposedElapsedMinutes === "number" ? data.proposedElapsedMinutes : null;',
    '        const aiLabor = typeof data.aiLaborMinutes === "number" ? data.aiLaborMinutes : null;',
    '        const aiElapsed = typeof data.aiElapsedMinutes === "number" ? data.aiElapsedMinutes : null;',
    '        const laborChanged = typeof data.laborDeviationPercent === "number" && data.laborDeviationPercent > 25;',
    '        const elapsedChanged = typeof data.elapsedDeviationPercent === "number" && data.elapsedDeviationPercent > 25;',
    '        const compare = (proposed: number | null, baseline: number | null, changed: boolean) => {',
    '          if (!changed) return null;',
    '          if (proposed == null || baseline == null) return "different";',
    '          return proposed > baseline ? "longer" : "shorter";',
    '        };',
    '        setTimingCheck({',
    '          workId: work.id,',
    '          laborMinutes: proposedLabor,',
    '          elapsedMinutes: proposedElapsed,',
    '          laborComparison: compare(proposedLabor, aiLabor, laborChanged),',
    '          elapsedComparison: compare(proposedElapsed, aiElapsed, elapsedChanged),',
    '        });',
    '        return;',
    '      }',
    '',
  ].join("\n");
  source = source.slice(0, warningStart) + plainLanguageWarning + source.slice(warningEnd);

  const sectionStart = source.indexOf('    return <section key={work.id}');
  const sectionOpenEnd = sectionStart === -1 ? -1 : source.indexOf('>', sectionStart);
  if (sectionStart === -1 || sectionOpenEnd === -1) {
    console.log("Partner timing modal skipped: work card opening section was not found.");
    return false;
  }

  const sectionOpen = source.slice(sectionStart, sectionOpenEnd + 1);
  const modalLines = [
    sectionOpen,
    '      {timingCheck?.workId === work.id ? (',
    '        <div data-partner-timing-modal="plain-language-v1" className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 p-4" role="dialog" aria-modal="true" aria-labelledby="timing-check-title">',
    '          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">',
    '            <div className="text-[10px] font-black uppercase tracking-[0.14em] text-amber-700">Quick check</div>',
    '            <h3 id="timing-check-title" className="mt-1 text-xl font-black tracking-[-0.02em] text-slate-950">Double-check your timing</h3>',
    '            <p className="mt-2 text-sm leading-6 text-slate-600">Your timing is noticeably different from Lot Logic&apos;s planning estimate. That can be completely fine — we just want to make sure these are the numbers you intended.</p>',
    '            <div className="mt-4 space-y-2">',
    '              {timingCheck.laborComparison ? (',
    '                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">',
    '                  <div className="flex items-center justify-between gap-4"><span className="text-sm font-black text-slate-800">Hands-on work</span><span className="text-sm font-black text-slate-950">{hours(timingCheck.laborMinutes)}</span></div>',
    '                  <div className="mt-1 text-xs font-semibold text-slate-500">{timingCheck.laborComparison === "different" ? "This is different from the current planning estimate." : "This is " + timingCheck.laborComparison + " than the current planning estimate."}</div>',
    '                </div>',
    '              ) : null}',
    '              {timingCheck.elapsedComparison ? (',
    '                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">',
    '                  <div className="flex items-center justify-between gap-4"><span className="text-sm font-black text-slate-800">Turnaround</span><span className="text-sm font-black text-slate-950">{hours(timingCheck.elapsedMinutes)}</span></div>',
    '                  <div className="mt-1 text-xs font-semibold text-slate-500">{timingCheck.elapsedComparison === "different" ? "This is different from the current planning estimate." : "This is " + timingCheck.elapsedComparison + " than the current planning estimate."}</div>',
    '                </div>',
    '              ) : null}',
    '            </div>',
    '            <div className="mt-4 rounded-xl bg-blue-50 px-4 py-3 text-sm font-semibold leading-5 text-blue-900">If these numbers are right, submit them. The project owner will see your estimate and review the difference.</div>',
    '            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">',
    '              <button type="button" onClick={() => setTimingCheck(null)} className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-black text-slate-700 hover:bg-slate-50">Go back and edit</button>',
    '              <button type="button" onClick={() => { setTimingCheck(null); void submitEstimate(work, true); }} disabled={workingId === work.id} className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white disabled:bg-slate-300">{workingId === work.id ? "Submitting…" : "Submit my estimate"}</button>',
    '            </div>',
    '          </div>',
    '        </div>',
    '      ) : null}',
  ].join("\n");

  source = source.slice(0, sectionStart) + modalLines + source.slice(sectionOpenEnd + 1);
  writeFileSync(path, source, "utf8");
  console.log("Replaced Partner timing browser confirmation with plain-language Lot Logic modal.");
  return true;
}

applyOwnerReviewDensity();
applyPartnerTimingModal();
