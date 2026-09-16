from pathlib import Path

# --- Dealer-fit rules: remove broad newer-luxury penalty and generic make-level cautions. ---
rules_path = Path("lib/dealer-fit/rules.ts")
rules = rules_path.read_text()

rules = rules.replace(
'''  {
    id: "modern-luxury-complexity",
    type: "risk_penalty",
    points: -7,
    reason: "Modern luxury complexity can compress margin if electronics, suspension, or drivetrain issues appear.",
    caution: "Verify scan results, options, suspension behavior, infotainment, and service history before bidding.",
    match: {
      makes: ["bmw", "mercedes-benz", "mercedes", "audi", "porsche", "land rover", "range rover", "alfa romeo"],
      minYear: 2016,
    },
  },
''',
'',
)

rules = rules.replace(
'    caution: "Treat deferred maintenance, air suspension, cooling, electrical, and drivetrain unknowns as thesis-breakers.",\n',
'',
)

rules_path.write_text(rules)

# --- Dealer-fit engine: dealer fit stays informative, but generic buying hygiene is not emitted as deal-specific caution. ---
fit_path = Path("lib/dealer-fit/calculate-dealer-fit.ts")
fit = fit_path.read_text()

old_due_diligence = '''  } else {
    const dueDiligenceChecks = [
      "Confirm the VIN, exact trim, drivetrain, mileage, and material options match the vehicles supporting the resale target.",
      "Verify title brand, accident or structural disclosures, mileage history, and all auction announcements before bidding.",
      "Review the condition report and photos for warning lights, leaks, tire or brake wear, body, glass, wheel, and interior damage not already covered by the recon reserve.",
    ];

    for (const check of dueDiligenceChecks) {
      if (cautions.length >= 5) break;
      cautions.push(check);
    }
  }
'''
new_due_diligence = '''  }
'''
if old_due_diligence not in fit:
    raise RuntimeError("Expected dealer-fit due-diligence block was not found")
fit = fit.replace(old_due_diligence, new_due_diligence)

fit = fit.replace(
'''    cautions.unshift(
      "Treat this as a profit-led inventory buy rather than a design-led Mindful showcase vehicle."
    );
''',
'''    reasons.unshift(
      "This is a profit-led acquisition; dealer-fit is secondary to the supported economics."
    );
''',
)

fit_path.write_text(fit)

# --- Evaluator UI and verdict hierarchy. ---
path = Path("components/evaluation/evaluation-workspace.tsx")
text = path.read_text()

# Make the top row labels unmistakable, including any strings missed by the previous pass.
text = text.replace("Max Smart Bid", "Recommended Max Buy")
text = text.replace("Sale Value Used", "Expected Sale Value")
text = text.replace("Projected Profit", "Expected Gross")
text = text.replace("Market &amp; Fit Summary", "Why Lot Logic Thinks This")
text = text.replace("Comp Confidence", "Market Evidence")
text = text.replace("Included Comps", "Strong Comps Used")
text = text.replace("Median Adjusted Value", "Comp-Supported Value")
text = text.replace("Fast-Sale Value", "Conservative Sale Value")
text = text.replace("Profitability Score", "Deal Economics")
text = text.replace("Dealer-Fit Score", "Dealer Fit")
text = text.replace("View Scoring Details →", "See how these scores are built →")

