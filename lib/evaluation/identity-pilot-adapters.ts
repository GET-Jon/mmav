import { buildEvidenceProfile, type EvidenceSource } from "./identity-evidence";
import type { VehicleIdentity } from "../marketcheck/vehicle-equivalence";

type RecordValue = Record<string, unknown>;
const obj = (value: unknown): RecordValue => value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};
const str = (v: unknown) => typeof v === "string" || typeof v === "number" ? String(v) : "";
const num = (v: unknown) => Number(v) || 0;

/** Explicit source adapters: absent candidate make/model are never copied from the subject. */
export function subjectEvidence(input: RecordValue) {
  const d = obj(input.decoded);
  const v: EvidenceSource["vehicle"] = {
    year: num(d.year || input.year), make: str(d.make || input.make), model: str(d.model || input.model), trim: str(d.trim || input.trim),
    bodyType: str(d.bodyClass), drivetrain: str(d.driveType), fuelType: str(d.fuelType), transmission: str(d.transmission),
    displacement: str(d.displacementL), cylinders: num(d.engineCylinders) || null, doors: num(d.doors) || null,
  };
  // Saved UI data may include manual corrections; provenance does not justify marking it VIN-verified.
  return buildEvidenceProfile([{ id: "saved-subject", vehicle: v, basis: "reported" }], str(input.vin));
}

export function candidateEvidence(input: RecordValue) {
  const d = obj(input.details), b = obj(input.build), verification = obj(d.identityVerification);
  const sources: EvidenceSource[] = [];
  // Prefer actual listing build make/model, never details.targetMake/targetModel.
  const build: VehicleIdentity = { year: num(b.year || input.year), make: str(b.make), model: str(b.model), trim: str(b.trim),
    bodyType: str(b.body_type || b.body_style), drivetrain: str(b.drivetrain || b.drive_type), fuelType: str(b.fuel_type || b.fuel),
    transmission: str(b.transmission), engine: str(b.engine), cylinders: num(b.cylinders) || null, doors: num(b.doors) || null };
  if (Object.keys(b).length) sources.push({ id: "listing-build", vehicle: build });
  // Display model sometimes prefixes the make. Do not let that manufacture a conflicting family.
  const displayModel = str(input.model).replace(new RegExp('^' + str(b.make).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s+', 'i'), '');
  sources.push({ id: "saved-listing", vehicle: { year: num(input.year), make: str(b.make), model: displayModel,
    trim: str(input.trim), bodyType: str(d.bodyType), drivetrain: str(d.drivetrain), fuelType: str(d.fuelType),
    transmission: str(d.transmission), engine: str(d.engine), cylinders: num(d.cylinders) || null, doors: num(d.doors) || null } });
  if (Object.keys(verification).length) sources.push({ id: "saved-verification", vehicle: {
    year: num(verification.year), make: str(verification.make), model: str(verification.model), trim: str(verification.trim),
    bodyType: str(verification.bodyType), drivetrain: str(verification.drivetrain), fuelType: str(verification.fuelType),
    cylinders: num(verification.cylinders) || null, doors: num(verification.doors) || null,
  } });
  return buildEvidenceProfile(sources, str(d.vin));
}
