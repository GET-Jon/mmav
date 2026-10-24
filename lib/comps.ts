import type { Assumptions } from "@/types/assumptions";
import type { CompSummary, MarketComp } from "@/types/comps";
import { buildPrimaryPricingCohort, percentile } from "@/lib/comps-pricing-cohort";

function roundToNearest(value: number, increment = 100) {
  return Math.round(value / increment) * increment;
}

function median(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }
  return sorted[middle];
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function averageOptional(values: Array<number | null | undefined>) {
  const validValues = values.filter(
    (value): value is number => typeof value === "number" && value > 0,
  );
  return validValues.length ? Math.round(average(validValues)) : 0;
}

function getMarketSpeedSignal(days: number) {
  if (!days) return "Unknown";
  if (days <= 30) return "Fast";
  if (days <= 75) return "Normal";
  if (days <= 120) return "Slow";
  return "Very Slow";
}

export type MileageAdjustmentResult = {
  rawAdjustment: number;
  appliedAdjustment: number;
  dollarCap: number;
  percentCap: number;
  effectiveCap: number;
  capped: boolean;
  rawAdjustmentPercentOfAsk: number;
  mileageDelta: number;
  reliability: "normal" | "caution" | "low";
};

function calculateDiminishingMileageValue({
  mileageDelta,
  targetMileage,
  compMileage,
  dollarsPerThousand,
}: {
  mileageDelta: number;
  targetMileage: number;
  compMileage: number;
  dollarsPerThousand: number;
}) {
  const sign = mileageDelta >= 0 ? 1 : -1;
  let remainingMiles = Math.abs(mileageDelta);

  const bands = [
    { miles: 25000, factor: 1 },
    { miles: 25000, factor: 0.7 },
    { miles: 50000, factor: 0.4 },
    { miles: Number.POSITIVE_INFINITY, factor: 0.2 },
  ];

  let adjustment = 0;
  for (const band of bands) {
    if (remainingMiles <= 0) break;
    const milesInBand = Math.min(remainingMiles, band.miles);
    adjustment +=
      (milesInBand / 1000) * dollarsPerThousand * band.factor;
    remainingMiles -= milesInBand;
  }

  const averageOdometer = Math.max(0, (targetMileage + compMileage) / 2);
  const odometerFactor =
    averageOdometer <= 40000
      ? 1.15
      : averageOdometer <= 80000
        ? 1
        : averageOdometer <= 120000
          ? 0.85
          : averageOdometer <= 160000
            ? 0.65
            : 0.5;

  return sign * adjustment * odometerFactor;
}

export function calculateMileageAdjustment({
  comp,
  targetMileage,
  assumptions,
}: {
  comp: MarketComp;
  targetMileage: number;
  assumptions: Assumptions;
}): MileageAdjustmentResult {
  const mileageDelta = comp.mileage - targetMileage;
  const rawAdjustment = calculateDiminishingMileageValue({
    mileageDelta,
    targetMileage,
    compMileage: comp.mileage,
    dollarsPerThousand:
      assumptions.compSettings.mileageAdjustmentPerThousand,
  });

  const configuredDollarCap = Number(
    assumptions.compSettings.maxMileageAdjustmentDollars,
  );
  const configuredPercentCap = Number(
    assumptions.compSettings.maxMileageAdjustmentPercentOfAsk,
  );

  const dollarCap =
    Number.isFinite(configuredDollarCap) && configuredDollarCap > 0
      ? configuredDollarCap
      : 5000;
  const percent =
    Number.isFinite(configuredPercentCap) && configuredPercentCap > 0
      ? configuredPercentCap
      : 0.2;
  const percentCap = Math.max(0, comp.askingPrice * percent);
  const effectiveCap = Math.min(dollarCap, percentCap);
  const appliedAdjustment = Math.max(
    -effectiveCap,
    Math.min(effectiveCap, rawAdjustment),
  );
  const rawAdjustmentPercentOfAsk =
    comp.askingPrice > 0 ? Math.abs(rawAdjustment) / comp.askingPrice : 1;
  const capped = Math.abs(rawAdjustment) > effectiveCap;

  const reliability =
    rawAdjustmentPercentOfAsk > 0.6 || Math.abs(mileageDelta) > 100000
      ? "low"
      : capped || rawAdjustmentPercentOfAsk > 0.3 || Math.abs(mileageDelta) > 60000
        ? "caution"
        : "normal";

  return {
    rawAdjustment,
    appliedAdjustment,
    dollarCap,
    percentCap,
    effectiveCap,
    capped,
    rawAdjustmentPercentOfAsk,
    mileageDelta,
    reliability,
  };
}

