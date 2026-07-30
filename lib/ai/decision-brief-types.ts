import type {
  MindfulIntelligenceMatch,
  MindfulOpportunityType,
} from "@/lib/mindful-intelligence";

import type {
  DealerFitConfidence,
  DealerFitDimension,
  DealerFitDimensionKey,
} from "@/lib/dealer-fit/types-v8";

export type EvaluationRecommendation =
  | "bid"
  | "watch"
  | "pass"
  | "needs_verification";

export type EvaluationEvidenceBasis =
  | "vehicle_fact"
  | "market_data"
  | "calculation"
  | "company_rule"
  | "mindful_intelligence"
  | "operator_note"
  | "ai_inference";

export type EvaluationDecisionBriefInput = {
  vehicle: {
    title?: string | null;
    vin?: string | null;

    year?: number | null;
    make?: string | null;
    model?: string | null;
    trim?: string | null;

    generation?: string | null;
    chassisCode?: string | null;
    engine?: string | null;
    transmission?: string | null;
    drivetrain?: string | null;

    mileage?: number | null;
  };

  valuation: {
    currentBid?: number | null;
    finalRetailTarget?: number | null;
    safeBid?: number | null;
    maxSmartBid?: number | null;
    stretchBid?: number | null;
    expectedGrossProfit?: number | null;
    targetProfit?: number | null;

    riskGrade?: string | null;
    decision?: string | null;
  };

  market: {
    compConfidence?: string | null;
    includedCompCount?: number | null;
    totalCompCount?: number | null;
    marketCompAverage?: number | null;
    medianAdjusted?: number | null;
  };

  dealerFit: {
    score: number;
    label: string;
    confidence: DealerFitConfidence;

    primaryOpportunityType: MindfulOpportunityType;
    secondaryOpportunityTypes: MindfulOpportunityType[];

    dimensions: Partial<
      Record<DealerFitDimensionKey, DealerFitDimension>
    >;

    strengths: string[];
    limitations: string[];
  };

  mindfulIntelligence: {
    matches: MindfulIntelligenceMatch[];
  };

  condition: {
    selectedRules: string[];
  };

  operator: {
    notes?: string | null;
  };
};

export type EvaluationDecisionBrief = {
  recommendation: EvaluationRecommendation;
  recommendationLabel: string;

  opportunity: {
    primaryType: MindfulOpportunityType;
    secondaryTypes: MindfulOpportunityType[];
  };

  directRecommendation: string;
  whyMindfulShouldCare: string;

  marketRead: {
    summary: string;
    confidence: DealerFitConfidence;
  };

  dealerFitRead: {
    summary: string;
    strengths: string[];
    limitations: string[];
  };

  financialRead: {
    summary: string;
    bidDiscipline: string;
  };

  keyRisks: string[];
  knownModelConcerns: string[];
  verificationChecklist: string[];

  exitStrategy: {
    likelyBuyer: string;
    positioning: string;
    difficulty: "low" | "medium" | "high";
  };

  confidence: {
    level: DealerFitConfidence;
    missingInformation: string[];
  };

  evidenceNotes: Array<{
    statement: string;
    basis: EvaluationEvidenceBasis;
    sourceId?: string | null;
  }>;
};
