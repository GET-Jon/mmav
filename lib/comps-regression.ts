import { defaultAssumptions } from "@/lib/assumptions";
import {
  calculateAdjustedCompPrice,
  calculateCompSummary,
  calculateMileageAdjustment,
} from "@/lib/comps";
import type { MarketComp } from "@/types/comps";
import { buildRefinementEvent, type RefinementSnapshot } from "@/lib/comps-refinement-history";

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
  regressionId = 0;
  const targetMileage = 70000;
  const snapshot = (comps: MarketComp[], primaryCount: number, regions: string[]): RefinementSnapshot => ({
    comps, primaryIds: comps.slice(0, primaryCount).map(comp => comp.id), primaryCount,
    selected: comps.filter(comp => comp.included).length,
    retail: 20000, confidence: "Low", regions,
  });
  const existing = makeComp({ id:"refine-existing" });
  const newPeer = makeComp({ id:"refine-added", marketCheckDetails: { vin: "TRUK1AFK2B1016841" } as MarketComp["marketCheckDetails"] });
  const before = snapshot([existing], 0, ["Charleston"]);
  const after = snapshot([existing,newPeer], 1, ["Charleston","Atlanta"]);
  const improvement = buildRefinementEvent(before, after, "search");
  assert(improvement.status === "improved" && improvement.primaryDelta === 1 &&
    improvement.newUnique === 1 && improvement.newRegions.length === 1,
    "Net-new qualifying peers and markets must be reported even below the four-peer pricing threshold.");
  const duplicate = buildRefinementEvent(after, snapshot([existing,newPeer,
    makeComp({ id:"different-provider-row", marketCheckDetails: { vin:"TRUK1AFK2B1016841" } as MarketComp["marketCheckDetails"] })], 1, ["Charleston","Atlanta"]), "search");
  assert(duplicate.newUnique === 0 && duplicate.newRelated === 0,
    "The same VIN from multiple providers must not count as a new vehicle.");
  const unchanged = buildRefinementEvent(after, after, "search");
  assert(unchanged.status === "unchanged", "An unchanged search must never report success.");

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

  const rejectedAutomaticSummary = calculateCompSummary({
    comps: [
      makeComp({
        id: "rejected-automatic",
        included: true,
        equivalenceTier: "reject",
        qualityScore: 90,
      }),
    ],
    targetMileage,
    assumptions: defaultAssumptions,
  });
  assert(
    rejectedAutomaticSummary.includedCount === 0,
    "A rejected comp must not enter valuation unless the dealer explicitly overrides it.",
  );

  const rejectedDealerOverrideSummary = calculateCompSummary({
    comps: [
      makeComp({
        id: "rejected-dealer-override",
        included: true,
        equivalenceTier: "reject",
        qualityScore: 90,
        dealerDecision: "include",
      }),
    ],
    targetMileage,
    assumptions: defaultAssumptions,
  });
  assert(
    rejectedDealerOverrideSummary.includedCount === 1 &&
      rejectedDealerOverrideSummary.confidence === "Low" &&
      rejectedDealerOverrideSummary.dealerHardOverrideCount === 1,
    "A dealer-selected rejected comp should be usable as an explicit Low-confidence override.",
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
    passed: 8,
    failed: 0,
    wranglerAdjustedExamples: {
      highMileage: firstAdjustedPrice,
      midMileage: secondAdjustedPrice,
    },
  };
}

/**
 * Anonymized 2018 Audi A3 MarketCheck audit, 53,000-mile subject.
 * Numeric listing inputs come from the original and expanded-search exports;
 * VINs and retail listing links are deliberately omitted from regression code.
 */
