import type { Assumptions } from "@/types/assumptions";
import type { CompSummary, MarketComp } from "@/types/comps";

function roundToNearest(value: number, increment = 100) {
  return Math.round(value / increment) * increment;
}

function median(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }

  return sorted[middle];
}

function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function averageOptional(values: Array<number | null | undefined>) {
  const validValues = values.filter(
    (value): value is number => typeof value === "number" && value > 0
  );

  return validValues.length ? Math.round(average(validValues)) : 0;
}

function getMarketSpeedSignal(days: number) {
  if (!days) {
    return "Unknown";
  }

  if (days <= 30) {
    return "Fast";
  }

  if (days <= 75) {
    return "Normal";
  }

  if (days <= 120) {
    return "Slow";
  }

  return "Very Slow";
}

export function getSourceDiscount(source: string, assumptions: Assumptions) {
  const match = assumptions.compSettings.sourceDiscounts.find(
    (discount) => discount.source === source
  );

  return match?.askDiscount ?? 0.05;
}

export type MileageAdjustmentResult = {
  rawAdjustment: number;
  appliedAdjustment: number;
  dollarCap: number;
  percentCap: number;
  effectiveCap: number;
  capped: boolean;
};

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
  const rawAdjustment =
    (mileageDelta / 1000) *
    assumptions.compSettings.mileageAdjustmentPerThousand;

  // Guardrails intentionally limit how far a heuristic mileage normalization
  // can move a listing. The smaller cap wins. This prevents a high-mileage,
  // low-priced listing from being transformed into an implausibly expensive
  // normalized comp merely because the mileage gap is large.
  const configuredDollarCap = Number(
    assumptions.compSettings.maxMileageAdjustmentDollars
  );
  const configuredPercentCap = Number(
    assumptions.compSettings.maxMileageAdjustmentPercentOfAsk
  );

  // Backward-compatible defaults protect older persisted assumption payloads.
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
    Math.min(effectiveCap, rawAdjustment)
  );

  return {
    rawAdjustment,
    appliedAdjustment,
    dollarCap,
    percentCap,
    effectiveCap,
    capped: Math.abs(rawAdjustment) > effectiveCap,
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

export function calculateCompSummary({
  comps,
  targetMileage,
  assumptions,
}: {
  comps: MarketComp[];
  targetMileage: number;
  assumptions: Assumptions;
}): CompSummary {
  const includedComps = comps.filter((comp) => comp.included === true);

  const qualityPassingComps = includedComps.filter(
    (comp) =>
      typeof comp.qualityScore !== "number" ||
      comp.qualityScore >= assumptions.compSettings.minimumQualityScore
  );

  const validComps = qualityPassingComps.length
    ? qualityPassingComps
    : includedComps.length
    ? includedComps.slice(0, 3)
    : comps.slice(0, 3);

  const adjustedPrices = validComps.map((comp) =>
    calculateAdjustedCompPrice({
      comp,
      targetMileage,
      assumptions,
    })
  );

  const includedCount = validComps.length;
  const lowAdjusted = adjustedPrices.length ? Math.min(...adjustedPrices) : 0;
  const highAdjusted = adjustedPrices.length ? Math.max(...adjustedPrices) : 0;
  const medianAdjusted = roundToNearest(median(adjustedPrices));
  const averageAdjusted = roundToNearest(average(adjustedPrices));
  const fastSaleTarget = medianAdjusted
    ? roundToNearest(
        medianAdjusted * (1 - assumptions.compSettings.fastSaleDiscount)
      )
    : 0;

  const averageDealerDays = averageOptional(
    validComps.map((comp) => comp.dealerDays)
  );

  const averageMarketDays = averageOptional(
    validComps.map((comp) => comp.marketDays)
  );

  const marketSpeedSignal = getMarketSpeedSignal(
    averageMarketDays || averageDealerDays
  );

  const spread =
    medianAdjusted > 0 ? (highAdjusted - lowAdjusted) / medianAdjusted : 1;

  const confidence =
    includedCount < assumptions.compSettings.minimumCompsForMediumConfidence
      ? "Low"
      : includedCount >= assumptions.compSettings.minimumCompsForHighConfidence &&
        spread <= assumptions.compSettings.maxSpreadForHighConfidence
      ? "High"
      : "Medium";

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
  };
}
