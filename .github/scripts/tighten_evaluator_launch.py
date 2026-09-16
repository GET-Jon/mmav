from pathlib import Path

path = Path("components/evaluation/evaluation-workspace.tsx")
text = path.read_text()

# Keep comp discovery as an explicit user action rather than coupling it to Run Evaluation.
text = text.replace(
    "                    await pullMarketCheckComps(manualOverride);\n                    return;",
    "                    setMarketCheckStatus(\"Vehicle ready. Use Find Comps when you are ready to search the market.\");\n                    return;",
)
text = text.replace(
    "                  await pullMarketCheckComps(newlyDecodedVehicle);",
    "                  setMarketCheckStatus(\"Vehicle ready. Use Find Comps when you are ready to search the market.\");",
)

# Make the three decision numbers self-explanatory at a glance.
text = text.replace(
    '                    Max Smart Bid\n',
    '                    Recommended Max Buy\n',
)
text = text.replace(
    '                    Sale Value Used\n',
    '                    Expected Sale Value\n',
)
text = text.replace(
    '                    Projected Profit\n',
    '                    Expected Gross\n',
)
text = text.replace(
    '                Market &amp; Fit Summary\n',
    '                Why Lot Logic Thinks This\n',
)
text = text.replace(
    '                    Comp Confidence\n',
    '                    Market Evidence\n',
)
text = text.replace(
    '                    Included Comps\n',
    '                    Strong Comps Used\n',
)
text = text.replace(
    '                    Median Adjusted Value\n',
    '                    Comp-Supported Value\n',
)
text = text.replace(
    '                    Fast-Sale Value\n',
    '                    Conservative Sale Value\n',
)
text = text.replace(
    '                  label="Profitability Score"\n',
    '                  label="Deal Economics"\n',
)
text = text.replace(
    '                  label="Dealer-Fit Score"\n',
    '                  label="Dealer Fit"\n',
)
text = text.replace(
    '                View Scoring Details →\n',
    '                See how these scores are built →\n',
)

# Replace the old two-card middle row with the primary AI-assisted vehicle-information workflow.
start_marker = '          <section className="mt-4 grid items-stretch gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(350px,.85fr)]">'
end_marker = '          <section className="mt-4">\n            <SectionCard\n              title="Comparable Vehicles"'
start = text.find(start_marker)
end = text.find(end_marker)
if start == -1 or end == -1 or end <= start:
    raise RuntimeError("Could not locate evaluator middle-row markers")

new_middle = r'''          <section className="mt-4">
            <SectionCard
              title="Tell Lot Logic What You Know About This Vehicle"
              action={
                <div className="flex items-center gap-2">
                  {conditionAnalysis ? (
                    <span className={`rounded-full px-3 py-1 text-[10px] font-black ${conditionAnalysisApplied ? "bg-emerald-50 text-emerald-700" : "bg-violet-50 text-violet-700"}`}>
                      {conditionAnalysisApplied ? "Applied to valuation" : "Review before applying"}
                    </span>
                  ) : null}
                  <button
                    type="button"
                    onClick={openConditionAnalysis}
                    disabled={!hasEvaluationData}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-extrabold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
                  >
                    Detailed editor
                  </button>
                </div>
              }
            >
              <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(340px,.65fr)]">
                <div>
                  <p className="max-w-3xl text-sm font-semibold leading-6 text-slate-600">
                    Paste auction announcements, condition-report notes, seller comments, inspection observations, known damage, warning lights, service history, or anything else that could affect value or reconditioning. Lot Logic will turn the messy notes into specific issues you can confirm.
                  </p>

                  <textarea
                    value={conditionSourceText}
                    onChange={(event) => {
                      setConditionSourceText(event.target.value);
                      setConditionAnalysisApplied(false);
                    }}
                    disabled={!hasEvaluationData}
                    placeholder={hasEvaluationData ? "Example: rear tires are around 3/32, windshield has a chip, front bumper is scuffed, CEL is on, seller says brakes were replaced recently..." : "Enter a vehicle first, then add everything you know about its condition."}
                    className="mt-4 min-h-[150px] w-full resize-y rounded-2xl border border-slate-200 bg-slate-50/60 p-4 text-sm font-medium leading-6 text-slate-700 outline-none transition focus:border-violet-300 focus:bg-white disabled:cursor-not-allowed disabled:bg-slate-100"
                  />

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    <div className="text-xs font-semibold text-slate-400">
                      Better vehicle context improves recon, risk, and the recommended buy economics.
                    </div>
                    <button
                      type="button"
                      onClick={() => void analyzeConditionInformation()}
                      disabled={conditionAnalysisLoading || !hasEvaluationData || !conditionSourceText.trim()}
                      className="rounded-xl bg-violet-700 px-5 py-2.5 text-sm font-black text-white hover:bg-violet-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                    >
                      {conditionAnalysisLoading ? "Analyzing..." : conditionAnalysis ? "Analyze Again" : "Analyze Vehicle Notes"}
                    </button>
                  </div>

                  {conditionAnalysisError ? (
                    <div className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
                      {conditionAnalysisError}
                    </div>
                  ) : null}
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                  {!conditionAnalysis ? (
                    <div className="flex h-full min-h-[210px] flex-col justify-center text-center">
                      <div className="text-sm font-black text-slate-800">AI recon starts with what you know.</div>
                      <p className="mx-auto mt-2 max-w-sm text-xs font-semibold leading-5 text-slate-500">
                        Lot Logic will propose likely recon items and costs. Nothing affects the valuation until you review and apply it.
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-[10px] font-black uppercase tracking-[0.1em] text-violet-600">AI-detected recon</div>
                          <div className="mt-1 text-2xl font-black text-slate-950">{money(getEffectiveConditionPlanningEstimate())}</div>
                          <div className="mt-1 text-[10px] font-bold text-slate-500">
                            {conditionAnalysis.issues.filter((issue) => issue.includeInValuation).length} selected · {conditionAnalysis.overallRisk} risk
                          </div>
                        </div>
                        <div className="text-right text-[10px] font-bold text-slate-500">
                          <div>Estimated range</div>
                          <div className="mt-1 text-xs font-black text-slate-800">{money(conditionAnalysis.estimatedCostLow)}–{money(conditionAnalysis.estimatedCostHigh)}</div>
                        </div>
                      </div>

                      <div className="mt-4 max-h-[230px] space-y-2 overflow-y-auto pr-1">
                        {conditionAnalysis.issues.map((issue) => (
                          <label key={issue.id} className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 ${issue.includeInValuation ? "border-violet-200 bg-white" : "border-slate-200 bg-slate-100/60 opacity-70"}`}>
                            <input
                              type="checkbox"
                              checked={issue.includeInValuation}
                              onChange={() => toggleConditionAnalysisIssue(issue.id)}
                              className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-violet-700"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block text-xs font-black leading-4 text-slate-800">{issue.description}</span>
                              <span className="mt-1 flex items-center justify-between gap-2 text-[10px] font-bold text-slate-500">
                                <span className="capitalize">{issue.category.replaceAll("_", " ")}</span>
                                <span>{money(issue.planningEstimate)}</span>
                              </span>
                            </span>
                          </label>
                        ))}
                      </div>

                      <button
                        type="button"
                        onClick={applyConditionAnalysis}
                        className={`mt-4 w-full rounded-xl px-4 py-3 text-sm font-black text-white ${conditionAnalysisApplied ? "bg-emerald-700 hover:bg-emerald-800" : "bg-slate-950 hover:bg-slate-800"}`}
                      >
                        {conditionAnalysisApplied
                          ? `Applied · ${money(getEffectiveConditionPlanningEstimate())} recon`
                          : `Apply ${conditionAnalysis.issues.filter((issue) => issue.includeInValuation).length} items · ${money(getEffectiveConditionPlanningEstimate())}`}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </SectionCard>
          </section>

'''
text = text[:start] + new_middle + text[end:]

