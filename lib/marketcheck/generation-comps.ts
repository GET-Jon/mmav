import { isYearInVehicleGeneration, resolveVehicleGeneration } from "@/lib/vehicle-generations";
import type { VehicleGenerationInput, VehicleGenerationMatch } from "@/lib/vehicle-generations";

export type GenerationCompRule = VehicleGenerationMatch;

function normalize(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function findGenerationCompRule(vehicle: VehicleGenerationInput): GenerationCompRule | null {
  const make = normalize(vehicle.make);
  const model = normalize(vehicle.model);

  const isMercedes =
    make === "mercedes" ||
    make === "mercedes benz" ||
    make === "mercedesbenz";

  const isStandardCClass =
    model === "c class" ||
    model === "cclass" ||
    ["c250", "c300", "c350", "c400", "c450"].includes(model.replace(/\s+/g, ""));

  // Standard Mercedes C-Class inventory is abundant enough that the initial
  // MarketCheck retrieval should stay exact-year. Returning a generation rule
  // here causes the search route to omit `year`, which lets older C-Class rows
  // fill MarketCheck's first page and then get rejected as generation mismatches.
  // Performance variants (C43/C63) still use the normal generation-aware path.
  if (isMercedes && isStandardCClass) {
    return null;
  }

  return resolveVehicleGeneration(vehicle);
}

export function isInGenerationCompRange({
  year,
  generationRule,
}: {
  year: number;
  generationRule: GenerationCompRule | null;
}) {
  return isYearInVehicleGeneration({ year, generation: generationRule });
}