# Material condition risk is vehicle-specific and consequential. Cosmetic cost alone should not turn the whole deal yellow.
old_condition_block = '''  const hasSevereCondition = Object.values(conditionAssessments).some(
    (assessment) => assessment.severity === "severe",
  );

  const hasHighConditionRisk =
    String(conditionAnalysis?.overallRisk || "").toLowerCase() === "high";

  const hasLowCompConfidence =
    comps.length > 0 &&
    String(compSummary.confidence || "").toLowerCase() === "low";

  const hasLimitedDealerFit = dealerFitResult.score < 55;

  const requiresReview =
    hasEvaluationData &&
    valuation.decision !== "Pass" &&
    valuation.decision !== "Watch / Stretch Only" &&
    (hasLowCompConfidence ||
      hasLimitedDealerFit ||
      hasSevereCondition ||
      hasHighConditionRisk);

  const reviewReasons = [
    hasLowCompConfidence ? "low comp confidence" : null,
    hasLimitedDealerFit ? "limited dealer fit" : null,
    hasSevereCondition || hasHighConditionRisk
      ? "significant condition concerns"
      : null,
  ].filter((reason): reason is string => Boolean(reason));
'''
new_condition_block = '''  const materialConditionIssues = (conditionAnalysis?.issues || []).filter(
    (issue) =>
      issue.includeInValuation &&
      issue.severity === "severe" &&
      ["mechanical", "history", "structural", "title"].includes(issue.category),
  );

  const hasMaterialConditionRisk = materialConditionIssues.length > 0;

  const hasLowCompConfidence =
    comps.length > 0 &&
    String(compSummary.confidence || "").toLowerCase() === "low";

  const hasLimitedDealerFit = dealerFitResult.score < 55;

  const requiresReview =
    hasEvaluationData &&
    valuation.decision !== "Pass" &&
    valuation.decision !== "Watch / Stretch Only" &&
    (hasLowCompConfidence || hasMaterialConditionRisk);

  const reviewReasons = [
    hasLowCompConfidence ? "market evidence is still thin" : null,
    hasMaterialConditionRisk ? "a material vehicle-specific risk needs review" : null,
  ].filter((reason): reason is string => Boolean(reason));
'''
if old_condition_block not in text:
    raise RuntimeError("Expected evaluator review logic was not found")
text = text.replace(old_condition_block, new_condition_block)

# Dealer fit remains visible but explicitly secondary.
text = text.replace(
'''              <h2 className="text-base font-black text-slate-950">
                Why Lot Logic Thinks This
              </h2>
''',
'''              <div>
                <h2 className="text-base font-black text-slate-950">
                  Why Lot Logic Thinks This
                </h2>
                <p className="mt-1 text-[10px] font-semibold leading-4 text-slate-400">
                  Deal economics and market evidence drive the verdict. Dealer fit is supporting context.
                </p>
              </div>
''',
)

# Build concise, evidence-based deal bullets for the transformed AI section.
anchor = '''  const suggestedBidDisplay = !hasEvaluationData
'''
if anchor not in text:
    raise RuntimeError("Could not locate evaluator derived-data insertion point")

derived = '''  const conditionIssueBullets = (conditionAnalysis?.issues || [])
    .filter((issue) => issue.includeInValuation)
    .sort((a, b) => b.planningEstimate - a.planningEstimate);

  const dealStrengthBullets = [
    profitabilityScore >= 82 && valuation.expectedGrossProfit > 0
      ? `Strong economics: ${money(valuation.expectedGrossProfit)} expected gross at the current assumptions.`
      : null,
    compSummary.includedCount >= 6 && finalTargetUsed > 0
      ? `${compSummary.includedCount} strong comps support an expected sale value near ${money(finalTargetUsed)}.`
      : null,
    conditionAnalysisApplied && getEffectiveConditionPlanningEstimate() > 0
      ? `${money(getEffectiveConditionPlanningEstimate())} of selected recon is already reflected in the deal economics.`
      : null,
    ...dealerFitResult.reasons.slice(0, 2),
  ].filter((item): item is string => Boolean(item));

  const dealConcernBullets = [
    ...conditionIssueBullets
      .filter((issue) => issue.severity !== "minor")
      .slice(0, 4)
      .map((issue) => `${issue.description} · ${money(issue.planningEstimate)} planning estimate.`),
    hasLowCompConfidence
      ? "The current comp set is still thin; expand the market before relying heavily on the resale target."
      : null,
  ].filter((item): item is string => Boolean(item));

  const dealerFitContext = hasEvaluationData
    ? `${dealerFitResult.label} · ${dealerFitResult.score}/100`
    : "Not calculated";

'''
text = text.replace(anchor, derived + anchor)

