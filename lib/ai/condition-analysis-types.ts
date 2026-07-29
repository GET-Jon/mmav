export type ConditionIssueCategory =
  | "mechanical"
  | "cosmetic"
  | "wear"
  | "history"
  | "structural"
  | "title"
  | "transportation"
  | "inspection"
  | "other";

export type ConditionIssueSeverity = "minor" | "moderate" | "severe";

export type ConditionIssueCertainty =
  "confirmed" | "suspected" | "inspection_required";

export type ConditionConfidence = "low" | "medium" | "high";

export type ConditionOverallRisk = "low" | "moderate" | "elevated" | "high";

export type ConditionAnalysisVehicle = {
  year?: string | null;
  make?: string | null;
  model?: string | null;
  trim?: string | null;
  mileage?: number | null;
  vin?: string | null;
  location?: string | null;
};

export type ConditionAnalysisInput = {
  vehicle: ConditionAnalysisVehicle;
  auctionSite?: string | null;
  sourceType?: string | null;
  rawIssueText: string;
};

export type ConditionAnalysisIssue = {
  id: string;
  description: string;
  category: ConditionIssueCategory;
  severity: ConditionIssueSeverity;
  certainty: ConditionIssueCertainty;
  estimatedCostLow: number;
  estimatedCostHigh: number;
  planningEstimate: number;
  estimatedDurationDays: number;
  includeInValuation: boolean;
  assumptions: string[];
  confidence: ConditionConfidence;
  sourceText: string;
};

export type ConditionAnalysis = {
  summary: string;
  overallRisk: ConditionOverallRisk;
  estimatedCostLow: number;
  estimatedCostHigh: number;
  planningEstimate: number;
  estimatedReadyDaysLow: number;
  estimatedReadyDaysHigh: number;
  issues: ConditionAnalysisIssue[];
  recommendedInspections: string[];
  missingInformation: string[];
  warnings: string[];
};
