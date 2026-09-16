from pathlib import Path

path = Path('components/evaluation/evaluation-workspace.tsx')
text = path.read_text()

# Add simple display metrics immediately after dealer-fit context.
old = '''  const dealerFitContext = hasEvaluationData
    ? `${dealerFitResult.label} · ${dealerFitResult.score}/100`
    : "Not calculated";

  const suggestedBidDisplay = !hasEvaluationData'''
new = '''  const dealerFitContext = hasEvaluationData
    ? `${dealerFitResult.label} · ${dealerFitResult.score}/100`
    : "Not calculated";

  const displayedReconReserve = conditionAssessmentsTouched
    ? conditionTotals.reserveAdd
    : 0;
  const displayedCurrentCost = Math.max(0, valuationInput.currentBid) + displayedReconReserve;
  const dealerFitPillTone =
    dealerFitResult.score >= 72
      ? "bg-emerald-100 text-emerald-700"
      : dealerFitResult.score >= 55
        ? "bg-amber-100 text-amber-700"
        : "bg-red-100 text-red-700";

  const suggestedBidDisplay = !hasEvaluationData'''
if old not in text:
    raise RuntimeError('Could not find dealer fit context anchor')
text = text.replace(old, new)

# Replace the entire verdict header/numbers block with the clearer decision story.
old = '''              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-black text-slate-950">
                    Lot Logic Verdict
                  </h2>

                  <span className="grid h-4 w-4 place-items-center rounded-full bg-white/70 text-[10px] font-black text-slate-500">
                    i
                  </span>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2">
                  {hasEvaluationData ? (
                    <span className={`inline-flex shrink-0 items-center rounded-full px-3 py-1.5 text-[10px] font-black ${dealerFitResult.score >= 72 ? "bg-blue-50 text-blue-700" : dealerFitResult.score >= 55 ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"}`}>
                      Dealer Fit: {dealerFitResult.label}
                    </span>
                  ) : null}
                  <span
                    className={`inline-flex shrink-0 items-center rounded-full px-3 py-1.5 text-xs font-black ${decisionBadgeTone}`}
                  >
                    {lotLogicIcon}{lotLogicLabel}
                  </span>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-3 border-t border-current/10 pt-4 text-center">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">
                    Recommended Max Buy
                  </div>

                  <div
                    className={`mt-2 font-black tracking-[-0.04em] ${decisionTextTone} ${
                      valuationInput.currentBid <= 0 && hasEvaluationData
                        ? "text-sm"
                        : "text-[25px]"
                    }`}
                  >
                    {suggestedBidDisplay}
                  </div>
                </div>

                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">
                    Expected Sale Value
                  </div>

                  <div className="mt-2 text-[25px] font-black tracking-[-0.04em] text-slate-950">
                    {hasEvaluationData && finalTargetUsed > 0
                      ? money(finalTargetUsed)
                      : "—"}
                  </div>
                </div>

                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">
                    Expected Gross
                  </div>

                  <div
                    className={`mt-2 text-[25px] font-black tracking-[-0.04em] ${
                      valuation.expectedGrossProfit >= 0
                        ? "text-slate-950"
                        : "text-red-700"
                    }`}
                  >
                    {hasEvaluationData
                      ? money(valuation.expectedGrossProfit)
                      : "—"}
                  </div>
                </div>
              </div>'''
new = '''              <div>
                <div className="flex items-center gap-2 whitespace-nowrap">
                  <h2 className="text-base font-black text-slate-950">Lot Logic Verdict</h2>
                  <span className="grid h-4 w-4 place-items-center rounded-full bg-white/70 text-[10px] font-black text-slate-500">i</span>
                </div>

                <div className="mt-3 flex flex-col items-start gap-2">
                  <span className={`inline-flex shrink-0 items-center rounded-full px-3 py-1.5 text-xs font-black ${decisionBadgeTone}`}>
                    {lotLogicIcon}{lotLogicLabel}
                  </span>
                  {hasEvaluationData ? (
                    <span className={`inline-flex shrink-0 items-center rounded-full px-3 py-1.5 text-[10px] font-black ${dealerFitPillTone}`}>
                      Dealer Fit: {dealerFitResult.label} · {dealerFitResult.score}/100
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-3 border-t border-current/10 pt-4 text-center">
                <div className="min-w-0">
                  <div className="text-[9px] font-black uppercase tracking-[0.08em] text-slate-500 sm:text-[10px]">
                    Estimated All-In Cost
                  </div>
                  <div className="mt-2 text-[25px] font-black tracking-[-0.04em] text-slate-950">
                    {hasEvaluationData && valuationInput.currentBid > 0
                      ? money(displayedCurrentCost)
                      : "—"}
                  </div>
                  <div className="mt-1 text-[9px] font-bold leading-4 text-slate-500 sm:text-[10px]">
                    {hasEvaluationData && valuationInput.currentBid > 0
                      ? `${money(valuationInput.currentBid)} bid + ≈ ${money(displayedReconReserve)} recon`
                      : "Bid + recon reserve"}
                  </div>
                </div>

                <div className="min-w-0">
                  <div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">
                    Sale Estimate
                  </div>
                  <div className="mt-2 text-[25px] font-black tracking-[-0.04em] text-slate-950">
                    {hasEvaluationData && finalTargetUsed > 0 ? money(finalTargetUsed) : "—"}
                  </div>
                  <div className="mt-1 text-[9px] font-bold leading-4 text-slate-500 sm:text-[10px]">
                    Comp-supported sale value
                  </div>
                </div>

                <div className="min-w-0">
                  <div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">
                    Estimated Profit
                  </div>
                  <div className={`mt-2 text-[25px] font-black tracking-[-0.04em] ${valuation.expectedGrossProfit >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                    {hasEvaluationData ? money(valuation.expectedGrossProfit) : "—"}
                  </div>
                  <div className="mt-1 text-[9px] font-bold leading-4 text-slate-500 sm:text-[10px]">
                    After modeled fees, costs & reserves
                  </div>
                </div>
              </div>'''
