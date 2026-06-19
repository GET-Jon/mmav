export type MarketComp = {
  id: string;
  included: boolean;
  source: string;
  distance: number;
  year: number;
  model: string;
  trim: string;
  mileage: number;
  askingPrice: number;
  qualityScore: number;
};

export type CompConfidence = "Low" | "Medium" | "High";

export type CompSummary = {
  includedCount: number;
  lowAdjusted: number;
  medianAdjusted: number;
  highAdjusted: number;
  averageAdjusted: number;
  fastSaleTarget: number;
  confidence: CompConfidence;
};
