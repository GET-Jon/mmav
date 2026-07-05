export type AiProvider = "google" | "openai";

export type GenerateTextInput = {
  system: string;
  prompt: string;
  temperature?: number;
  maxOutputTokens?: number;
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

  selectedConditionRules?: string[];
  notes?: string | null;
};
