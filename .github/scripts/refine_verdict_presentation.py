from pathlib import Path

path = Path('components/evaluation/evaluation-workspace.tsx')
text = path.read_text()

old = '''  const displayedReconReserve = conditionAssessmentsTouched
    ? conditionTotals.reserveAdd
    : 0;
  const displayedCurrentCost = Math.max(0, valuationInput.currentBid) + displayedReconReserve;
  const dealerFitPillTone =
    dealerFitResult.score >= 72
      ? "bg-emerald-100 text-emerald-700"
      : dealerFitResult.score >= 55
        ? "bg-amber-100 text-amber-700"
        : "bg-red-100 text-red-700";'''
new = '''  const displayedReconReserve =
    valuationInput.costs.recon +
    valuationInput.costs.conditionRiskAdd +
    valuationInput.costs.titleHistoryRiskAdd;
  const displayedCurrentCost = Math.max(0, valuationInput.currentBid) + displayedReconReserve;
  const dealerFitPillTone =
    dealerFitResult.score >= 70
      ? "bg-emerald-100 text-emerald-700"
      : dealerFitResult.score >= 40
        ? "bg-amber-100 text-amber-700"
        : "bg-red-100 text-red-700";'''
if old not in text:
    raise RuntimeError('displayed recon / dealer fit block not found')
text = text.replace(old, new, 1)

old = '''  const requiresReview =
    hasEvaluationData &&
    valuation.decision !== "Pass" &&
    valuation.decision !== "Watch / Stretch Only" &&
    (hasLowCompConfidence || hasMaterialConditionRisk);

  const reviewReasons = [
    hasLowCompConfidence ? "market evidence is still thin" : null,
    hasMaterialConditionRisk ? "a material vehicle-specific risk needs review" : null,
  ].filter((reason): reason is string => Boolean(reason));

  const lotLogicLabel = !hasEvaluationData
    ? "AWAITING EVALUATION"
    : valuation.decision === "Pass"
      ? "PASS"
      : valuation.decision === "Watch / Stretch Only"
        ? "WATCH CLOSELY"
        : requiresReview
          ? "REVIEW REQUIRED"
          : "WORTH PURSUING";

  const presentationDecision =
    !hasEvaluationData
      ? "awaiting"
      : valuation.decision === "Pass"
        ? "pass"
        : valuation.decision === "Watch / Stretch Only"
          ? "watch"
          : requiresReview
            ? "review"
            : "pursue";'''
new = '''  const isAboveRecommendedBuy =
    hasEvaluationData &&
    valuationInput.currentBid > 0 &&
    suggestedBid > 0 &&
    valuationInput.currentBid > suggestedBid;

  const hasHardPass =
    hasEvaluationData &&
    (valuation.riskGrade === "High/Avoid" || valuation.expectedGrossProfit <= 0);

  const requiresReview =
    hasEvaluationData &&
    !hasHardPass &&
    (isAboveRecommendedBuy ||
      valuation.decision === "Watch / Stretch Only" ||
      hasLowCompConfidence ||
      hasMaterialConditionRisk);

  const reviewReasons = [
    isAboveRecommendedBuy ? "the current bid is above the Recommended Max Buy" : null,
    hasLowCompConfidence ? "market evidence is still thin" : null,
    hasMaterialConditionRisk ? "a material vehicle-specific risk needs review" : null,
  ].filter((reason): reason is string => Boolean(reason));

  const lotLogicLabel = !hasEvaluationData
    ? "AWAITING EVALUATION"
    : hasHardPass
      ? "PASS"
      : isAboveRecommendedBuy
        ? "ABOVE TARGET PRICE"
        : valuation.decision === "Watch / Stretch Only"
          ? "WATCH CLOSELY"
          : requiresReview
            ? "REVIEW REQUIRED"
            : "WORTH PURSUING";

  const presentationDecision =
    !hasEvaluationData
      ? "awaiting"
      : hasHardPass
        ? "pass"
        : requiresReview
          ? "review"
          : "pursue";'''
if old not in text:
    raise RuntimeError('verdict presentation block not found')
text = text.replace(old, new, 1)

old = '''  const decisionBadgeTone =
    presentationDecision === "pass"
      ? "bg-red-100 text-red-700"
      : presentationDecision === "watch" ||
          presentationDecision === "review"
        ? "bg-amber-100 text-amber-700"
        : presentationDecision === "pursue"
          ? "bg-emerald-100 text-emerald-700"
          : "bg-slate-100 text-slate-600";'''
new = '''  const decisionBadgeTone =
    presentationDecision === "pass"
      ? "bg-red-100 text-red-700"
      : presentationDecision === "review"
        ? "bg-amber-100 text-amber-700"
        : presentationDecision === "pursue"
          ? "bg-emerald-100 text-emerald-700"
          : "bg-slate-100 text-slate-600";'''
if old not in text:
    raise RuntimeError('decision badge tone block not found')
text = text.replace(old, new, 1)

old = '''  const decisionBannerTone =
    presentationDecision === "pass"
      ? "border-red-200/80 bg-red-50/60 text-red-950"
      : presentationDecision === "watch" ||
          presentationDecision === "review"
        ? "border-amber-200/80 bg-amber-50/45 text-amber-950"
        : "border-slate-200 bg-white text-slate-950";'''
new = '''  const decisionBannerTone =
    presentationDecision === "pass"
      ? "border-red-200/80 bg-red-50/60 text-red-950"
      : presentationDecision === "review"
        ? "border-amber-200/80 bg-amber-50/45 text-amber-950"
        : presentationDecision === "pursue"
          ? "border-emerald-200/80 bg-emerald-50/40 text-emerald-950"
          : "border-slate-200 bg-white text-slate-950";'''
if old not in text:
    raise RuntimeError('decision banner tone block not found')
text = text.replace(old, new, 1)

old = '''                    presentationDecision === "pass"
                      ? "bg-red-700 hover:bg-red-800"
                      : presentationDecision === "watch" ||
                          presentationDecision === "review"
                        ? "bg-amber-600 hover:bg-amber-700"
                        : "bg-emerald-700 hover:bg-emerald-800"'''
new = '''                    presentationDecision === "pass"
                      ? "bg-red-700 hover:bg-red-800"
                      : presentationDecision === "review"
                        ? "bg-amber-600 hover:bg-amber-700"
                        : "bg-emerald-700 hover:bg-emerald-800"'''
if old not in text:
    raise RuntimeError('save button tone block not found')
text = text.replace(old, new, 1)

path.write_text(text)
print('Refined verdict hierarchy and effective recon display')
