export type WorkPlanPartSuggestionInput = {
  description: string;
  quantity: number;
  partNumber: string | null;
  notes: string | null;
};

export type WorkPlanFindingInput = {
  id: string;
  source: string;
  title: string;
  description: string | null;
  category: string;
  severity: string | null;
  confidence: string | null;
  certainty: string | null;
  mechanicalValidationStatus: "pending" | "confirmed" | "changed" | "needs_diagnosis";
  mechanicalValidationNotes: string | null;
  mechanicalRecommendedAction: string | null;
  mechanicalCanPerform: boolean | null;
  mechanicalLaborHours: number | null;
  mechanicalProposedLaborPrice: number | null;
  mechanicalSuggestedParts: WorkPlanPartSuggestionInput[];
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
  mechanicalValidationStatus: "pending" | "feasible" | "feasible_with_changes" | "not_recommended" | "needs_info";
  mechanicalValidationNotes: string | null;
  mechanicalRecommendedAction: string | null;
  mechanicalCanPerform: boolean | null;
  mechanicalLaborHours: number | null;
  mechanicalProposedLaborPrice: number | null;
  mechanicalSuggestedParts: WorkPlanPartSuggestionInput[];
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
  /** Legacy ambiguous duration retained only for compatibility with older generated plans. */
  estimatedDurationHours: number | null;
  /** Hands-on technician/vendor time. Used for labor capacity, not calendar blocking. */
  estimatedLaborHours: number | null;
  /** Elapsed turnaround from task start until task-ready completion. Used for scheduling. */
  estimatedElapsedHours: number | null;
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
