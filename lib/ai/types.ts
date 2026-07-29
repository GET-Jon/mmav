export type AiProvider = "google" | "openai";

export type EvaluationThesisMode = "financial" | "enthusiast" | "balanced";

export type GenerateTextInput = {
  system: string;
  prompt: string;
  temperature?: number;
  maxOutputTokens?: number;
  responseMimeType?: "text/plain" | "application/json";
};

export type GenerateTextResult = {
  text: string;
  provider: AiProvider;
  model: string;
};

export type AiTextClient = {
  generateText(input: GenerateTextInput): Promise<GenerateTextResult>;
};

export type EvaluationSummaryInput = {
  thesisMode?: EvaluationThesisMode;
  vehicleTitle?: string | null;
  vin?: string | null;
  mileage?: number | null;
  auctionSite?: string | null;
  currentBid?: number | null;

  marketCompAverage?: number | null;
  medianAdjusted?: number | null;
  finalRetailTarget?: number | null;
  safeBid?: number | null;
  maxSmartBid?: number | null;
  stretchBid?: number | null;
  expectedGrossProfit?: number | null;

  riskGrade?: string | null;
  decision?: string | null;
  compConfidence?: string | null;
  includedCompCount?: number | null;
  totalCompCount?: number | null;

  dealerFitScore?: number | null;
  dealerFitLabel?: string | null;
  dealerFitCategory?: string | null;
  dealerFitGeneration?: string | null;
  dealerFitReasons?: string[];
  dealerFitCautions?: string[];

  mindfulIntelligenceMatched?: boolean;
  mindfulIntelligenceTitle?: string | null;
  mindfulIntelligenceMatchLevel?: string | null;
  mindfulIntelligenceConfidence?: string | null;
  mindfulIntelligenceVerdict?: string | null;
  mindfulIntelligenceRationale?: string | null;
  mindfulIntelligenceOpportunityTypes?: string[];
  mindfulIntelligenceStrengths?: string[];
  mindfulIntelligenceLimitations?: string[];
  mindfulIntelligenceKnownIssues?: string[];
  mindfulIntelligenceVerificationItems?: string[];
  mindfulIntelligenceSourceSection?: string | null;

  selectedConditionRules?: string[];
  notes?: string | null;
};

export type {
  EvaluationDecisionBrief,
  EvaluationDecisionBriefInput,
  EvaluationEvidenceBasis,
  EvaluationRecommendation,
} from "./decision-brief-types";
