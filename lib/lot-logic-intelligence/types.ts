export type IntelligenceAssertionStatus =
  | "active"
  | "pending_validation"
  | "validated"
  | "refuted"
  | "superseded"
  | "archived";

export type IntelligenceInsightStatus =
  | "pending"
  | "validated"
  | "refuted"
  | "keep_observing"
  | "superseded"
  | "archived";

export type PredictionType =
  | "finding"
  | "work_cost"
  | "work_duration"
  | "partner"
  | "related_issue"
  | "ready_date"
  | "recon_total"
  | "bid"
  | "other";

export type DecisionType =
  | "partner_assignment"
  | "plan_item_acceptance"
  | "plan_item_decline"
  | "cost_override"
  | "duration_override"
  | "bid_override"
  | "priority_override"
  | "vehicle_exit"
  | "upgrade_decision"
  | "policy_validation"
  | "insight_validation"
  | "other";

export type PredictionInput = {
  companyId: string;
  predictionType: PredictionType;
  subjectKey: string;
  evaluationId?: string | null;
  vehicleId?: string | null;
  findingId?: string | null;
  planItemId?: string | null;
  workOrderId?: string | null;
  predictedCostLow?: number | null;
  predictedCostHigh?: number | null;
  predictedLaborMinutes?: number | null;
  predictedElapsedMinutes?: number | null;
  predictedPartnerId?: string | null;
  predictedValue?: Record<string, unknown>;
  confidence?: number | null;
  modelProvider?: string | null;
  modelName?: string | null;
  promptVersion?: string | null;
  contextSnapshot?: Record<string, unknown>;
  createdBy?: string | null;
};

export type DecisionEventInput = {
  companyId: string;
  decisionType: DecisionType;
  evaluationId?: string | null;
  vehicleId?: string | null;
  workOrderId?: string | null;
  planItemId?: string | null;
  aiRecommendation?: Record<string, unknown>;
  humanDecision?: Record<string, unknown>;
  humanReason?: string | null;
  actorUserId?: string | null;
};

export type PredictionOutcomeInput = {
  companyId: string;
  predictionSnapshotId: string;
  partnerEstimateId?: string | null;
  actualPartnerId?: string | null;
  actualCost?: number | null;
  actualLaborMinutes?: number | null;
  actualElapsedMinutes?: number | null;
  qcPassed?: boolean | null;
  outcomeValue?: Record<string, unknown>;
  variance?: Record<string, unknown>;
};

export type BlindEstimateInput = {
  companyId: string;
  workOrderId: string;
  partnerId: string;
  quotedCost?: number | null;
  estimatedLaborMinutes?: number | null;
  estimatedElapsedMinutes?: number | null;
  notes?: string | null;
  submittedByUserId?: string | null;
};

export type InsightReviewAction = "validated" | "refuted" | "keep_observing";
