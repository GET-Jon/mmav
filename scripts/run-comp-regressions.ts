import { assertAutoDevCompRegressionCases } from "../lib/autodev/qualified-comps-regression";
import { assertCompValuationRegressionCases } from "../lib/comps-regression";
import { assertVehicleEquivalenceRegressionCases } from "../lib/marketcheck/vehicle-equivalence-regression";

const equivalence = assertVehicleEquivalenceRegressionCases();
const valuation = assertCompValuationRegressionCases();
const national = assertAutoDevCompRegressionCases();

console.log(
  `Comp regression suite passed: ${equivalence.passed + valuation.passed + national.passed} assertions (${equivalence.passed} identity/equivalence, ${valuation.passed} valuation, ${national.passed} national source).`,
);
