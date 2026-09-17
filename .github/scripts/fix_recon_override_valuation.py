from pathlib import Path

path = Path('components/evaluation/evaluation-workspace.tsx')
text = path.read_text()

old = '''  const valuationInput = useMemo<ValuationInput>(() => {
    return {
      ...evaluation,
      targetResaleUsed: finalTargetUsed,
      totalRiskPoints: conditionTotals.riskPoints,
      hasAvoidFlag: Boolean(evaluation.hasAvoidFlag),
      costs: {
        ...evaluation.costs,

        // Fixed detailing and ordinary sale preparation remain separate.
        detailAdmin: evaluation.costs.detailAdmin,

        // Only actual identified condition issues populate these buckets.
        recon: conditionAssessmentsTouched
          ? conditionAssessments.mechanical.reserve
          : 0,
        conditionRiskAdd: conditionAssessmentsTouched
          ? conditionAssessments.cosmetic.reserve
          : 0,
        titleHistoryRiskAdd: conditionAssessmentsTouched
          ? conditionAssessments.history.reserve
          : 0,
      },
    };
  }, [
    evaluation,
    finalTargetUsed,
    conditionTotals,
    conditionAssessments,
    conditionAssessmentsTouched,
  ]);'''

new = '''  const valuationInput = useMemo<ValuationInput>(() => {
    const baseMechanicalReserve = conditionAssessmentsTouched
      ? conditionAssessments.mechanical.reserve
      : 0;
    const baseCosmeticReserve = conditionAssessmentsTouched
      ? conditionAssessments.cosmetic.reserve
      : 0;
    const baseHistoryReserve = conditionAssessmentsTouched
      ? conditionAssessments.history.reserve
      : 0;
    const baseConditionReserveTotal =
      baseMechanicalReserve + baseCosmeticReserve + baseHistoryReserve;

    const hasUserReconOverride =
      typeof conditionPlanningEstimateOverride === "number" &&
      Number.isFinite(conditionPlanningEstimateOverride);
    const effectiveConditionReserveTotal = hasUserReconOverride
      ? Math.max(0, conditionPlanningEstimateOverride)
      : baseConditionReserveTotal;
    const reserveScale =
      baseConditionReserveTotal > 0
        ? effectiveConditionReserveTotal / baseConditionReserveTotal
        : 0;

    const mechanicalReserve =
      baseConditionReserveTotal > 0
        ? Math.round(baseMechanicalReserve * reserveScale)
        : effectiveConditionReserveTotal;
    const historyReserve =
      baseConditionReserveTotal > 0
        ? Math.round(baseHistoryReserve * reserveScale)
        : 0;
    const cosmeticReserve = Math.max(
      0,
      effectiveConditionReserveTotal - mechanicalReserve - historyReserve,
    );

    return {
      ...evaluation,
      targetResaleUsed: finalTargetUsed,
      totalRiskPoints: conditionTotals.riskPoints,
      hasAvoidFlag: Boolean(evaluation.hasAvoidFlag),
      costs: {
        ...evaluation.costs,

        // Fixed detailing and ordinary sale preparation remain separate.
        detailAdmin: evaluation.costs.detailAdmin,

        // A user-entered total recon override is authoritative immediately.
        // Preserve the AI category mix proportionally so downstream risk context
        // remains intact while the total economics use the user's reserve.
        recon: mechanicalReserve,
        conditionRiskAdd: cosmeticReserve,
        titleHistoryRiskAdd: historyReserve,
      },
    };
  }, [
    evaluation,
    finalTargetUsed,
    conditionTotals,
    conditionAssessments,
    conditionAssessmentsTouched,
    conditionPlanningEstimateOverride,
  ]);'''

if old not in text:
    raise RuntimeError('valuationInput block not found')
text = text.replace(old, new, 1)

old = '''                                  onChange={(event) => {
                                    setConditionPlanningEstimateOverride(Math.max(0, toNumber(event.target.value)));
                                    setConditionAnalysisApplied(false);
                                  }}'''
new = '''                                  onChange={(event) => {
                                    setConditionPlanningEstimateOverride(Math.max(0, toNumber(event.target.value)));
                                    // This is an explicit user override, so apply it to
                                    // deal economics immediately rather than requiring a
                                    // second Apply click.
                                    setConditionAnalysisApplied(true);
                                  }}'''
if old not in text:
    raise RuntimeError('override input handler not found')
text = text.replace(old, new, 1)

path.write_text(text)
print('Wired user recon override directly into valuation economics')
