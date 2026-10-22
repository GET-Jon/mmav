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
