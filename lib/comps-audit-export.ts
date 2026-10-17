import { calculateAdjustedCompPrice, calculateMileageAdjustment } from "@/lib/comps";
import type { Assumptions } from "@/types/assumptions";
import type { CompSummary, MarketComp } from "@/types/comps";

/**
 * Read-only export of the precise comp inputs currently held in the evaluator.
 * Includes all candidates, not just the first five rows shown in Market.
 * No credit usage or changes to model confidence/valuation.
 */
export function createCompAuditCsv({
  comps,
  targetMileage,
  assumptions,
  summary,
}: {
  comps: MarketComp[];
  targetMileage: number;
  assumptions: Assumptions;
  summary: CompSummary;
}) {
  const columns = [
    "candidate_id", "selected", "dealer_decision", "source", "region",
    "year", "model", "trim", "mileage", "asking_price", "adjusted_price",
    "mileage_delta", "raw_mileage_adjustment", "applied_mileage_adjustment",
    "effective_mileage_cap", "mileage_cap_applied", "mileage_reliability",
    "identity_tier", "match_score", "listing_url", "target_mileage",
    "summary_retained_comps", "summary_raw_selected", "summary_robust_outliers_removed",
    "summary_median_adjusted", "summary_low_adjusted", "summary_high_adjusted",
    "summary_full_range_spread_pct", "summary_confidence",
    "summary_capped_adjustment_count", "summary_confidence_reasons",
    "threshold_high_spread_pct", "threshold_moderate_spread_pct",
    "pricing_role", "pricing_mode", "primary_pricing_comp_count",
    "pricing_comps_used", "market_median_adjusted",
    "market_full_spread_pct", "primary_full_spread_pct",
    "primary_central_spread_pct",
  ];

  const quote = (input: string | number | boolean | null | undefined) =>
    `"${String(input ?? "").replace(/"/g, '""')}"`;

  const spread = summary.medianAdjusted > 0
    ? Number((((summary.highAdjusted - summary.lowAdjusted) / summary.medianAdjusted) * 100).toFixed(2))
    : null;

  const primaryIds = new Set(summary.primaryCompIds || []);
  const rows = comps.map((comp) => {
    const mileage = calculateMileageAdjustment({ comp, targetMileage, assumptions });
    const adjusted = calculateAdjustedCompPrice({ comp, targetMileage, assumptions });
    const fields = [
      comp.id,
      comp.included,
      comp.dealerDecision,
      comp.source,
      comp.region,
      comp.year,
      comp.model,
      comp.trim,
      comp.mileage,
      comp.askingPrice,
      adjusted,
      mileage.mileageDelta,
      Number(mileage.rawAdjustment.toFixed(2)),
      Number(mileage.appliedAdjustment.toFixed(2)),
      Number(mileage.effectiveCap.toFixed(2)),
      mileage.capped,
      mileage.reliability,
      comp.equivalenceTier,
      comp.qualityScore,
      comp.marketCheckDetails?.listingUrl,
      targetMileage,
      summary.includedCount,
      summary.rawIncludedCount,
      summary.excludedOutlierCount,
      summary.medianAdjusted,
      summary.lowAdjusted,
      summary.highAdjusted,
      spread,
      summary.confidence,
      summary.cappedAdjustmentCount,
      (summary.confidenceReasons || []).join("; "),
      Number((assumptions.compSettings.maxSpreadForHighConfidence * 100).toFixed(2)),
      35,
      !comp.included ? "not-selected" : primaryIds.has(comp.id)
        ? "primary-pricing" : summary.pricingMode === "primary"
          ? "supporting-market-context" : "broad-market-fallback",
      summary.pricingMode,
      summary.primaryCompCount,
      summary.pricingCompCount,
      summary.marketMedianAdjusted,
      summary.marketFullSpreadPercent,
      summary.primaryFullSpreadPercent,
      summary.primaryCentralSpreadPercent,
    ];
    return fields.map(quote).join(",");
  });

  return [columns.map(quote).join(","), ...rows].join("\r\n") + "\r\n";
}
