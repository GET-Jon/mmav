export type MotorMatchListing = {
  vin: string | null;
  year: number | null;
  make: string | null;
  model: string | null;
  trim: string | null;
  price: number | null;
  miles: number | null;
  dealer: string | null;
  city: string | null;
  state: string | null;
  url: string | null;
};

export type MotorMatchConfidence = "strong" | "adequate" | "limited" | "none";

type PreparedListing = MotorMatchListing & {
  yearAdjustedPrice: number;
  marketValueAtTargetMileage: number;
};

const DEFAULT_DOLLARS_PER_THOUSAND = 125;
const MAX_MILEAGE_ADJUSTMENT_DOLLARS = 5000;
const MAX_MILEAGE_ADJUSTMENT_PERCENT = 0.2;

function median(values: number[]) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function percentile(values: number[], p: number) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  if (sorted.length === 1) return sorted[0];
  const position = (sorted.length - 1) * p;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  const weight = position - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function cleanBaseRows(rows: MotorMatchListing[]) {
  const basic = rows.filter(
    (row) =>
      typeof row.year === "number" &&
      typeof row.price === "number" &&
      row.price >= 2500 &&
      typeof row.miles === "number" &&
      row.miles >= 0 &&
      row.miles <= 250000,
  );

  if (basic.length < 5) return basic;

  const center = median(basic.map((row) => row.price as number));
  if (!center) return basic;

  const low = Math.max(2500, center * 0.3);
  const high = center * 4;

  return basic.filter(
    (row) => (row.price as number) >= low && (row.price as number) <= high,
  );
}

function estimateAnnualYearAdjustment(rows: MotorMatchListing[]) {
  const byYear = new Map<number, number[]>();

  for (const row of rows) {
    if (!row.year || !row.price) continue;
    const prices = byYear.get(row.year) || [];
    prices.push(row.price);
    byYear.set(row.year, prices);
  }

  const medians = Array.from(byYear.entries())
    .filter(([, prices]) => prices.length >= 3)
    .map(([year, prices]) => ({ year, price: median(prices) as number }))
    .filter((row) => Number.isFinite(row.price))
    .sort((a, b) => a.year - b.year);

  if (medians.length < 2) return 0;

  const slopes: number[] = [];
  for (let i = 0; i < medians.length; i += 1) {
    for (let j = i + 1; j < medians.length; j += 1) {
      const yearDelta = medians[j].year - medians[i].year;
      if (yearDelta <= 0) continue;
      slopes.push((medians[j].price - medians[i].price) / yearDelta);
    }
  }

  const cohortMedian =
    median(rows.map((row) => row.price as number).filter(Number.isFinite)) || 0;
  const raw = median(slopes) || 0;
  const cap = Math.max(750, cohortMedian * 0.18);

  return Math.max(0, Math.min(raw, cap));
}

function mileageAdjustment({
  compMileage,
  targetMileage,
  askingPrice,
}: {
  compMileage: number;
  targetMileage: number;
  askingPrice: number;
}) {
  const mileageDelta = compMileage - targetMileage;
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
      (milesInBand / 1000) *
      DEFAULT_DOLLARS_PER_THOUSAND *
      band.factor;
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

  const raw = sign * adjustment * odometerFactor;
  const cap = Math.min(
    MAX_MILEAGE_ADJUSTMENT_DOLLARS,
    askingPrice * MAX_MILEAGE_ADJUSTMENT_PERCENT,
  );

  return Math.max(-cap, Math.min(cap, raw));
}

function robustPriceFilter(rows: PreparedListing[]) {
  if (rows.length < 5) return rows;

  const prices = rows.map((row) => row.marketValueAtTargetMileage);
  const center = median(prices);
  if (!center) return rows;

  const deviations = prices.map((price) => Math.abs(price - center));
  const mad = median(deviations);
  if (!mad) return rows;

  const kept = rows.filter((row) => {
    const robustZ =
      (0.6745 * Math.abs(row.marketValueAtTargetMileage - center)) / mad;
    const percentageGap =
      center > 0 ? Math.abs(row.marketValueAtTargetMileage - center) / center : 0;

    return !(robustZ > 3.5 && percentageGap > 0.2);
  });

  return kept.length >= 3 ? kept : rows;
}

function confidenceFor(sampleSize: number): MotorMatchConfidence {
  if (sampleSize >= 20) return "strong";
  if (sampleSize >= 8) return "adequate";
  if (sampleSize >= 3) return "limited";
  return "none";
}

function recommendationCount(confidence: MotorMatchConfidence) {
  if (confidence === "strong") return 5;
  if (confidence === "adequate") return 3;
  if (confidence === "limited") return 1;
  return 0;
}

function roundUp(value: number, step: number) {
  return Math.ceil(value / step) * step;
}

function roundNearest(value: number, step: number) {
  return Math.round(value / step) * step;
}

function thresholdForCount(values: number[], desiredCount: number) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const target = Math.max(1, Math.min(desiredCount || 1, sorted.length));
  return sorted[target - 1];
}

