export type WorkPlanFindingInput = {
  id: string;
  source: string;
  title: string;
  description: string | null;
  category: string;
  severity: string | null;
  confidence: string | null;
  certainty: string | null;
  estimatedCostLow: number | null;
  estimatedCostHigh: number | null;
  estimatedDurationHours: number | null;
};

export type WorkPlanUpgradeInput = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  desiredOutcome: string | null;
  manufacturer: string | null;
  partNumber: string | null;
  estimatedPartsCost: number | null;
  estimatedLaborCost: number | null;
  estimatedTotalCost: number | null;
  notes: string | null;
};

export type PreliminaryWorkPlanInput = {
  vehicle: {
    year: number;
    make: string;
    model: string;
    trim: string | null;
    mileage: number | null;
  };
  intake: {
    visibleDamageSummary: string | null;
    initialObservations: string | null;
  };
  mechanicalInspectionSummary: string | null;
  findings: WorkPlanFindingInput[];
  upgrades: WorkPlanUpgradeInput[];
};

export type PreliminaryWorkPlanItem = {
  title: string;
  description: string | null;
  category: string;
  classification: "required" | "recommended" | "optional" | "upgrade" | "investigate";
  decision: "approved" | "declined" | "investigate" | "monitor";
  priority: "1" | "2" | "3";
  rationale: string;
  estimatedCostLow: number | null;
  estimatedCostHigh: number | null;
  planningAmount: number;
  estimatedDurationHours: number | null;
  confidence: number | null;
  assumptions: string[];
  managerInvestigationRequired: boolean;
  costSource: "known_quote" | "historical_actual" | "catalog_parts_cost" | "comparable_vehicle" | "ai_estimate" | "unknown";
  costSourceDetail: string | null;
  findingIds: string[];
  upgradeId: string | null;
};

export type PreliminaryWorkPlan = {
  summary: string;
  assumptions: string[];
  items: PreliminaryWorkPlanItem[];
};
