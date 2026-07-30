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

  marketCheckDetails?: {
    vin?: string | null;
    heading?: string | null;
    listingUrl?: string | null;
    sellerType?: string | null;
    dealerName?: string | null;
    dealerPhone?: string | null;
    dealerWebsite?: string | null;
    city?: string | null;
    state?: string | null;
    zip?: string | null;
    exteriorColor?: string | null;
    interiorColor?: string | null;
    bodyType?: string | null;
    drivetrain?: string | null;
    transmission?: string | null;
    fuelType?: string | null;
    engine?: string | null;
    doors?: number | null;
    cylinders?: number | null;
    listingDate?: string | null;
    lastSeenDate?: string | null;
    raw?: Record<string, unknown>;
  };
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
