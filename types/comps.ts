export type MarketComp = {
  id: string;
  included: boolean;
  source: string;
  region?: string;
  regionZip?: string;
  distance: number;
  year: number;
  model: string;
  trim: string;
  mileage: number;
  askingPrice: number;
  qualityScore: number;
  imageUrl?: string | null;
  dealerDays?: number | null;
  marketDays?: number | null;
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
  averageDealerDays: number;
  averageMarketDays: number;
  marketSpeedSignal: "Unknown" | "Fast" | "Normal" | "Slow" | "Very Slow";
};
