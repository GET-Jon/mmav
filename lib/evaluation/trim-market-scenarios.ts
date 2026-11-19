import type { Assumptions } from "@/types/assumptions";
import type { MarketComp } from "@/types/comps";
import { calculateAdjustedCompPrice } from "@/lib/comps";

/** Descriptive asking-price context, NOT a subject-vehicle valuation or bid. */
export type TrimMarketScenario = {
  trim: string;
  count: number;
  askingMedian: number;
  adjustedMedian: number;
  adjustedLow: number;
  adjustedHigh: number;
};

function roundedMedian(input: number[]) {
  const values = [...input].sort((a, b) => a - b);
  if (!values.length) return 0;
  const mid = Math.floor(values.length / 2);
  const n = values.length % 2 ? values[mid] : (values[mid - 1] + values[mid]) / 2;
  return Math.round(n / 100) * 100;
}

const normalize = (input: unknown) => String(input || "").toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Requires >=3 separate, selected, quality-passing listings in a named trim
 * cohort. Does not infer the subject's trim or promote comps to primary peers.
 * These are asking-price scenarios only, not completed sale prices.
 */
export function buildTrimMarketScenarios({
  comps, model, year, targetMileage, assumptions,
}: {
  comps: MarketComp[];
  model: string;
  year: number;
  targetMileage: number;
  assumptions: Assumptions;
}): TrimMarketScenario[] {
  if (!model || !year || !Number.isFinite(targetMileage) || targetMileage < 0) return [];
  const cohorts = new Map<string, MarketComp[]>();
  const seen = new Set<string>();
  for (const comp of comps) {
    if (!comp.included || comp.equivalenceTier === "reject" ||
        comp.dealerDecision === "exclude" || comp.dealerDecision === "include" ||
        (comp.qualityScore || 0) < assumptions.compSettings.minimumQualityScore ||
        comp.year !== year || normalize(comp.model) !== normalize(model) ||
        !comp.trim?.trim() || !Number.isFinite(comp.askingPrice) || comp.askingPrice <= 0 ||
        !Number.isFinite(comp.mileage) || comp.mileage < 0) continue;
    const trim = comp.trim.trim();
    const vin = comp.marketCheckDetails?.vin?.trim().toUpperCase();
    // Multiple syndicated records for the same vehicle must not inflate sample size.
    const uniqueKey = vin && vin.length === 17
      ? "vin:" + vin
      : "listing:" + (comp.marketCheckDetails?.listingUrl || comp.id);
    if (seen.has(uniqueKey)) continue;
    seen.add(uniqueKey);
    const key = normalize(trim);
    const previous = cohorts.get(key) || [];
    previous.push(comp);
    cohorts.set(key, previous);
  }
  return [...cohorts.entries()]
    .filter(([, entries]) => entries.length >= 3)
    .map(([, entries]) => {
      const adjusted = entries.map(comp => calculateAdjustedCompPrice({ comp, targetMileage, assumptions }));
      return {
        trim: entries[0].trim.trim(),
        count: entries.length,
        askingMedian: roundedMedian(entries.map(comp => comp.askingPrice)),
        adjustedMedian: roundedMedian(adjusted),
        adjustedLow: Math.min(...adjusted),
        adjustedHigh: Math.max(...adjusted),
      };
    })
    .sort((a, b) => b.count - a.count || a.trim.localeCompare(b.trim))
    .slice(0, 3);
}
