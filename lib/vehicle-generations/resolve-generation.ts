import { findMarketCheckModelAliases } from "@/lib/marketcheck/model-aliases";
import { vehicleGenerationRules } from "./rules";
import type { VehicleGenerationInput, VehicleGenerationMatch, VehicleGenerationRule } from "./types";

function normalize(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseYear(value: VehicleGenerationInput["year"]) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function modelMatches({
  rule,
  modelCandidates,
  fullText,
}: {
  rule: VehicleGenerationRule;
  modelCandidates: string[];
  fullText: string;
}) {
  const ruleModel = normalize(rule.model);

  return modelCandidates.some((candidate) => {
    const normalizedCandidate = normalize(candidate);

    if (!normalizedCandidate) {
      return false;
    }

    return (
      normalizedCandidate === ruleModel ||
      normalizedCandidate.includes(ruleModel) ||
      ruleModel.includes(normalizedCandidate) ||
      fullText.includes(ruleModel)
    );
  });
}

export function resolveVehicleGeneration(
  input: VehicleGenerationInput
): VehicleGenerationMatch | null {
  const year = parseYear(input.year);

  if (!year) {
    return null;
  }

  const make = normalize(input.make);
  const model = normalize(input.model);
  const fullText = normalize(
    [input.make, input.model, input.trim, input.bodyStyle, input.bodyClass, input.notes]
      .filter(Boolean)
      .join(" ")
  );

  if (!make || !model) {
    return null;
  }

  const aliasModels = findMarketCheckModelAliases({
    make: String(input.make || ""),
    model: String(input.model || ""),
  });

  const modelCandidates = [String(input.model || ""), ...aliasModels];

  const match = vehicleGenerationRules.find((rule) => {
    const ruleMake = normalize(rule.make);

    if (!(make === ruleMake || make.includes(ruleMake) || ruleMake.includes(make))) {
      return false;
    }

    if (year < rule.startYear || year > rule.endYear) {
      return false;
    }

    return modelMatches({ rule, modelCandidates, fullText });
  });

  if (!match) {
    return null;
  }

  return {
    ...match,
    reason: `Generation-aware comps limited to ${match.generation} ${match.model} years ${match.startYear}-${match.endYear}.`,
  };
}

export function isYearInVehicleGeneration({
  year,
  generation,
}: {
  year: number;
  generation: VehicleGenerationMatch | null;
}) {
  if (!generation) {
    return true;
  }

  return year >= generation.startYear && year <= generation.endYear;
}
