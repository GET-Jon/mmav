export type EvidenceLevel = "High" | "Moderate" | "Limited";
export type DealerVerdict = "Pursue" | "Investigate" | "Pass" | "Insufficient information";
export type NextAction = "trim" | "identity" | "condition" | "market" | "costs" | "review";

export type VerdictFirstInputs = {
  identityKnown: boolean;
  retailTrimUnknown: boolean;
  identityConflicts: string[];
  selectedComps: number;
  closePeers: number;
  pricingDecisionReady: boolean;
  marketConfidence: EvidenceLevel;
  conditionStatus: "unknown" | "no_material_issues" | "issues" | "unreviewed";
  materialConditionRisk: boolean;
  hasPurchasePrice: boolean;
  purchasePrice: number;
  indicativeMarketLow: number;
  indicativeMarketMedian: number;
  hasSupportedSalePrice: boolean;
  hardPass: boolean;
  reviewRequired: boolean;
};

export type VerdictFirstAssessment = {
  verdict: DealerVerdict;
  confidence: EvidenceLevel;
  identityConfidence: EvidenceLevel;
  marketConfidence: EvidenceLevel;
  acquisitionConfidence: EvidenceLevel;
  action: NextAction;
  actionLabel: string;
  actionExplanation: string;
  headline: string;
  summary: string;
  opportunityDetected: boolean;
  blockers: string[];
};

/**
 * Distinguish deal attractiveness from evidence certainty.
 * No numerical percentages or unsupported bid/profit estimates are invented.
 */
export function assessVerdictFirst(input: VerdictFirstInputs): VerdictFirstAssessment {
  const majorIdentityConflict = input.identityConflicts.length > 0;
  const identityConfidence: EvidenceLevel = !input.identityKnown || majorIdentityConflict
    ? "Limited" : input.retailTrimUnknown ? "Moderate" : "High";
  const marketConfidence: EvidenceLevel = !input.pricingDecisionReady
    ? "Limited" : input.marketConfidence;
  const acquisitionConfidence: EvidenceLevel =
    !input.hasPurchasePrice || !input.hasSupportedSalePrice ||
    input.conditionStatus === "unreviewed" || input.conditionStatus === "unknown" ||
    input.materialConditionRisk || majorIdentityConflict
      ? "Limited" : input.retailTrimUnknown || input.reviewRequired ? "Moderate" : "High";
  const confidence: EvidenceLevel = (
    identityConfidence === "Limited" || marketConfidence === "Limited" || acquisitionConfidence === "Limited"
  ) ? "Limited" : (
    identityConfidence === "Moderate" || marketConfidence === "Moderate" || acquisitionConfidence === "Moderate"
  ) ? "Moderate" : "High";

  const opportunityDetected =
    input.hasPurchasePrice && input.indicativeMarketLow > 0 &&
    input.purchasePrice > 0 && input.purchasePrice < input.indicativeMarketLow * 0.65;
  const blockers = [
    majorIdentityConflict ? "Conflicting vehicle identity information" : null,
    input.retailTrimUnknown ? "Retail trim is not verified" : null,
    input.conditionStatus === "unknown" || input.conditionStatus === "unreviewed" ? "Condition is not verified" : null,
    input.materialConditionRisk ? "Material condition risk needs review" : null,
    !input.pricingDecisionReady ? "Retail resale valuation is not established" : null,
    !input.hasPurchasePrice ? "Purchase price is missing" : null,
  ].filter((value): value is string => Boolean(value));
  const action: NextAction =
    majorIdentityConflict || !input.identityKnown ? "identity"
    : input.retailTrimUnknown ? "trim"
    : input.conditionStatus === "unknown" || input.conditionStatus === "unreviewed" || input.materialConditionRisk ? "condition"
    : !input.pricingDecisionReady || input.selectedComps === 0 ? "market"
    : !input.hasPurchasePrice || !input.hasSupportedSalePrice ? "costs"
    : "review";
  const actions: Record<NextAction, [string,string]> = {
    identity: ["Verify vehicle identity", "Resolve disputed model, engine or drivetrain details before pricing."],
    trim: ["Confirm retail trim", "The correct trim is the most useful missing detail for accurate pricing."],
    condition: ["Review vehicle condition", "Confirm condition and repair exposure before relying on acquisition economics."],
    market: ["Review market comparisons", "Check available listings and improve the pricing evidence if warranted."],
    costs: ["Review acquisition costs", "Confirm price, fees and reserves before judging the deal."],
    review: ["Review deal economics", "Check the financial assumptions and supporting evidence before committing."],
  };
  const verdict: DealerVerdict =
    !input.identityKnown || !input.hasPurchasePrice || input.selectedComps === 0 && !input.hasSupportedSalePrice
      ? "Insufficient information"
      : input.pricingDecisionReady && input.hardPass
        ? "Pass"
        : input.pricingDecisionReady && !input.reviewRequired && !input.retailTrimUnknown &&
          input.conditionStatus !== "unknown" && !input.materialConditionRisk
          ? "Pursue"
          : "Investigate";
  const headline =
    verdict === "Pursue" ? "Worth pursuing"
    : verdict === "Pass" ? "Pass at these economics"
    : opportunityDetected ? "Potential opportunity — verify before bidding"
    : verdict === "Investigate" ? "Worth investigating"
    : "More evidence needed";
  const summary = opportunityDetected
    ? "The entered purchase price is substantially below comparable advertised prices. That spread is not a verified profit margin; confirm trim, title, condition and listing legitimacy."
    : verdict === "Pursue" ? "Available pricing and acquisition inputs support further pursuit. Review the underlying assumptions before committing."
    : verdict === "Pass" ? "The supported economics or identified risks do not justify the current acquisition."
    : verdict === "Investigate" ? "Market information is available, but material details still need verification before making a purchase decision."
    : "There is not enough reliable evidence to assess this acquisition yet.";
  return {
    verdict, confidence, identityConfidence, marketConfidence, acquisitionConfidence,
    action, actionLabel: actions[action][0], actionExplanation: actions[action][1],
    headline, summary, opportunityDetected, blockers,
  };
}
