import assert from "node:assert/strict";
import { isPromisingNegotiationOpportunity } from "../lib/evaluation/verdict-presentation";
import { calculateValuation, calculateDesiredProfitTarget } from "../lib/valuation";
import { defaultAssumptions } from "../lib/assumptions";
import type { ValuationInput } from "../types/evaluation";
import { assertCompSearchIntelligenceRegressionCases } from "../lib/evaluation/comp-search-orchestration-regression";
import { assertAutoDevCompRegressionCases } from "../lib/autodev/qualified-comps-regression";
import { assertCompValuationRegressionCases, assertPrimaryPricingCohortRegressionCases } from "../lib/comps-regression";
import { assertVehicleEquivalenceRegressionCases } from "../lib/marketcheck/vehicle-equivalence-regression";

const equivalence = assertVehicleEquivalenceRegressionCases();
const valuation = assertCompValuationRegressionCases();
const primaryPricing = assertPrimaryPricingCohortRegressionCases();
const national = assertAutoDevCompRegressionCases();
const searchIntelligence = assertCompSearchIntelligenceRegressionCases();

console.log(
  `Comp regression suite passed: ${equivalence.passed + valuation.passed + primaryPricing.passed + national.passed + searchIntelligence.passed} assertions (${equivalence.passed} identity/equivalence, ${valuation.passed} valuation, ${primaryPricing.passed} primary pricing, ${national.passed} national source, ${searchIntelligence.passed} search intelligence).`,
);

const x5 = {
  allInCost: 43950,
  recommendedAllInCost: 42450,
  expectedGrossProfit: 6950,
  saleEstimate: 50900,
  dealEconomicsScore: 68,
  dealerFitScore: 51,
  hasLimitedMarketEvidence: false,
  hasMaterialConditionRisk: false,
  conditionUnknown: false,
  hasHardPass: false,
  needsCompSearch: false,
  conditionReviewPending: false,
};
assert.equal(isPromisingNegotiationOpportunity(x5), true,
  "Profitable BMW X5 with manageable target overage should show negotiate guidance");
assert.equal(isPromisingNegotiationOpportunity({ ...x5, allInCost: 46500 }), false,
  "Large target gap must remain an ordinary review warning");
assert.equal(isPromisingNegotiationOpportunity({ ...x5, expectedGrossProfit: 2500 }), false,
  "Small absolute profit must not be promoted");
assert.equal(isPromisingNegotiationOpportunity({ ...x5, expectedGrossProfit: 4500 }), false,
  "A narrow profit margin must not be promoted");
assert.equal(isPromisingNegotiationOpportunity({ ...x5, hasLimitedMarketEvidence: true }), false,
  "Limited market evidence must not be softened");
assert.equal(isPromisingNegotiationOpportunity({ ...x5, hasMaterialConditionRisk: true }), false,
  "Material condition risks must not be softened");
assert.equal(isPromisingNegotiationOpportunity({ ...x5, conditionUnknown: true }), false,
  "Unknown condition must not be softened");
assert.equal(isPromisingNegotiationOpportunity({ ...x5, dealerFitScore: 30 }), false,
  "Weak dealer fit must not be softened");
assert.equal(isPromisingNegotiationOpportunity({ ...x5, hasHardPass: true }), false,
  "Hard pass must never be softened");
assert.equal(isPromisingNegotiationOpportunity({ ...x5, allInCost: 42000 }), false,
  "At-or-below-target purchases do not need negotiation warning");
console.log("Verdict presentation regression cases passed: 10 assertions.");

const profitInput: ValuationInput = {
  currentBid: 58000, targetResaleUsed: 67300, targetProfit: 0,
  totalRiskPoints: 0,
  costs: {
    auctionFee: 900, transport: 300, recon: 0, detailAdmin: 400,
    generalRiskReserve: 200, brandRiskAdd: 0, titleHistoryRiskAdd: 0,
    conditionRiskAdd: 0,
  },
};
const baseline = calculateDesiredProfitTarget(profitInput);
assert.ok(baseline >= 2500, "Automatic desired profit preserves its minimum floor");
assert.equal(calculateDesiredProfitTarget({ ...profitInput, targetProfit: 5000, profitTargetMode: "fixed" }), 5000,
  "Dealer fixed $5,000 target must not be raised by the automatic 20% rule");
assert.equal(calculateDesiredProfitTarget({ ...profitInput, targetProfit: 0, profitTargetMode: "fixed" }), baseline,
  "An unset fixed target must fall back to automatic profit rather than zero");
assert.equal(calculateDesiredProfitTarget({ ...profitInput, targetProfit: 2000, profitTargetMode: "minimum" }), baseline,
  "A dealer minimum below the automatic target must not lower the default floor");
assert.ok(calculateDesiredProfitTarget({ ...profitInput, targetProfit: 15000, profitTargetMode: "minimum" }) >= 15000,
  "A higher manual minimum must remain a floor");
const fixedValuation = calculateValuation({ ...profitInput, targetProfit: 5000, profitTargetMode: "fixed" }, defaultAssumptions);
assert.equal(fixedValuation.desiredProfitTarget, 5000, "Fixed desired profit must drive valuation output");
assert.equal(fixedValuation.maxSmartBid,
  Math.round((profitInput.targetResaleUsed - fixedValuation.totalCostAdders - 5000) / 100) * 100,
  "Fixed profit target must flow through recommended max bid");
console.log("Desired profit strategy regressions passed: 7 assertions.");