function prepareRows(
  rows: MotorMatchListing[],
  targetYear: number,
  targetMileage: number,
) {
  const base = cleanBaseRows(rows);
  const annualYearAdjustment = estimateAnnualYearAdjustment(base);

  const prepared: PreparedListing[] = base.map((row) => {
    const yearAdjusted =
      (row.price as number) +
      annualYearAdjustment * (targetYear - (row.year as number));
    const mileageAdjusted = mileageAdjustment({
      compMileage: row.miles as number,
      targetMileage,
      askingPrice: Math.max(2500, yearAdjusted),
    });

    return {
      ...row,
      yearAdjustedPrice: Math.max(0, yearAdjusted),
      marketValueAtTargetMileage: Math.max(0, yearAdjusted + mileageAdjusted),
    };
  });

  return {
    rows: robustPriceFilter(prepared),
    annualYearAdjustment,
  };
}

export function solveMotorMatch({
  listings,
  budget,
  mileage,
  targetYear,
  generationStartYear,
}: {
  listings: MotorMatchListing[];
  budget: number;
  mileage: number;
  targetYear: number;
  generationStartYear: number;
}) {
  const prepared = prepareRows(listings, targetYear, mileage);
  const rows = prepared.rows;
  const confidence = confidenceFor(rows.length);
  const desiredCount = recommendationCount(confidence);

  const exactYearSampleSize = rows.filter(
    (row) => row.year === targetYear,
  ).length;

  const exact = rows.filter(
    (row) => row.yearAdjustedPrice <= budget && (row.miles as number) <= mileage,
  );
  const withinMileage = rows.filter(
    (row) => (row.miles as number) <= mileage,
  );
  const withinBudget = rows.filter(
    (row) => row.yearAdjustedPrice <= budget,
  );

  const rawPriceNeeded = thresholdForCount(
    withinMileage.map((row) => row.yearAdjustedPrice),
    desiredCount,
  );
  const rawMileageNeeded = thresholdForCount(
    withinBudget.map((row) => row.miles as number),
    desiredCount,
  );

  const priceNeeded =
    rawPriceNeeded === null ? null : roundUp(rawPriceNeeded, 500);
  const mileageNeeded =
    rawMileageNeeded === null ? null : roundUp(rawMileageNeeded, 5000);

  const priceMatchCount =
    priceNeeded === null
      ? 0
      : rows.filter(
          (row) =>
            row.yearAdjustedPrice <= priceNeeded &&
            (row.miles as number) <= mileage,
        ).length;

  const mileageMatchCount =
    mileageNeeded === null
      ? 0
      : rows.filter(
          (row) =>
            row.yearAdjustedPrice <= budget &&
            (row.miles as number) <= mileageNeeded,
        ).length;

  let yearNeeded: number | null = null;
  let yearMatchCount = 0;

  if (exact.length < 5 && rows.length) {
    for (
      let candidate = targetYear - 1;
      candidate >= Math.max(1990, generationStartYear);
      candidate -= 1
    ) {
      const candidateRows = cleanBaseRows(
        listings.filter((row) => row.year === candidate),
      );
      const candidateCount = candidateRows.filter(
        (row) =>
          (row.price as number) <= budget &&
          (row.miles as number) <= mileage,
      ).length;

      if (candidateCount > 0) {
        yearNeeded = candidate;
        yearMatchCount = candidateCount;
        break;
      }
    }
  }

  const state =
    exact.length >= 5 ? "green" : exact.length > 0 ? "yellow" : "red";
  const depth =
    exact.length >= 10
      ? "strong"
      : exact.length >= 5
        ? "healthy"
        : exact.length > 0
          ? "thin"
          : "none";

  const targetValuePrices = rows.map((row) => row.marketValueAtTargetMileage);
  const marketCenter = median(targetValuePrices);
  const marketLow = percentile(targetValuePrices, 0.25);
  const marketHigh = percentile(targetValuePrices, 0.75);

  return {
    state,
    depth,
    confidence,
    matchCount: exact.length,
    constraintStatus: {
      priceWorks: withinBudget.length > 0,
      mileageWorks: withinMileage.length > 0,
    },
    market: {
      priceNeeded,
      mileageNeeded,
      yearNeeded,
      priceMatchCount,
      mileageMatchCount,
      yearMatchCount,
    },
    summary: {
      sampleSize: rows.length,
      exactYearSampleSize,
      marketCenter: marketCenter ? roundNearest(marketCenter, 500) : null,
      marketLow: marketLow ? roundNearest(marketLow, 500) : null,
      marketHigh: marketHigh ? roundNearest(marketHigh, 500) : null,
      annualYearAdjustment: Math.round(prepared.annualYearAdjustment),
    },
    message:
      state === "green"
        ? "Your price and mileage overlap with a healthy current market."
        : state === "yellow"
          ? "Your target is possible, but there are only a few current options."
          : "Your current limits do not overlap in the market snapshot.",
  } as const;
}
