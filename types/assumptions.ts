export type BidSettings = {
  safeBidDiscount: number;
  stretchBidPremium: number;
  minimumTargetProfit: number;
  highRiskProfitAdd: number;
  mediumRiskThreshold: number;
  highRiskThreshold: number;
  avoidRiskThreshold: number;
};

export type CostDefault = {
  vehicleType: string;
  auctionFee: number;
  transport: number;
  recon: number;
  detailAdmin: number;
  riskReserve: number;
  targetProfit: number;
};

export type ConditionRule = {
  category: string;
  name: string;
  riskPoints: number;
  reserveAdd: number;
  avoidFlag: boolean;
};

export type AuctionFeeRule = {
  auctionSite: string;
  minBid: number;
  maxBid: number;
  fee: number;
};

export type SourceDiscount = {
  source: string;
  askDiscount: number;
};

export type RegionalMarket = {
  market: string;
  zip: string;
  order: number;
  enabled: boolean;
};

export type VehicleClassificationMatchType =
  | "make"
  | "model"
  | "trim"
  | "body"
  | "fuel"
  | "ageMileage";

export type VehicleClassificationRule = {
  name: string;
  matchType: VehicleClassificationMatchType;
  matchValues: string[];
  costProfile: string;
  priority: number;
  enabled: boolean;
};

export type CompSettings = {
  mileageAdjustmentPerThousand: number;
  fastSaleDiscount: number;
  minimumQualityScore: number;
  minimumCompsForMediumConfidence: number;
  minimumCompsForHighConfidence: number;
  maxSpreadForHighConfidence: number;
  sourceDiscounts: SourceDiscount[];
};

export type Assumptions = {
  bidSettings: BidSettings;
  costDefaults: CostDefault[];
  conditionRules: ConditionRule[];
  auctionFeeRules: AuctionFeeRule[];
  compSettings: CompSettings;
  regionalMarkets: RegionalMarket[];
  vehicleClassificationRules?: VehicleClassificationRule[];
};
