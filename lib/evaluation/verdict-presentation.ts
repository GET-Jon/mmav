/**
 * Presentation-only nuance for a deal that misses the ideal buy target by a
 * manageable amount. Does not override the underlying review requirement,
 * change suggested bids, or relax valuation/risk calculations.
 */
export function isPromisingNegotiationOpportunity(input: {
  allInCost: number;
  recommendedAllInCost: number;
  expectedGrossProfit: number;
  saleEstimate: number;
  dealEconomicsScore: number;
  dealerFitScore: number;
  hasLimitedMarketEvidence: boolean;
  hasMaterialConditionRisk: boolean;
  conditionUnknown: boolean;
  hasHardPass: boolean;
  needsCompSearch: boolean;
  conditionReviewPending: boolean;
}): boolean {
  const {
    allInCost, recommendedAllInCost, expectedGrossProfit, saleEstimate,
    dealEconomicsScore, dealerFitScore, hasLimitedMarketEvidence,
    hasMaterialConditionRisk, conditionUnknown, hasHardPass,
    needsCompSearch, conditionReviewPending,
  } = input;

  const values = [allInCost, recommendedAllInCost, expectedGrossProfit,
    saleEstimate, dealEconomicsScore, dealerFitScore];
  if (values.some((value) => !Number.isFinite(value))) return false;
  if (hasHardPass || needsCompSearch || conditionReviewPending ||
      hasLimitedMarketEvidence || hasMaterialConditionRisk || conditionUnknown) return false;

  const overTarget = allInCost - recommendedAllInCost;
  if (allInCost <= 0 || recommendedAllInCost <= 0 || saleEstimate <= 0 ||
      overTarget <= 0 || expectedGrossProfit < 3000) return false;

  // A healthy margin and a modest negotiation gap are BOTH required.
  // Avoid using positive gross profit alone to soften a weak opportunity.
  return expectedGrossProfit / saleEstimate >= 0.10 &&
    dealEconomicsScore >= 60 &&
    dealerFitScore >= 40 &&
    overTarget <= Math.min(expectedGrossProfit * 0.25, allInCost * 0.05);
}