if old not in text:
    raise RuntimeError('Could not find verdict header and metric block')
text = text.replace(old, new)

# Rename the primary save action to describe the workflow outcome.
old = '''                  {saveLoading
                    ? "Saving..."
                    : savedEvaluationId
                      ? "Update Evaluation"
                      : "▣ Save Evaluation"}'''
new = '''                  {saveLoading
                    ? "Saving..."
                    : savedEvaluationId
                      ? "Update Pipeline"
                      : "Save to Pipeline"}'''
if old not in text:
    raise RuntimeError('Could not find save button copy')
text = text.replace(old, new)

# Clarify recon as a planning reserve rather than a quote.
old = '''                          <div className="text-[10px] font-black uppercase tracking-[0.1em] text-violet-600">AI-detected recon</div>
                          <div className="mt-1 text-2xl font-black text-slate-950">{money(getEffectiveConditionPlanningEstimate())}</div>
                          <div className="mt-1 text-[10px] font-bold text-slate-500">
                            {conditionAnalysis.issues.filter((issue) => issue.includeInValuation).length} selected · {conditionAnalysis.overallRisk} risk
                          </div>'''
new = '''                          <div className="text-[10px] font-black uppercase tracking-[0.1em] text-violet-600">AI Recon Planning Reserve</div>
                          <div className="mt-1 text-2xl font-black text-slate-950">≈ {money(getEffectiveConditionPlanningEstimate())}</div>
                          <div className="mt-1 text-[10px] font-black text-slate-600">Planning estimate — not a repair quote</div>
                          <div className="mt-1 text-[10px] font-bold text-slate-500">
                            {conditionAnalysis.issues.filter((issue) => issue.includeInValuation).length} selected · {conditionAnalysis.overallRisk} risk
                          </div>'''
if old not in text:
    raise RuntimeError('Could not find recon heading block')
text = text.replace(old, new)

old = '''                          <div>Estimated range</div>
                          <div className="mt-1 text-xs font-black text-slate-800">{money(conditionAnalysis.estimatedCostLow)}–{money(conditionAnalysis.estimatedCostHigh)}</div>'''
new = '''                          <div>Typical planning range</div>
                          <div className="mt-1 text-xs font-black text-slate-800">{money(conditionAnalysis.estimatedCostLow)}–{money(conditionAnalysis.estimatedCostHigh)}</div>'''
if old not in text:
    raise RuntimeError('Could not find estimated range label')
text = text.replace(old, new)

old = '''                                <span>{money(issue.planningEstimate)}</span>'''
new = '''                                <span>≈ {money(issue.planningEstimate)} reserve</span>'''
# Intentionally replace only the compact recon-list occurrence in this exact file once.
if old not in text:
    raise RuntimeError('Could not find issue planning estimate label')
text = text.replace(old, new, 1)

old = '''                      <button
                        type="button"
                        onClick={applyConditionAnalysis}
                        className={`mt-4 w-full rounded-xl px-4 py-3 text-sm font-black text-white ${conditionAnalysisApplied ? "bg-emerald-700 hover:bg-emerald-800" : "bg-slate-950 hover:bg-slate-800"}`}
                      >
                        {conditionAnalysisApplied
                          ? `Applied · ${money(getEffectiveConditionPlanningEstimate())} recon`
                          : `Apply ${conditionAnalysis.issues.filter((issue) => issue.includeInValuation).length} items · ${money(getEffectiveConditionPlanningEstimate())}`}
                      </button>'''
new = '''                      <div className="mt-4 rounded-xl border border-violet-100 bg-violet-50/60 px-3 py-2.5">
                        <div className="text-[9px] font-black uppercase tracking-[0.08em] text-violet-700">Why this matters</div>
                        <p className="mt-1 text-[10px] font-semibold leading-4 text-slate-600">
                          These directional reserves test whether the deal still works after likely repairs. Actual shop, parts, and diagnostic costs will vary.
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={applyConditionAnalysis}
                        className={`mt-3 w-full rounded-xl px-4 py-3 text-sm font-black text-white ${conditionAnalysisApplied ? "bg-emerald-700 hover:bg-emerald-800" : "bg-slate-950 hover:bg-slate-800"}`}
                      >
                        {conditionAnalysisApplied
                          ? `Applied · ≈ ${money(getEffectiveConditionPlanningEstimate())} reserve`
                          : `Apply ${conditionAnalysis.issues.filter((issue) => issue.includeInValuation).length} items · ≈ ${money(getEffectiveConditionPlanningEstimate())} reserve`}
                      </button>'''
if old not in text:
    raise RuntimeError('Could not find recon apply button')
text = text.replace(old, new)

path.write_text(text)
print('Refined verdict card and recon planning-reserve clarity')
