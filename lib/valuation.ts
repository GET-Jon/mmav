import type { Assumptions } from "@/types/assumptions";
import type {
  RiskGrade,
  ValuationInput,
  ValuationOutput,
} from "@/types/evaluation";

function roundToNearest(value: number, increment = 100) {
  return Math.round(value / increment) * increment;
}

export function calculateTotalCostAdders(input: ValuationInput) {
  const { costs } = input;

  return (
    costs.auctionFee +
    costs.transport +
    costs.recon +
    costs.detailAdmin +
    costs.generalRiskReserve +
    costs.brandRiskAdd +
    costs.titleHistoryRiskAdd +
    costs.conditionRiskAdd
  );
}

export function calculateRiskGrade(
  totalRiskPoints: number,
  hasAvoidFlag: boolean,
  assumptions: Assumptions
): RiskGrade {
  if (hasAvoidFlag || totalRiskPoints >= assumptions.bidSettings.avoidRiskThreshold) {
    return "High/Avoid";
  }

  if (totalRiskPoints >= assumptions.bidSettings.highRiskThreshold) {
    return "High";
  }

  if (totalRiskPoints >= assumptions.bidSettings.mediumRiskThreshold) {
    return "Medium";
  }

  return "Low";
}

export function calculateDecision({
  currentBid,
  safeBid,
  maxSmartBid,
  stretchBid,
  riskGrade,
}: {
  currentBid: number;
  safeBid: number;
  maxSmartBid: number;
  stretchBid: number;
  riskGrade: RiskGrade;
}) {
  if (riskGrade === "High/Avoid") {
    return "Pass";
  }

  if (currentBid <= safeBid) {
    return "Strong Buy";
  }

  if (currentBid <= maxSmartBid) {
    return "Bid If Clean";
  }

  if (currentBid <= stretchBid) {
    return "Watch / Stretch Only";
  }

  return "Pass";
}

export function calculateValuation(
  input: ValuationInput,
  assumptions: Assumptions
): ValuationOutput {
  const totalCostAdders = calculateTotalCostAdders(input);
  const allInCost = input.currentBid + totalCostAdders;
  const expectedGrossProfit = input.targetResaleUsed - allInCost;

  const riskGrade = calculateRiskGrade(
    input.totalRiskPoints,
    Boolean(input.hasAvoidFlag),
    assumptions
  );

  const highRiskProfitAdd =
    riskGrade === "High" || riskGrade === "High/Avoid"
      ? assumptions.bidSettings.highRiskProfitAdd
      : 0;

  const maxSmartBidRaw =
    input.targetResaleUsed -
    input.targetProfit -
    highRiskProfitAdd -
    totalCostAdders;

  const maxSmartBid = roundToNearest(maxSmartBidRaw);
  const safeBid = roundToNearest(
    maxSmartBid * (1 - assumptions.bidSettings.safeBidDiscount)
  );
  const stretchBid = roundToNearest(
    maxSmartBid * (1 + assumptions.bidSettings.stretchBidPremium)
  );

  const decision = calculateDecision({
    currentBid: input.currentBid,
    safeBid,
    maxSmartBid,
    stretchBid,
    riskGrade,
  });

  return {
    totalCostAdders,
    allInCost,
    expectedGrossProfit,
    maxSmartBid,
    safeBid,
    stretchBid,
    riskGrade,
    decision,
  };
}
