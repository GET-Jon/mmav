export type DealerFitLabel =
  | "Excellent Fit"
  | "Good Fit"
  | "Selective Fit"
  | "Low Fit"
  | "Avoid";

export type DealerFitCategory =
  | "Easy Flip"
  | "Enthusiast Build"
  | "Specialty Retail"
  | "Commodity"
  | "Avoid";

export type DealerFitRuleType =
  | "positive"
  | "negative"
  | "known_platform"
  | "enthusiast_appeal"
  | "commodity_penalty"
  | "risk_penalty"
  | "context";

export type DealerFitRule = {
  id: string;
  type: DealerFitRuleType;
  points: number;
  reason: string;
  caution?: string;
  match: {
    makes?: string[];
    models?: string[];
    trims?: string[];
    bodyStyles?: string[];
    keywords?: string[];
    minYear?: number;
    maxYear?: number;
    minMileage?: number;
    maxMileage?: number;
  };
};

export type DealerFitVehicleInput = {
  year?: number | string | null;
  make?: string | null;
  model?: string | null;
  trim?: string | null;
  bodyClass?: string | null;
  fuelType?: string | null;
  driveType?: string | null;
  transmission?: string | null;
  mileage?: number | null;
  notes?: string | null;
};

export type DealerFitFinancialInput = {
  expectedGrossProfit?: number | null;
  targetProfit?: number | null;
  finalRetailTarget?: number | null;
  currentBid?: number | null;
  compConfidence?: string | null;
  includedCompCount?: number | null;
  riskGrade?: string | null;
  decision?: string | null;
};

export type DealerFitInput = {
  vehicle: DealerFitVehicleInput;
  financial?: DealerFitFinancialInput;
};

export type DealerFitResult = {
  score: number;
  label: DealerFitLabel;
  category: DealerFitCategory;
  generation?: string | null;
  reasons: string[];
  cautions: string[];
  matchedRules: string[];
};
