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

export function getSourceDiscount(source: string, assumptions: Assumptions) {
  const match = assumptions.compSettings.sourceDiscounts.find(
    (discount) => discount.source === source
  );

  return match?.askDiscount ?? 0.05;
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
  const mileageDelta = comp.mileage - targetMileage;

  const mileageAdjustment =
    (mileageDelta / 1000) *
    assumptions.compSettings.mileageAdjustmentPerThousand;

  const sourceDiscount = getSourceDiscount(comp.source, assumptions);

  return roundToNearest(
    (comp.askingPrice + mileageAdjustment) * (1 - sourceDiscount)
  );
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
  const validComps = comps.filter(
    (comp) =>
      comp.included &&
      comp.qualityScore >= assumptions.compSettings.minimumQualityScore
  );

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
  };
}
