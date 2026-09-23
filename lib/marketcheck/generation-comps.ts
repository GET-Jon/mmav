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

export function findGenerationCompRule(
  vehicle: VehicleGenerationInput,
): GenerationCompRule | null {
  // Retrieval now always starts with the exact model year, so generation data
  // is safe to retain for a deliberate second-stage widening. We no longer
  // suppress generation rules for abundant models merely to protect the first
  // MarketCheck page from older model years.
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
