import { findDealerFitGenerationMatch } from "./generation-rules";
import {
  mindfulAvoidCommodityMakes,
  mindfulDealerFitRules,
  mindfulPreferredMakes,
} from "./rules";
import type {
  DealerFitCategory,
  DealerFitInput,
  DealerFitLabel,
  DealerFitResult,
  DealerFitRule,
  DealerFitVehicleInput,
} from "./types";

function normalize(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function includesAny(haystack: string, needles?: string[]) {
  if (!needles?.length) {
    return true;
  }

  return needles.some((needle) => haystack.includes(normalize(needle)));
}

function parseYear(value: DealerFitVehicleInput["year"]) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function getVehicleText(vehicle: DealerFitVehicleInput) {
  return normalize(
    [
      vehicle.year,
      vehicle.make,
      vehicle.model,
      vehicle.trim,
      vehicle.bodyClass,
      vehicle.fuelType,
      vehicle.driveType,
      vehicle.transmission,
      vehicle.notes,
    ]
      .filter(Boolean)
      .join(" ")
  );
}

function ruleMatches(rule: DealerFitRule, vehicle: DealerFitVehicleInput) {
  const year = parseYear(vehicle.year);
  const mileage =
    typeof vehicle.mileage === "number" && Number.isFinite(vehicle.mileage)
      ? vehicle.mileage
      : null;

  if (rule.match.minYear && (!year || year < rule.match.minYear)) {
    return false;
  }

  if (rule.match.maxYear && (!year || year > rule.match.maxYear)) {
    return false;
  }

  if (rule.match.minMileage && (!mileage || mileage < rule.match.minMileage)) {
    return false;
  }

  if (rule.match.maxMileage && (!mileage || mileage > rule.match.maxMileage)) {
    return false;
  }

  const make = normalize(vehicle.make);
  const model = normalize(vehicle.model);
  const trim = normalize(vehicle.trim);
  const bodyClass = normalize(vehicle.bodyClass);
  const vehicleText = getVehicleText(vehicle);

  return (
    includesAny(make, rule.match.makes) &&
    includesAny(model, rule.match.models) &&
    includesAny(trim, rule.match.trims) &&
    includesAny(bodyClass, rule.match.bodyStyles) &&
    includesAny(vehicleText, rule.match.keywords)
  );
}

function clampScore(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function getLabel(score: number): DealerFitLabel {
  if (score >= 86) {
    return "Excellent Fit";
  }

  if (score >= 72) {
    return "Good Fit";
  }

  if (score >= 55) {
    return "Selective Fit";
  }

  if (score >= 40) {
    return "Low Fit";
  }

  return "Avoid";
}

function getCategory({
  score,
  vehicle,
  expectedGrossProfit,
  targetProfit,
  matchedRuleIds,
  categoryHint,
}: {
  score: number;
  vehicle: DealerFitVehicleInput;
  expectedGrossProfit?: number | null;
  targetProfit?: number | null;
  matchedRuleIds: string[];
  categoryHint?: DealerFitCategory | null;
}): DealerFitCategory {
  if (score < 40) {
    return "Avoid";
  }

  if (categoryHint && categoryHint !== "Avoid") {
    return categoryHint;
  }

  const vehicleText = getVehicleText(vehicle);
  const strongEconomics =
    typeof expectedGrossProfit === "number" &&
    typeof targetProfit === "number" &&
    targetProfit > 0 &&
    expectedGrossProfit >= targetProfit;

  const enthusiastSignals =
    matchedRuleIds.some((id) =>
      [
        "bmw-m-platform",
        "bmw-enthusiast-core",
        "porsche-core",
        "mercedes-specialty",
        "alfa-enthusiast",
        "interesting-body-style",
        "manual-transmission",
      ].includes(id)
    ) ||
    vehicleText.includes("amg") ||
    vehicleText.includes("manual") ||
    vehicleText.includes("convertible") ||
    vehicleText.includes("coupe");

  if (enthusiastSignals && score >= 72) {
    return "Enthusiast Build";
  }

  if (strongEconomics && score >= 55) {
    return "Easy Flip";
  }

  if (score >= 55 && enthusiastSignals) {
    return "Specialty Retail";
  }

  if (score >= 55) {
    return "Commodity";
  }

  return "Avoid";
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

export function calculateDealerFit(input: DealerFitInput): DealerFitResult {
  const vehicle = input.vehicle || {};
  const financial = input.financial || {};
  const vehicleText = getVehicleText(vehicle);
  const make = normalize(vehicle.make);

  let score = 50;
  const reasons: string[] = [];
  const cautions: string[] = [];
  const matchedRules: string[] = [];

  const hasPreferredMake = mindfulPreferredMakes.some((preferredMake) =>
    make.includes(preferredMake)
  );

  if (hasPreferredMake) {
    score += 8;
    matchedRules.push("preferred-make");
  }

  if (mindfulAvoidCommodityMakes.some((commodityMake) => make.includes(commodityMake))) {
    score -= 8;
    reasons.push("Make is more likely to behave like commodity inventory unless the deal is unusually strong.");
    cautions.push("Do not buy this only because it is cheap; require a clear resale angle.");
    matchedRules.push("commodity-make");
  }

  const generationMatch = findDealerFitGenerationMatch(vehicle);

  if (generationMatch) {
    score += generationMatch.points;
    reasons.push(generationMatch.reason);
    matchedRules.push(generationMatch.id);

    if (generationMatch.caution) {
      cautions.push(generationMatch.caution);
    }
  }

  for (const rule of mindfulDealerFitRules) {
    if (!ruleMatches(rule, vehicle)) {
      continue;
    }

    score += rule.points;
    reasons.push(rule.reason);
    matchedRules.push(rule.id);

    if (rule.caution) {
      cautions.push(rule.caution);
    }
  }

  const expectedGrossProfit = financial.expectedGrossProfit;
  const targetProfit = financial.targetProfit;

  if (
    typeof expectedGrossProfit === "number" &&
    typeof targetProfit === "number" &&
    targetProfit > 0
  ) {
    if (expectedGrossProfit >= targetProfit * 1.25) {
      score += 7;
      reasons.push("Projected spread supports the fit thesis.");
      matchedRules.push("strong-spread");
    } else if (expectedGrossProfit >= targetProfit) {
      score += 4;
      reasons.push("Projected spread is acceptable if the condition check stays clean.");
      matchedRules.push("acceptable-spread");
    } else if (expectedGrossProfit <= 0) {
      score -= 16;
      reasons.push("Economics do not currently support taking inventory risk.");
      cautions.push("Pass unless the bid drops materially or the retail target is re-supported.");
      matchedRules.push("negative-spread");
    } else {
      score -= 7;
      reasons.push("Projected spread is thin relative to target profit.");
      cautions.push("Needs bid discipline; do not stretch for fit alone.");
      matchedRules.push("thin-spread");
    }
  }

  if (hasPreferredMake && !generationMatch) {
    reasons.push("Make aligns with Mindful's preferred specialty/enthusiast inventory set.");
  }

  if (financial.compConfidence === "Low") {
    score -= 6;
    cautions.push("Low comp confidence means the fit score should not override market uncertainty.");
    matchedRules.push("low-comp-confidence");
  }

  if (financial.riskGrade && normalize(financial.riskGrade).includes("avoid")) {
    score -= 12;
    cautions.push("Risk grade is already in avoid territory; fit should be treated as secondary.");
    matchedRules.push("avoid-risk-grade");
  }

  if (!vehicleText) {
    score = 50;
    reasons.push("Vehicle details are still limited, so fit is only a neutral placeholder.");
    cautions.push("Decode VIN or enter make/model/trim before relying on dealer fit.");
    matchedRules.push("limited-vehicle-data");
  }

  const finalScore = clampScore(score);
  const label = getLabel(finalScore);
  const category = getCategory({
    score: finalScore,
    vehicle,
    expectedGrossProfit,
    targetProfit,
    matchedRuleIds: matchedRules,
    categoryHint: generationMatch?.categoryHint || null,
  });

  return {
    score: finalScore,
    label,
    category,
    generation: generationMatch?.generation || null,
    reasons: unique(reasons).slice(0, 5),
    cautions: unique(cautions).slice(0, 5),
    matchedRules: unique(matchedRules),
  };
}
