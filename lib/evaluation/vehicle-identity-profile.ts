import type { VinDecodeResult } from "@/types/vin";
import {
  canonicalBodyClass,
  canonicalDrivetrain,
  canonicalFuelType,
  canonicalModelFamily,
  canonicalVehicleMake,
  normalizeVehicleText,
} from "@/lib/marketcheck/vehicle-identity";
import { findMarketCheckModelAliases } from "@/lib/marketcheck/model-aliases";
import { findModelTaxonomyFallback } from "@/lib/marketcheck/model-taxonomy";
import { findGenerationCompRule } from "@/lib/marketcheck/generation-comps";

export type VehicleComparisonTier = "direct" | "near" | "supporting";

export type VehicleComparisonStep = {
  tier: VehicleComparisonTier;
  label: string;
  criteria: string;
  requiresConfirmation: boolean;
};

export type VehicleIdentityProfile = {
  version: "v1";
  source: "rules" | "ai-assisted";
  status: "ready" | "partial";
  displayName: string;
  year: number | null;
  make: string;
  modelFamily: string;
  bodyClass: string | null;
  variant: string;
  drivetrain: string | null;
  fuelType: string;
  generation: string | null;
  generationStartYear: number | null;
  generationEndYear: number | null;
  providerAliases: string[];
  hardExclusions: string[];
  comparisonLadder: VehicleComparisonStep[];
  notes: string[];
};

function unique(values: Array<string | null | undefined>, limit = 8) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const raw of values) {
    const value = String(raw || "").trim();
    const key = normalizeVehicleText(value);

    if (!value || !key || seen.has(key)) continue;
    seen.add(key);
    result.push(value);
    if (result.length >= limit) break;
  }

  return result;
}

function prettyMake(value: string) {
  if (value === "mercedes benz") return "Mercedes-Benz";
  if (value === "bmw") return "BMW";
  if (value === "gmc") return "GMC";
  if (value === "volkswagen") return "Volkswagen";
  return value
    .split(" ")
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(" ");
}

function describeDirectCriteria(decoded: VinDecodeResult, modelFamily: string) {
  const pieces = [
    decoded.year || null,
    prettyMake(canonicalVehicleMake(decoded.make)),
    decoded.trim || decoded.model || modelFamily,
    canonicalBodyClass({
      year: Number(decoded.year) || 0,
      make: decoded.make,
      model: decoded.model,
      trim: decoded.trim,
      bodyType: decoded.bodyClass,
      drivetrain: decoded.driveType,
      fuelType: decoded.fuelType,
    }) || null,
    canonicalDrivetrain(decoded.driveType) || null,
  ].filter(Boolean);

  return pieces.join(" · ");
}

export function buildDeterministicVehicleIdentityProfile(
  decoded: VinDecodeResult,
): VehicleIdentityProfile {
  const year = Number(decoded.year) || null;
  const makeCanonical = canonicalVehicleMake(decoded.make);
  const make = prettyMake(makeCanonical);
  const modelFamily = canonicalModelFamily({
    year: year || 0,
    make: decoded.make,
    model: decoded.model,
    trim: decoded.trim,
    bodyType: decoded.bodyClass,
    drivetrain: decoded.driveType,
    fuelType: decoded.fuelType,
  });
  const bodyClass = canonicalBodyClass({
    year: year || 0,
    make: decoded.make,
    model: decoded.model,
    trim: decoded.trim,
    bodyType: decoded.bodyClass,
    drivetrain: decoded.driveType,
    fuelType: decoded.fuelType,
  });
  const drivetrain = canonicalDrivetrain(decoded.driveType);
  const fuelType = canonicalFuelType(decoded.fuelType);

  const generation = year
    ? findGenerationCompRule({
        year,
        make: decoded.make,
        model: decoded.model,
        trim: decoded.trim,
        bodyStyle: decoded.bodyClass,
        bodyClass: decoded.bodyClass,
      })
    : null;

  const taxonomyFallback = findModelTaxonomyFallback({
    make: decoded.make,
    model: decoded.model,
  });
  const knownAliases = findMarketCheckModelAliases({
    make: decoded.make,
    model: decoded.model,
  });

  const familyAlias =
    modelFamily &&
    normalizeVehicleText(modelFamily) !== normalizeVehicleText(decoded.model)
      ? modelFamily
      : null;
  const sourceModelText = normalizeVehicleText(decoded.model);
  const familyBodyAlias =
    bodyClass === "suv" &&
    sourceModelText.includes("suv") &&
    modelFamily &&
    !normalizeVehicleText(modelFamily).includes("suv")
      ? `${modelFamily.toUpperCase()} SUV`
      : null;

  const providerAliases = unique([
    decoded.model,
    familyBodyAlias,
    taxonomyFallback?.fallbackModel,
    ...knownAliases,
    familyAlias,
  ]);

  const hardExclusions = unique([
    bodyClass ? `Different body style than ${bodyClass}` : null,
    fuelType ? `Different powertrain than ${fuelType}` : null,
    modelFamily ? `Different model family than ${modelFamily}` : null,
  ]);

  const directCriteria = describeDirectCriteria(decoded, modelFamily);

  const comparisonLadder: VehicleComparisonStep[] = [
    {
      tier: "direct",
      label: "Direct comps",
      criteria:
        directCriteria ||
        "Same vehicle identity, body/configuration, drivetrain, and model year",
      requiresConfirmation: false,
    },
    {
      tier: "near",
      label: "Near comps",
      criteria:
        generation
          ? `Same ${modelFamily || decoded.model} generation (${generation.startYear}–${generation.endYear}) with matching body/configuration and powertrain`
          : `Adjacent model years of the same ${modelFamily || decoded.model} with matching body/configuration and powertrain`,
      requiresConfirmation: false,
    },
    {
      tier: "supporting",
      label: "Supporting evidence",
      criteria:
        "Closely related trims or variants only when direct/near evidence remains insufficient; never auto-treated as equal value",
      requiresConfirmation: true,
    },
  ];

  return {
    version: "v1",
    source: "rules",
    status:
      makeCanonical && modelFamily && bodyClass && fuelType ? "ready" : "partial",
    displayName: [decoded.year, make, decoded.model, decoded.trim]
      .filter(Boolean)
      .join(" "),
    year,
    make,
    modelFamily,
    bodyClass,
    variant: decoded.trim || "",
    drivetrain,
    fuelType,
    generation: generation?.generation || null,
    generationStartYear: generation?.startYear || null,
    generationEndYear: generation?.endYear || null,
    providerAliases,
    hardExclusions,
    comparisonLadder,
    notes: unique([
      taxonomyFallback?.notes,
      knownAliases.length
        ? "Known provider aliases are available for broader retrieval."
        : null,
      "Provider aliases broaden retrieval only; final comp qualification stays tied to the decoded vehicle.",
    ]),
  };
}