export function calculateAdjustedCompPrice({
  comp,
  targetMileage,
  assumptions,
}: {
  comp: MarketComp;
  targetMileage: number;
  assumptions: Assumptions;
}) {
  const { appliedAdjustment } = calculateMileageAdjustment({
    comp,
    targetMileage,
    assumptions,
  });
  return roundToNearest(comp.askingPrice + appliedAdjustment);
}

type ValuationComp = {
  comp: MarketComp;
  adjustedPrice: number;
  mileage: MileageAdjustmentResult;
};

function removeRobustPriceOutliers(entries: ValuationComp[]) {
  if (entries.length < 5) {
    return { kept: entries, excluded: [] as ValuationComp[] };
  }

  const prices = entries.map((entry) => entry.adjustedPrice);
  const center = median(prices);
  const deviations = prices.map((price) => Math.abs(price - center));
  const mad = median(deviations);

  if (!mad) {
    return { kept: entries, excluded: [] as ValuationComp[] };
  }

  const kept: ValuationComp[] = [];
  const excluded: ValuationComp[] = [];

  for (const entry of entries) {
    const robustZ = (0.6745 * Math.abs(entry.adjustedPrice - center)) / mad;
    const percentageGap = center > 0
      ? Math.abs(entry.adjustedPrice - center) / center
      : 0;

    if (robustZ > 3.5 && percentageGap > 0.2) {
      excluded.push(entry);
    } else {
      kept.push(entry);
    }
  }

  if (kept.length < 3) {
    return { kept: entries, excluded: [] as ValuationComp[] };
  }

  return { kept, excluded };
}

function isHardRejected(comp: MarketComp) {
  return comp.equivalenceTier === "reject";
}

