export type EvaluationCosts = {
  auctionFee: number;
  transport: number;
  recon: number;
  detailAdmin: number;
  generalRiskReserve: number;
  brandRiskAdd: number;
  titleHistoryRiskAdd: number;
  conditionRiskAdd: number;
};

export type RiskGrade = "Low" | "Medium" | "High" | "High/Avoid";

export type Decision =
  | "Strong Buy"
  | "Bid If Clean"
  | "Watch / Stretch Only"
  | "Pass";

export type ValuationInput = {
  currentBid: number;
  targetResaleUsed: number;
  targetProfit: number;
  totalRiskPoints: number;
  hasAvoidFlag?: boolean;
  costs: EvaluationCosts;
};

export type ValuationOutput = {
  totalCostAdders: number;
  allInCost: number;
  expectedGrossProfit: number;
  maxSmartBid: number;
  safeBid: number;
  stretchBid: number;
  riskGrade: RiskGrade;
  decision: Decision;
};