export function assertPrimaryPricingCohortRegressionCases() {
  let passed = 0;
  const check = (test: boolean, message: string) => {
    assert(test, message);
    passed++;
  };
  const entries: Array<[number, number, number, number]> = [
    [2018, 51478, 20624, 97],
    [2018, 90383, 13999, 87],
    [2016, 84091, 11500, 76],
    [2016, 83650, 11900, 75],
    [2016, 87249, 9995, 74],
    [2020, 94905, 14698, 71],
    [2018, 78962, 9995, 91],
    [2017, 45997, 17998, 90],
    [2017, 67442, 16078, 89],
    [2018, 92822, 10500, 87],
    [2019, 77331, 13200, 84],
    [2016, 78839, 14599, 79],
    // Expanded search added 6 more comps.
    [2019, 61103, 16495, 88],
    [2018, 96121, 9900, 84],
    [2020, 58423, 19900, 83],
    [2020, 65704, 18651, 81],
    [2018, 110882, 12700, 78],
    [2020, 74077, 18998, 78],
  ];
  const audiComps = entries.map(([year,mileage,askingPrice,qualityScore],index) =>
    makeComp({ id: `audi-anon-${index}`, year, mileage, askingPrice, qualityScore,
      model: "Audi A3 Sedan", trim: "Premium", source: "MarketCheck/API",
      equivalenceTier: "direct" }));
  const summary = (comps: MarketComp[], opts: {
    drivetrain?: string;
    fuelType?: string;
    engine?: string;
  } = {}) => calculateCompSummary({
    comps,
    targetMileage: 53000,
    targetYear: 2018,
    targetDrivetrain: opts.drivetrain,
    targetFuelType: opts.fuelType,
    targetEngine: opts.engine,
    assumptions: defaultAssumptions,
  });

  const initial = summary(audiComps.slice(0, 12));
  check(initial.includedCount === 12, "Initial Audi comp count changed");
  check(initial.pricingMode === "market-fallback" && initial.primaryCompCount === 3,
    "Three close matches must not silently set the primary valuation");
  check(initial.medianAdjusted === 16300 && initial.confidence === "Low",
    "Initial Audi broad price and Low confidence must be preserved");

  const expanded = summary(audiComps);
  check(expanded.includedCount === 18 && expanded.primaryCompCount === 4,
    "Expanded search must preserve all 18 comps and identify 4 reliable close peers");
  check(expanded.pricingMode === "primary" && expanded.pricingCompCount === 4,
    "Only the eligible close peers should establish the primary price");
  check(expanded.marketMedianAdjusted === 17000 && expanded.medianAdjusted === 17700,
    `Expected Audi $17,700 primary median vs $17,000 broad median, got $${expanded.medianAdjusted} / $${expanded.marketMedianAdjusted}`);
  check(expanded.confidence === "Medium",
    "Four coherent, uncapped close peers should permit Medium, not High confidence");
  check(expanded.cappedAdjustmentCount === 11,
    "Capped broader comps must remain auditable without dictating primary price");

  const cleanPrimary = Array.from({length:8}, (_,i) => makeComp({
    id:`clean-${i}`, year:2018, mileage:52500 + i*200,
    askingPrice:17800 + i*100, qualityScore:94, source:"MarketCheck/API",
    marketCheckDetails:{fuelType:"gasoline",drivetrain:"FWD",engine:"2.0 L"},
  }));
  const high = summary(cleanPrimary,{drivetrain:"FWD",fuelType:"gasoline",engine:"2.0 L"});
  check(high.confidence === "High" && high.primaryCompCount === 8,
    "Eight tightly agreeing verified primary peers should support High confidence");

  const mismatch = cleanPrimary.slice(0,4).map((c,i)=>({
    ...c,id:`known-mismatch-${i}`,
    marketCheckDetails:{...c.marketCheckDetails,drivetrain:i===0?"quattro AWD":"FWD"},
  }));
  const mismatched = summary(mismatch,{drivetrain:"FWD",fuelType:"gasoline",engine:"2.0 L"});
  check(mismatched.pricingMode === "market-fallback" && mismatched.primaryCompCount === 3 &&
    mismatched.confidence === "Low",
    "Known AWD/FWD mismatch must not qualify as a primary pricing peer");

  const engineMismatch = cleanPrimary.slice(0,4).map((c,i)=>({
    ...c,id:`different-engine-${i}`,
    marketCheckDetails:{...c.marketCheckDetails,engine:i===0?"1.8 L":"2.0 L"},
  }));
  const powertrain = summary(engineMismatch,{drivetrain:"FWD",fuelType:"gasoline",engine:"2.0 L"});
  check(powertrain.pricingMode === "market-fallback" && powertrain.primaryCompCount === 3,
    "Known 1.8 vs 2.0 liter differences must not enter the primary cohort");

  return { passed, failed: 0, audiInitialMedian:initial.medianAdjusted,
    audiImprovedMedian:expanded.medianAdjusted, primaryCount:expanded.primaryCompCount };
}
