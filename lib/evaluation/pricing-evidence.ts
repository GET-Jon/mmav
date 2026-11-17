import type { CompSummary } from "@/types/comps";

/** Evidence strength is distinct from vehicle equivalence and arithmetic margin. */
export type PricingEvidenceLevel = "supported" | "provisional" | "preliminary" | "insufficient";

export type PricingEvidence = {
  level: PricingEvidenceLevel;
  label: string;
  closePeerCount: number;
  selectedCount: number;
  decisionReady: boolean;
  hasPriceIndication: boolean;
  explanation: string;
};

/**
 * Use the SAME decision-readiness gate in Market, Verdict and Pipeline.
 * Only sufficiently broad, quality-passing primary cohorts authorize a
 * conclusive acquisition decision. Other values are asking-price indications.
 */
export function classifyPricingEvidence(
  summary: Pick<CompSummary, "includedCount" | "primaryCompCount" | "pricingMode" | "confidence" | "valuationAvailable">,
): PricingEvidence {
  // Provider summaries and saved drafts may contain malformed counts. Never
  // promote a malformed or impossible cohort into an acquisition verdict.
  const safeCount = (value: unknown): number => {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : 0;
  };
  const selectedCount = safeCount(summary.includedCount);
  const closePeerCount = Math.min(selectedCount, safeCount(summary.primaryCompCount));
  const hasPriceIndication = selectedCount > 0 && summary.valuationAvailable !== false;
  const decisionReady = hasPriceIndication &&
    summary.pricingMode === "primary" &&
    closePeerCount >= 4 &&
    (summary.confidence === "High" || summary.confidence === "Medium");
  const level: PricingEvidenceLevel = decisionReady
    ? "supported"
    : !hasPriceIndication || closePeerCount === 0
      ? "insufficient"
      : closePeerCount === 1
        ? "preliminary"
        : "provisional";
  const label = level === "supported"
    ? "Supported valuation"
    : level === "provisional"
      ? "Provisional valuation"
      : level === "preliminary"
        ? "Preliminary price indication"
        : "Insufficient pricing evidence";
  const explanation = level === "supported"
    ? `${closePeerCount} reliable close pricing peers support an acquisition assessment. Asking prices are not completed sales.`
    : level === "provisional"
      ? `${closePeerCount} close pricing peers, below the required confidence threshold. Verify retail pricing before making an acquisition decision.`
      : level === "preliminary"
        ? "Only one close pricing peer is available. This is a preliminary indication, not a reliable acquisition valuation."
        : selectedCount > 0
          ? `${selectedCount} related listing${selectedCount === 1 ? "" : "s"} selected, but no close pricing peers meet the required checks. Treat any dollar figure as unverified market context.`
          : "No qualifying pricing comparisons are selected. Improve the market search before making an acquisition decision.";
  return { level, label, closePeerCount, selectedCount, decisionReady, hasPriceIndication, explanation };
}