# Transform the middle row after analysis: hide the raw note field and show a concise deal read beside recon.
old_intro = '''              <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(340px,.65fr)]">
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
'''
new_intro = '''              <div className="grid gap-5 lg:grid-cols-2">
                <div>
                  {!conditionAnalysis ? (
                    <>
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
                        className="mt-4 min-h-[190px] w-full resize-y rounded-2xl border border-slate-200 bg-slate-50/60 p-4 text-sm font-medium leading-6 text-slate-700 outline-none transition focus:border-violet-300 focus:bg-white disabled:cursor-not-allowed disabled:bg-slate-100"
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
                          {conditionAnalysisLoading ? "Analyzing..." : "Analyze Vehicle Notes"}
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="h-full rounded-2xl border border-slate-200 bg-slate-50/60 p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="text-[10px] font-black uppercase tracking-[0.1em] text-violet-600">Lot Logic Vehicle Read</div>
                          <h3 className="mt-1 text-lg font-black text-slate-950">What helps — and what actually needs attention</h3>
                        </div>
                        <span className={`rounded-full px-3 py-1 text-[10px] font-black ${dealerFitResult.score >= 72 ? "bg-blue-50 text-blue-700" : dealerFitResult.score >= 55 ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600"}`}>
                          Dealer Fit: {dealerFitContext}
                        </span>
                      </div>

                      <div className="mt-5 grid gap-5 sm:grid-cols-2">
                        <div>
                          <div className="text-[9px] font-black uppercase tracking-[0.12em] text-emerald-700">What strengthens the deal</div>
                          <ul className="mt-3 space-y-2.5">
                            {(dealStrengthBullets.length ? dealStrengthBullets : ["No specific positive signal has been established yet."]).slice(0, 5).map((item) => (
                              <li key={item} className="flex gap-2 text-xs font-semibold leading-5 text-slate-700">
                                <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                                <span>{item}</span>
                              </li>
                            ))}
                          </ul>
                        </div>

                        <div>
                          <div className="text-[9px] font-black uppercase tracking-[0.12em] text-amber-700">What needs attention</div>
                          <ul className="mt-3 space-y-2.5">
                            {(dealConcernBullets.length ? dealConcernBullets : ["No material vehicle-specific concern has been identified from the supplied notes."]).slice(0, 5).map((item) => (
                              <li key={item} className="flex gap-2 text-xs font-semibold leading-5 text-slate-700">
                                <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                                <span>{item}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>

                      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
                        <p className="text-[10px] font-semibold leading-4 text-slate-400">
                          Only vehicle-specific evidence and supported deal signals are shown here. Generic buying hygiene is intentionally excluded.
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setConditionAnalysis(null);
                            setConditionAnalysisApplied(false);
                          }}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600 hover:bg-slate-50"
                        >
                          Edit vehicle notes
                        </button>
                      </div>
                    </div>
                  )}

                  {conditionAnalysisError ? (
                    <div className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
                      {conditionAnalysisError}
                    </div>
                  ) : null}
                </div>
'''
if old_intro not in text:
    raise RuntimeError("Expected AI intake panel was not found")
text = text.replace(old_intro, new_intro)

# Tighten the recon half and remove the empty explanatory state once the input half already explains the workflow.
text = text.replace(
'''                    <div className="flex h-full min-h-[210px] flex-col justify-center text-center">
                      <div className="text-sm font-black text-slate-800">AI recon starts with what you know.</div>
                      <p className="mx-auto mt-2 max-w-sm text-xs font-semibold leading-5 text-slate-500">
                        Lot Logic will propose likely recon items and costs. Nothing affects the valuation until you review and apply it.
                      </p>
                    </div>
''',
'''                    <div className="flex h-full min-h-[260px] flex-col justify-center text-center">
                      <div className="text-sm font-black text-slate-800">AI-detected recon will appear here.</div>
                      <p className="mx-auto mt-2 max-w-sm text-xs font-semibold leading-5 text-slate-500">
                        Analyze the vehicle notes, then confirm or uncheck each proposed item before it affects the valuation.
                      </p>
                    </div>
''',
)

# Emphasize dealer fit as a secondary pill in the verdict card instead of a reason to color the entire decision.
verdict_header = '''                <span
                  className={`inline-flex shrink-0 items-center rounded-full px-3 py-1.5 text-xs font-black ${decisionBadgeTone}`}
                >
                  {lotLogicIcon}{lotLogicLabel}
                </span>
'''
verdict_header_new = '''                <div className="flex flex-wrap items-center justify-end gap-2">
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
'''
if verdict_header not in text:
    raise RuntimeError("Expected verdict badge block was not found")
text = text.replace(verdict_header, verdict_header_new)

path.write_text(text)
print("Evaluator recommendation hierarchy refined")
