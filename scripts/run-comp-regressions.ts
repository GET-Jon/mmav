import assert from "node:assert/strict";
import { isPromisingNegotiationOpportunity } from "../lib/evaluation/verdict-presentation";
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
