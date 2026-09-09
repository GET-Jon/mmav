import { defaultAssumptions } from "@/lib/assumptions";
import {
  calculateAdjustedCompPrice,
  calculateCompSummary,
  calculateMileageAdjustment,
} from "@/lib/comps";
import type { MarketComp } from "@/types/comps";

let regressionId = 0;

function makeComp(overrides: Partial<MarketComp>): MarketComp {
  regressionId += 1;
  return {
    id: overrides.id || `regression-${regressionId}`,
    included: overrides.included ?? true,
    source: overrides.source || "Regression",
    region: overrides.region || "Test",
    distance: overrides.distance ?? 10,
    year: overrides.year ?? 2020,
    model: overrides.model || "Test Vehicle",
    trim: overrides.trim || "Base",
    mileage: overrides.mileage ?? 70000,
    askingPrice: overrides.askingPrice ?? 20000,
    qualityScore: overrides.qualityScore ?? 90,
    equivalenceTier: overrides.equivalenceTier || "direct",
    ...overrides,
  };
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

export function assertCompValuationRegressionCases() {
  const targetMileage = 70000;

  const wranglerHighMile = makeComp({
    id: "wrangler-high-mile",
    year: 2005,
    model: "Jeep Wrangler",
    trim: "Unlimited",
    mileage: 167966,
    askingPrice: 13081,
    equivalenceTier: "supporting",
    included: false,
  });

  const firstAdjustment = calculateMileageAdjustment({
    comp: wranglerHighMile,
    targetMileage,
    assumptions: defaultAssumptions,
  });
  const firstAdjustedPrice = calculateAdjustedCompPrice({
    comp: wranglerHighMile,
    targetMileage,
    assumptions: defaultAssumptions,
  });

  assert(
    Math.abs(firstAdjustment.appliedAdjustment) <= wranglerHighMile.askingPrice * 0.2 + 1,
    "Mileage adjustment exceeded the 20% asking-price cap.",
  );
  assert(
    firstAdjustedPrice <= 15700,
    `Wrangler regression: expected adjusted price <= $15,700, received $${firstAdjustedPrice}.`,
  );

  const wranglerMidMile = makeComp({
    id: "wrangler-mid-mile",
    year: 2006,
    model: "Jeep Wrangler",
    trim: "Unlimited",
    mileage: 119415,
    askingPrice: 15990,
    equivalenceTier: "supporting",
    included: false,
  });
  const secondAdjustedPrice = calculateAdjustedCompPrice({
    comp: wranglerMidMile,
    targetMileage,
    assumptions: defaultAssumptions,
  });
  assert(
    secondAdjustedPrice <= 19200,
    `Wrangler regression: expected second adjusted price <= $19,200, received $${secondAdjustedPrice}.`,
  );

  const noFallbackSummary = calculateCompSummary({
    comps: [
      makeComp({ id: "weak", included: true, qualityScore: 40 }),
      makeComp({ id: "unchecked", included: false, qualityScore: 95 }),
    ],
    targetMileage,
    assumptions: defaultAssumptions,
  });
  assert(
    noFallbackSummary.valuationAvailable === false && noFallbackSummary.medianAdjusted === 0,
    "Weak or unchecked comps unexpectedly created an automatic valuation.",
  );

  const supportingManualSummary = calculateCompSummary({
    comps: [
      makeComp({ id: "manual-supporting", included: true, equivalenceTier: "supporting", qualityScore: 70 }),
    ],
    targetMileage,
    assumptions: defaultAssumptions,
  });
  assert(
    supportingManualSummary.includedCount === 1 && supportingManualSummary.confidence === "Low",
    "Manual Supporting-comp override should be usable but remain Low confidence.",
  );

  const outlierSummary = calculateCompSummary({
    comps: [
      makeComp({ id: "a", askingPrice: 20000, mileage: 70000 }),
      makeComp({ id: "b", askingPrice: 20500, mileage: 70000 }),
      makeComp({ id: "c", askingPrice: 21000, mileage: 70000 }),
      makeComp({ id: "d", askingPrice: 21500, mileage: 70000 }),
      makeComp({ id: "outlier", askingPrice: 50000, mileage: 70000 }),
    ],
    targetMileage,
    assumptions: defaultAssumptions,
  });
  assert(
    outlierSummary.excludedOutlierCount === 1,
    `Expected one price outlier to be excluded, received ${outlierSummary.excludedOutlierCount || 0}.`,
  );
  assert(
    outlierSummary.medianAdjusted <= 21500,
    `Outlier unexpectedly distorted median to $${outlierSummary.medianAdjusted}.`,
  );

  return {
    passed: 6,
    failed: 0,
    wranglerAdjustedExamples: {
      highMileage: firstAdjustedPrice,
      midMileage: secondAdjustedPrice,
    },
  };
}
