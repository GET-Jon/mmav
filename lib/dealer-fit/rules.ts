import type { DealerFitRule } from "./types";

export const mindfulDealerFitRules: DealerFitRule[] = [
  {
    id: "bmw-m-platform",
    type: "known_platform",
    points: 18,
    reason: "Known Mindful platform with strong enthusiast demand.",
    match: {
      makes: ["bmw"],
      models: ["m2", "m3", "m4", "m5", "m6", "m8"],
    },
  },
  {
    id: "bmw-enthusiast-core",
    type: "enthusiast_appeal",
    points: 12,
    reason: "BMW enthusiast platform with a clear buyer story if condition supports it.",
    match: {
      makes: ["bmw"],
      models: ["z3", "z4", "3 series", "5 series", "x5"],
      keywords: ["m sport", "manual", "coupe", "wagon", "diesel", "alpina"],
    },
  },
  {
    id: "porsche-core",
    type: "known_platform",
    points: 17,
    reason: "Porsche specialty inventory can fit well when spec, history, and spread are disciplined.",
    match: {
      makes: ["porsche"],
      models: ["911", "cayman", "boxster", "macan", "cayenne", "panamera"],
    },
  },
  {
    id: "mercedes-specialty",
    type: "enthusiast_appeal",
    points: 14,
    reason: "Mercedes specialty product can work well with the right spec, story, and condition.",
    match: {
      makes: ["mercedes-benz", "mercedes"],
      keywords: ["amg", "g 550", "g550", "g-class", "sl", "sec", "coupe", "wagon", "convertible"],
    },
  },
  {
    id: "alfa-enthusiast",
    type: "enthusiast_appeal",
    points: 10,
    reason: "Alfa has enthusiast appeal, but needs extra discipline around reliability, records, and buyer depth.",
    caution: "Verify service history, warning lights, electrical behavior, and local buyer appetite.",
    match: {
      makes: ["alfa romeo", "alfa"],
      models: ["giulia", "stelvio"],
    },
  },
  {
    id: "land-rover-story-dependent",
    type: "risk_penalty",
    points: 4,
    reason: "Land Rover/Range Rover can be specialty retail, but only with enough spread and a strong story.",
    caution: "Treat deferred maintenance, air suspension, cooling, electrical, and drivetrain unknowns as thesis-breakers.",
    match: {
      makes: ["land rover", "range rover"],
    },
  },
  {
    id: "interesting-body-style",
    type: "positive",
    points: 9,
    reason: "Body style gives the car a more interesting retail angle than commodity inventory.",
    match: {
      bodyStyles: ["coupe", "convertible", "wagon", "roadster"],
    },
  },
  {
    id: "manual-transmission",
    type: "enthusiast_appeal",
    points: 8,
    reason: "Manual transmission improves enthusiast appeal and buyer specificity.",
    match: {
      keywords: ["manual", "6-speed", "stick"],
    },
  },
  {
    id: "commodity-suv-penalty",
    type: "commodity_penalty",
    points: -12,
    reason: "Mainstream SUV/crossover profile is more commodity than curated unless bought extremely well.",
    caution: "Needs a clear price advantage, unusually good spec, or very clean condition to justify inventory space.",
    match: {
      bodyStyles: ["suv", "sport utility", "crossover"],
      keywords: ["base", "standard"],
    },
  },
  {
    id: "commodity-sedan-penalty",
    type: "commodity_penalty",
    points: -8,
    reason: "Common sedan profile may lack a strong Mindful retail angle without spec, condition, or price advantage.",
    match: {
      bodyStyles: ["sedan"],
      keywords: ["base", "standard"],
    },
  },
  {
    id: "high-mileage-specialty-risk",
    type: "risk_penalty",
    points: -10,
    reason: "Higher mileage raises recon and buyer-confidence risk.",
    caution: "Needs maintenance documentation and enough spread to absorb surprises.",
    match: {
      minMileage: 125000,
    },
  },
  {
    id: "very-high-mileage-risk",
    type: "risk_penalty",
    points: -16,
    reason: "Very high mileage makes the deal story harder unless the platform is exceptional and records are strong.",
    caution: "Do not let enthusiast appeal override mechanical and resale discipline.",
    match: {
      minMileage: 175000,
    },
  },
  {
    id: "modern-luxury-complexity",
    type: "risk_penalty",
    points: -7,
    reason: "Modern luxury complexity can compress margin if electronics, suspension, or drivetrain issues appear.",
    caution: "Verify scan results, options, suspension behavior, infotainment, and service history before bidding.",
    match: {
      makes: ["bmw", "mercedes-benz", "mercedes", "audi", "porsche", "land rover", "range rover", "alfa romeo"],
      minYear: 2016,
    },
  },
];

export const mindfulPreferredMakes = [
  "bmw",
  "porsche",
  "mercedes-benz",
  "mercedes",
  "alfa romeo",
  "alfa",
  "land rover",
  "range rover",
  "cadillac",
];

export const mindfulAvoidCommodityMakes = [
  "nissan",
  "chevrolet",
  "ford",
  "hyundai",
  "kia",
  "mitsubishi",
  "chrysler",
  "dodge",
];
