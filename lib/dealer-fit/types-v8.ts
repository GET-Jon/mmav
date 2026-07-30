import type {
  MindfulIntelligenceMatch,
  MindfulOpportunityType,
} from "@/lib/mindful-intelligence";

export type DealerFitConfidence =
  | "high"
  | "medium"
  | "low";

export type DealerFitDimensionKey =
  | "brandAlignment"
  | "buyerAppeal"
  | "marketability"
  | "marginSuitability"
  | "differentiation"
  | "operationalBurden"
  | "knowledgeConfidence"
  | "exitConfidence";

export type DealerFitDimension = {
  key: DealerFitDimensionKey;
  label: string;

  score: number;
  confidence: DealerFitConfidence;

  reasons: string[];
  cautions: string[];
};

export type DealerFitEvidenceSource =
  | "base_rule"
  | "generation_rule"
  | "mindful_intelligence"
  | "financial"
  | "market"
  | "condition"
  | "risk"
  | "operator_input";

export type DealerFitEvidence = {
  id: string;

  source: DealerFitEvidenceSource;
  sourceId?: string | null;

  dimensions: DealerFitDimensionKey[];

  points?: number | null;

  reason: string;
  caution?: string | null;

  confidence: DealerFitConfidence;
};

export type DealerFitResultV8 = {
  score: number;
  label: string;
  confidence: DealerFitConfidence;

  primaryOpportunityType: MindfulOpportunityType;
  secondaryOpportunityTypes: MindfulOpportunityType[];

  dimensions: Record<DealerFitDimensionKey, DealerFitDimension>;

  mindfulIntelligence: {
    matched: boolean;
    primaryMatch?: MindfulIntelligenceMatch | null;
    matches: MindfulIntelligenceMatch[];
  };

  strengths: string[];
  limitations: string[];
  improvementConditions: string[];
  verificationItems: string[];

  evidence: DealerFitEvidence[];
};
