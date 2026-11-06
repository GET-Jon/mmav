import { canonicalBodyClass, canonicalTransmission } from "./vehicle-identity";
import type { VehicleIdentity, VehicleEquivalenceTier } from "./vehicle-equivalence";

/**
 * Manufacturer-independent, conservative material-configuration policy.
 * An absent attribute is not a mismatch, but cannot establish a matching
 * high-impact body style. Do not guess from make/model alone.
 *
 * Identity and price evidence remain distinct: the caller retains Supporting
 * listings for context but never auto-includes them for pricing.
 */
export function materialConfigurationGuards(
  target: VehicleIdentity,
  candidate: VehicleIdentity,
): { maxTier: VehicleEquivalenceTier; reasons: string[] } {
  const reasons: string[] = [];
  let maxTier: VehicleEquivalenceTier = "direct";
  const subjectBody = canonicalBodyClass(target);
  const listingBody = canonicalBodyClass(candidate);

  // These specific bodies have materially different resale markets from
  // their model siblings; require evidence instead of accepting generic "Car".
  const sensitiveBodies = new Set(["convertible", "coupe", "wagon", "pickup"]);
  if (subjectBody && sensitiveBodies.has(subjectBody) && !listingBody) {
    maxTier = "supporting";
    reasons.push(`candidate ${subjectBody} body configuration is unverified`);
  }

  // Known differing body styles do not establish equivalent sale prices.
  if (subjectBody && listingBody && subjectBody !== listingBody) {
    maxTier = subjectBody === "pickup" || listingBody === "pickup" ? "reject" : "supporting";
    reasons.push(`body configuration differs: ${subjectBody} vs ${listingBody}`);
  }

  const subjectTransmission = canonicalTransmission(target.transmission);
  const listingTransmission = canonicalTransmission(candidate.transmission);
  if (subjectTransmission && listingTransmission && subjectTransmission !== listingTransmission) {
    if (maxTier !== "reject") maxTier = "supporting";
    reasons.push(`transmission differs: ${subjectTransmission} vs ${listingTransmission}`);
  }

  return { maxTier, reasons };
}

export function applyConfigurationTierCeiling(
  current: VehicleEquivalenceTier,
  ceiling: VehicleEquivalenceTier,
): VehicleEquivalenceTier {
  const tiers: VehicleEquivalenceTier[] = ["direct", "near", "supporting", "reject"];
  return tiers[Math.max(tiers.indexOf(current), tiers.indexOf(ceiling))];
}
