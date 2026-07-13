import { isYearInVehicleGeneration, resolveVehicleGeneration } from "@/lib/vehicle-generations";
import type { VehicleGenerationInput, VehicleGenerationMatch } from "@/lib/vehicle-generations";

export type GenerationCompRule = VehicleGenerationMatch;

export function findGenerationCompRule(vehicle: VehicleGenerationInput): GenerationCompRule | null {
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
