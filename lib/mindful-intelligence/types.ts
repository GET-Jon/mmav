export type MindfulIntelligenceStatus =
  | "draft"
  | "approved"
  | "archived";

export type MindfulIntelligenceScope =
  | "exact_vehicle"
  | "model"
  | "generation"
  | "powertrain"
  | "brand"
  | "modified_platform";

export type MindfulIntelligenceVerdict =
  | "strong_fit"
  | "good_fit"
  | "conditional_fit"
  | "member_match_only"
  | "high_risk"
  | "avoid"
  | "unrated";

export type MindfulIntelligenceConfidence =
  | "high"
  | "medium"
  | "low";

export type MindfulOpportunityType =
  | "easy_flip"
  | "enthusiast_buy"
  | "curated_driver"
  | "tasteful_build"
  | "modern_luxury_value"
  | "specialty_collector"
  | "utility_terrain"
  | "member_match"
  | "trade_facilitation"
  | "high_risk_opportunity"
  | "pass";

export type MindfulVehicleIdentity = {
  makes?: string[];
  models?: string[];

  yearStart?: number | null;
  yearEnd?: number | null;

  generations?: string[];
  chassisCodes?: string[];
  engines?: string[];
  transmissions?: string[];
  trims?: string[];
  drivetrains?: string[];

  bodyStyles?: string[];
  fuelTypes?: string[];

  keywords?: string[];
};

export type MindfulIntelligenceSource = {
  documentName: string;
  sectionTitle: string;

  sourceText?: string | null;
  sourceUrl?: string | null;

  sourceVersion?: string | null;
  lastReviewedAt?: string | null;
  reviewedBy?: string[];
};

export type MindfulIntelligenceEntry = {
  id: string;
  title: string;

  status: MindfulIntelligenceStatus;
  scope: MindfulIntelligenceScope;

  identity: MindfulVehicleIdentity;

  verdict: MindfulIntelligenceVerdict;
  confidence: MindfulIntelligenceConfidence;

  opportunityTypes: MindfulOpportunityType[];

  rationale: string;

  strengths: string[];
  limitations: string[];

  desirableSpecs: string[];
  avoidSpecs: string[];

  knownIssues: string[];
  verificationItems: string[];

  buyerProfile?: string | null;
  mileageNotes?: string | null;
  pricingNotes?: string | null;
  modificationNotes?: string | null;
  exitNotes?: string | null;

  source: MindfulIntelligenceSource;
};

export type MindfulIntelligenceMatchLevel =
  | "exact"
  | "generation"
  | "powertrain"
  | "model"
  | "brand"
  | "modified_platform";

export type MindfulIntelligenceMatch = {
  entryId: string;
  title: string;

  matchLevel: MindfulIntelligenceMatchLevel;
  matchScore: number;

  confidence: MindfulIntelligenceConfidence;
  verdict: MindfulIntelligenceVerdict;

  rationale: string;

  opportunityTypes: MindfulOpportunityType[];

  strengths: string[];
  limitations: string[];

  desirableSpecs: string[];
  avoidSpecs: string[];

  knownIssues: string[];
  verificationItems: string[];

  buyerProfile?: string | null;
  mileageNotes?: string | null;
  pricingNotes?: string | null;
  modificationNotes?: string | null;
  exitNotes?: string | null;

  source: MindfulIntelligenceSource;
};
