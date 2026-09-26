import type { Assumptions } from "@/types/assumptions";
import type {
  RiskGrade,
  ValuationInput,
  ValuationOutput,
} from "@/types/evaluation";

function roundToNearest(value: number, increment = 100) {
  return Math.round(value / increment) * increment;
}

const AUTO_PROFIT_FLOOR = 2500;
const AUTO_PROFIT_RATE = 0.2;

function interpolateScore(
  value: number,
  points: Array<[number, number]>,
) {
  if (value <= points[0][0]) return points[0][1];

  for (let index = 1; index < points.length; index += 1) {
    const [upperValue, upperScore] = points[index];
    const [lowerValue, lowerScore] = points[index - 1];

    if (value <= upperValue) {
      const span = upperValue - lowerValue || 1;
      const progress = (value - lowerValue) / span;
      return lowerScore + (upperScore - lowerScore) * progress;
    }
  }

  return points[points.length - 1][1];
}

export function calculateDealEconomicsScore(
  expectedGrossProfit: number,
  allInCost: number,
) {
  const absoluteProfitScore = interpolateScore(expectedGrossProfit, [
    [0, 20],
    [500, 35],
    [1000, 48],
    [1500, 60],
    [2000, 70],
    [2500, 77],
    [3000, 82],
    [4000, 89],
    [5000, 95],
    [6000, 98],
    [7000, 100],
  ]);

  const returnOnCapital =
    allInCost > 0 ? expectedGrossProfit / allInCost : 0;
  const capitalEfficiencyScore = interpolateScore(returnOnCapital, [
    [0, 20],
    [0.05, 40],
    [0.1, 60],
    [0.15, 75],
    [0.2, 88],
    [0.25, 95],
    [0.3, 100],
  ]);

  return Math.max(0, Math.min(100, Math.round(
    absoluteProfitScore * 0.85 + capitalEfficiencyScore * 0.15,
  )));
}

function calculatePreReconFixedCosts(input: ValuationInput) {
  return (
    input.costs.auctionFee +
    input.costs.transport +
    input.costs.detailAdmin +
    input.costs.generalRiskReserve +
    input.costs.brandRiskAdd
  );
}

export function calculateDesiredProfitTarget(
  input: ValuationInput,
  totalCostAdders = calculateTotalCostAdders(input),
) {
  const manualFloor = Math.max(0, input.targetProfit || 0);
  const preReconFixedCosts = calculatePreReconFixedCosts(input);
  let desiredProfit = Math.max(AUTO_PROFIT_FLOOR, manualFloor);

  // Solve the 20% target against the recommended acquisition basis itself,
  // rather than the current live bid. This keeps Max Buy stable as bidding moves.
  for (let iteration = 0; iteration < 12; iteration += 1) {
    const impliedMaxBid = Math.max(
      0,
      input.targetResaleUsed - totalCostAdders - desiredProfit,
    );
    const preReconAcquisitionBasis = impliedMaxBid + preReconFixedCosts;
    const automaticTarget = Math.max(
      AUTO_PROFIT_FLOOR,
      preReconAcquisitionBasis * AUTO_PROFIT_RATE,
    );
    const nextDesiredProfit = Math.max(manualFloor, automaticTarget);

    if (Math.abs(nextDesiredProfit - desiredProfit) < 1) {
      desiredProfit = nextDesiredProfit;
      break;
    }

    desiredProfit = nextDesiredProfit;
  }

  return roundToNearest(desiredProfit);
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
  assumptions: Assumptions,
): RiskGrade {
  if (
    hasAvoidFlag ||
    totalRiskPoints >= assumptions.bidSettings.avoidRiskThreshold
  ) {
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
  assumptions: Assumptions,
): ValuationOutput {
  const totalCostAdders = calculateTotalCostAdders(input);
  const allInCost = input.currentBid + totalCostAdders;
  const expectedGrossProfit = input.targetResaleUsed - allInCost;

  const riskGrade = calculateRiskGrade(
    input.totalRiskPoints,
    Boolean(input.hasAvoidFlag),
    assumptions,
  );

  // Dynamic desired-profit ceiling:
  // - never less than $2,500
  // - scales to roughly 20% of the pre-recon acquisition basis
  // - a user-entered target can raise, but never lower, the system target.
  const desiredProfitTarget = calculateDesiredProfitTarget(
    input,
    totalCostAdders,
  );
  const maxSmartBidRaw =
    input.targetResaleUsed - desiredProfitTarget - totalCostAdders;

  const maxSmartBid = roundToNearest(maxSmartBidRaw);

  // Retain these fields temporarily for UI/type compatibility.
  // They no longer introduce separate hidden bid cushions.
  const safeBid = maxSmartBid;
  const stretchBid = maxSmartBid;

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
    desiredProfitTarget,
    maxSmartBid,
    safeBid,
    stretchBid,
    riskGrade,
    decision,
  };
}
