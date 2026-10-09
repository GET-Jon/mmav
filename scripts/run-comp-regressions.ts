import { assertCompValuationRegressionCases } from "../lib/comps-regression";
import { assertVehicleEquivalenceRegressionCases } from "../lib/marketcheck/vehicle-equivalence-regression";

const equivalence = assertVehicleEquivalenceRegressionCases();
const valuation = assertCompValuationRegressionCases();

console.log(
  `Comp regression suite passed: ${equivalence.passed + valuation.passed} assertions (${equivalence.passed} identity/equivalence, ${valuation.passed} valuation).`,
);