# Add explicit Find Comps action and make expansion visible when the strong comp set is thin, not only when zero results return.
old_action_start = '''                <div className="flex items-center gap-2">\n                  <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">\n                    {compSummary.includedCount} Usable Comps\n                  </span>'''
if old_action_start not in text:
    raise RuntimeError("Could not locate comparable-vehicles action area")

text = text.replace(
    old_action_start,
    '''                <div className="flex flex-wrap items-center justify-end gap-2">\n                  <button\n                    type="button"\n                    onClick={() => void pullMarketCheckComps()}\n                    disabled={!hasEvaluationData || marketCheckLoading}\n                    className="rounded-lg bg-blue-700 px-3.5 py-2 text-xs font-black text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-300"\n                  >\n                    {marketCheckLoading ? "Finding Comps..." : comps.length ? "Refresh Comps" : "Find Comps"}\n                  </button>\n\n                  <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">\n                    {compSummary.includedCount} Strong Comps\n                  </span>''',
)

# Expand search should be offered whenever fewer than six strong comps exist.
text = text.replace(
    '''                  {marketCheckSearchMeta &&\n                  marketCheckSearchMeta.loadedCount === 0 &&\n                  marketCheckSearchMeta.searchStage !== "metro" &&\n                  !marketCheckLoading ? (''',
    '''                  {marketCheckSearchMeta &&\n                  compSummary.includedCount < 6 &&\n                  marketCheckSearchMeta.searchStage !== "metro" &&\n                  !marketCheckLoading ? (''',
)

text = text.replace(
    '>\n                        Major Metropolitan Areas\n                      </button>',
    '>\n                        Search Major Markets\n                      </button>',
)
text = text.replace(
    '>\n                        Expand Search\n                      </button>',
    '>\n                        Add Nearby Markets\n                      </button>',
)

# Clarify the comp section language and the final broad-market step.
text = text.replace('                    "Usable Comps",', '                    "Strong Comps",')
text = text.replace(
    '                Values are adjusted using the active mileage, market, and\n                company-assumption rules. Toggle individual comps to include or\n                exclude them from the valuation.',
    '                Lot Logic ranks true comparables by vehicle equivalence, mileage, geography, and market relevance. Keep the strongest evidence selected; uncheck a listing that does not belong. If the local set is thin, add nearby markets before using major national reference markets.',
)

# Make the major-market button itself explain what it is doing.
text = text.replace(
    '        "All configured regions have already been searched. Major metropolitan search is available next.",',
    '        "Nearby configured markets have been searched. Major reference markets are available as the final expansion step.",',
)
text = text.replace(
    '        "Major metropolitan areas have already been searched for this vehicle.",',
    '        "Major reference markets have already been searched for this vehicle.",',
)

path.write_text(text)
print("Evaluator launch tightening applied")