export function calculateCompSummary({
  comps,
  targetMileage,
  targetYear,
  targetFuelType,
  targetDrivetrain,
  targetEngine,
  assumptions,
}: {
  comps: MarketComp[];
  targetMileage: number;
  targetYear?: number | null;
  targetFuelType?: string | null;
  targetDrivetrain?: string | null;
  targetEngine?: string | null;
  assumptions: Assumptions;
}): CompSummary {
  const rawIncludedComps = comps.filter((comp) => comp.included === true);

  // Automatic selections must pass the model's identity and quality rules.
  // A dealer may deliberately include any visible listing as an override; that
  // decision is preserved and lowers confidence rather than being silently
  // ignored by the valuation engine.
  const qualityPassingComps = rawIncludedComps.filter((comp) => {
    if (comp.dealerDecision === "include") return true;

    return (
      !isHardRejected(comp) &&
      (typeof comp.qualityScore !== "number" ||
        comp.qualityScore >= assumptions.compSettings.minimumQualityScore)
    );
  });

  const prepared: ValuationComp[] = qualityPassingComps.map((comp) => ({
    comp,
    adjustedPrice: calculateAdjustedCompPrice({
      comp,
      targetMileage,
      assumptions,
    }),
    mileage: calculateMileageAdjustment({
      comp,
      targetMileage,
      assumptions,
    }),
  }));

  const { kept, excluded } = removeRobustPriceOutliers(prepared);
  const validComps = kept.map((entry) => entry.comp);
  const broadPrices = kept.map((entry) => entry.adjustedPrice);
  const cohort = buildPrimaryPricingCohort(kept, {
    year: targetYear,
    mileage: targetMileage,
    fuelType: targetFuelType,
    drivetrain: targetDrivetrain,
    engine: targetEngine,
  }, Math.max(4, assumptions.compSettings.minimumCompsForMediumConfidence));
  // No silent promotion of a tiny handful of good-looking comps. When there
  // are fewer than four close, uncapped matches, fall back to the existing
  // broad-market median with explicit low-confidence disclosure.
  const pricingEntries = cohort.usable ? cohort.primary : kept;
  const adjustedPrices = pricingEntries.map((entry) => entry.adjustedPrice);
  const marketMedianAdjusted = roundToNearest(median(broadPrices));
  const fullMarketSpread = marketMedianAdjusted > 0
    ? (Math.max(...broadPrices) - Math.min(...broadPrices)) / marketMedianAdjusted
    : 1;
  const includedCount = validComps.length;
  const lowAdjusted = adjustedPrices.length ? Math.min(...adjustedPrices) : 0;
  const highAdjusted = adjustedPrices.length ? Math.max(...adjustedPrices) : 0;
  const medianAdjusted = roundToNearest(median(adjustedPrices));
  const averageAdjusted = roundToNearest(average(adjustedPrices));
  const fastSaleTarget = medianAdjusted
    ? roundToNearest(
        medianAdjusted * (1 - assumptions.compSettings.fastSaleDiscount),
      )
    : 0;

  const averageDealerDays = averageOptional(
    validComps.map((comp) => comp.dealerDays),
  );
  const averageMarketDays = averageOptional(
    validComps.map((comp) => comp.marketDays),
  );
  const marketSpeedSignal = getMarketSpeedSignal(
    averageMarketDays || averageDealerDays,
  );

  const spread =
    medianAdjusted > 0 ? (highAdjusted - lowAdjusted) / medianAdjusted : 1;
  const centralSpread = medianAdjusted > 0
    ? (percentile(adjustedPrices, 0.75) - percentile(adjustedPrices, 0.25)) / medianAdjusted
    : 1;
  const marketDivergence = marketMedianAdjusted > 0
    ? Math.abs(medianAdjusted - marketMedianAdjusted) / marketMedianAdjusted
    : 0;
  const directCount = validComps.filter(
    (comp) => !comp.equivalenceTier || comp.equivalenceTier === "direct",
  ).length;
  const nearCount = validComps.filter(
    (comp) => comp.equivalenceTier === "near",
  ).length;
  const supportingCount = validComps.filter(
    (comp) => comp.equivalenceTier === "supporting",
  ).length;
  const independentlySourcedCount = validComps.filter(
    (comp) => comp.source === "Auto.dev",
  ).length;
  const marketCheckVerifiedCount = includedCount - independentlySourcedCount;
  const dealerOverrideCount = validComps.filter(
    (comp) => comp.dealerDecision === "include",
  ).length;
  const dealerHardOverrideCount = validComps.filter(
    (comp) =>
      comp.dealerDecision === "include" &&
      (isHardRejected(comp) ||
        (typeof comp.qualityScore === "number" &&
          comp.qualityScore < assumptions.compSettings.minimumQualityScore)),
  ).length;
  const directRatio = includedCount > 0 ? directCount / includedCount : 0;
  const supportingRatio = includedCount > 0 ? supportingCount / includedCount : 0;
  const averageQuality = pricingEntries.length
    ? average(pricingEntries.map((entry) => Number(entry.comp.qualityScore || 0)))
    : 0;
  const cappedAdjustmentCount = kept.filter((entry) => entry.mileage.capped).length;
  const lowReliabilityAdjustmentCount = kept.filter(
    (entry) => entry.mileage.reliability === "low",
  ).length;
  const primaryQuality = cohort.primary.length
    ? average(cohort.primary.map((entry) => Number(entry.comp.qualityScore || 0)))
    : 0;
  const primaryProviderCount = cohort.primary.filter(
    (entry) => entry.comp.source !== "Auto.dev",
  ).length;
  const cappedRatio = includedCount > 0
    ? cappedAdjustmentCount / includedCount
    : 1;

  const confidenceReasons: string[] = [];
  if (cohort.usable) {
    confidenceReasons.push(
      `${cohort.primary.length} close, uncapped pricing peers; ${cohort.supporting.length} broader comps retained as market context`,
    );
    if (cappedAdjustmentCount > 0) {
      confidenceReasons.push(
        `${cappedAdjustmentCount} broader listing${cappedAdjustmentCount === 1 ? "" : "s"} required capped mileage adjustments and did not set primary pricing`,
      );
    }
    if (cohort.unverifiedConfigCount > 0) {
      confidenceReasons.push(
        `${cohort.unverifiedConfigCount} primary peer${cohort.unverifiedConfigCount === 1 ? " has" : "s have"} unverified powertrain or drivetrain attributes`,
      );
    }
    if (marketDivergence > 0.2) {
      confidenceReasons.push("closely matched prices diverge materially from the broader market");
    }
    if (spread > 0.35 || centralSpread > 0.2) {
      confidenceReasons.push("primary pricing peers still disagree substantially");
    }
    if (fullMarketSpread > 0.35) {
      confidenceReasons.push("broader market adjusted prices remain widely dispersed");
    }
  } else {
    if (targetYear && kept.length) {
      confidenceReasons.push(
        `only ${cohort.primary.length} close, uncapped pricing peer${cohort.primary.length === 1 ? "" : "s"}; at least four are required to establish a separate primary price`,
      );
    }
    if (spread > assumptions.compSettings.maxSpreadForHighConfidence) {
      confidenceReasons.push("adjusted prices have a wide spread");
    }
    if (cappedRatio > 0.25 && includedCount > 0) {
      confidenceReasons.push("multiple mileage adjustments reached the cap");
    }
  }
  if (includedCount < assumptions.compSettings.minimumCompsForMediumConfidence) {
    confidenceReasons.push("too few reliable comps");
  }
  if (directRatio < 0.5 && includedCount > 0) {
    confidenceReasons.push("most included comps are not Direct equivalents");
  }
  if (supportingCount > 0) {
    confidenceReasons.push(`${supportingCount} Supporting vehicle-equivalence comps were manually included`);
  }
  if (dealerHardOverrideCount > 0) {
    confidenceReasons.push(
      `${dealerHardOverrideCount} dealer-selected comps bypass Lot Logic's normal identity or quality rules`,
    );
  }
  if (lowReliabilityAdjustmentCount > 0) {
    confidenceReasons.push("one or more mileage gaps are too large for reliable normalization");
  }
  if (excluded.length > 0) {
    confidenceReasons.push(`${excluded.length} adjusted-price outlier${excluded.length === 1 ? " was" : "s were"} excluded`);
  }
  if (independentlySourcedCount > 0 && marketCheckVerifiedCount < 2) {
    confidenceReasons.push("national retail evidence has limited independent provider corroboration");
  }

  const highConfidence = cohort.usable
    ? cohort.primary.length >= Math.max(8, assumptions.compSettings.minimumCompsForHighConfidence) &&
      primaryProviderCount >= 2 &&
      primaryQuality >= 80 &&
      spread <= assumptions.compSettings.maxSpreadForHighConfidence &&
      centralSpread <= 0.12 &&
      fullMarketSpread <= 0.35 &&
      marketDivergence <= 0.15 &&
      cohort.unverifiedConfigCount === 0 &&
      dealerHardOverrideCount === 0 &&
      supportingCount === 0 &&
      excluded.length === 0
    : !targetYear &&
      marketCheckVerifiedCount >= 2 &&
      includedCount >= assumptions.compSettings.minimumCompsForHighConfidence &&
      directRatio >= 0.5 &&
      supportingCount === 0 &&
      dealerHardOverrideCount === 0 &&
      averageQuality >= 75 &&
      spread <= assumptions.compSettings.maxSpreadForHighConfidence &&
      cappedRatio <= 0.25 &&
      lowReliabilityAdjustmentCount === 0;

  const mediumConfidence = cohort.usable
    ? cohort.primary.length >= 4 &&
      primaryQuality >= 75 &&
      spread <= 0.35 &&
      centralSpread <= 0.2 &&
      marketDivergence <= 0.3 &&
      dealerHardOverrideCount === 0 &&
      supportingCount === 0
    : !targetYear &&
      includedCount >= assumptions.compSettings.minimumCompsForMediumConfidence &&
      averageQuality >= 60 &&
      spread <= 0.35 &&
      cappedRatio <= 0.5 &&
      supportingRatio <= 0.5 &&
      dealerHardOverrideCount === 0;

  const confidence = highConfidence
    ? "High"
    : mediumConfidence
      ? "Medium"
      : "Low";

  return {
    includedCount,
    lowAdjusted,
    medianAdjusted,
    highAdjusted,
    averageAdjusted,
    fastSaleTarget,
    confidence,
    averageDealerDays,
    averageMarketDays,
    marketSpeedSignal,
    valuationAvailable: includedCount > 0,
    rawIncludedCount: rawIncludedComps.length,
    excludedOutlierCount: excluded.length,
    directCount,
    nearCount,
    supportingCount,
    cappedAdjustmentCount,
    lowReliabilityAdjustmentCount,
    dealerOverrideCount,
    dealerHardOverrideCount,
    confidenceReasons,
    pricingMode: cohort.usable ? "primary" : "market-fallback",
    primaryCompCount: cohort.primary.length,
    pricingCompCount: pricingEntries.length,
    primaryCompIds: cohort.usable ? cohort.primary.map((entry) => entry.comp.id) : [],
    marketMedianAdjusted,
    marketFullSpreadPercent: Math.round(fullMarketSpread * 1000) / 10,
    primaryFullSpreadPercent: cohort.usable ? Math.round(spread * 1000) / 10 : null,
    primaryCentralSpreadPercent: cohort.usable ? Math.round(centralSpread * 1000) / 10 : null,
  };
}
