/** Evidence-preserving shadow identity resolver. No provider calls or production imports. */
import {
  canonicalBodyClass, canonicalDrivetrain, canonicalFuelType, canonicalModelFamily,
  canonicalVehicleMake, canonicalVehicleVariant, isLikelyVariantEnumeration,
  isNonRetailTrimLabel, normalizeVehicleText,
} from "../marketcheck/vehicle-identity";
import { evaluateVehicleEquivalence, type VehicleIdentity } from "../marketcheck/vehicle-equivalence";

export const IDENTITY_POLICY_VERSION = "pilot-1";
export const identityFields = ["make", "modelFamily", "year", "body", "drivetrain", "fuel", "transmission", "displacement", "cylinders", "configuration", "powertrainBadge", "market"] as const;
export type IdentityField = typeof identityFields[number];
export type Claim = { field: IdentityField; value: string; source: string; basis: "reported" | "verified" | "inferred"; raw: string };
export type Fact = { status: "unknown" | "reported" | "verified" | "inferred" | "conflicting"; value: string | null; possibilities: string[]; claims: Claim[] };
export type EvidenceProfile = { version: string; vin?: string; identity: VehicleIdentity; facts: Record<IdentityField, Fact> };
export type EvidenceSource = { id: string; basis?: Claim["basis"]; vehicle: VehicleIdentity & { displacement?: string | number | null; market?: string | null } };

// An automatic gearbox with manual mode is not a manual transmission.
export function normalizeTransmission(value: unknown): string {
  const text = normalizeVehicleText(value);
  if (/\b(automatic|auto|dct|cvt|automated|dual clutch)\b/.test(text)) return "automatic";
  if (/\b(manual|stick)\b/.test(text)) return "manual";
  return "";
}

function resolved(claims: Claim[]): Fact {
  const possibilities = [...new Set(claims.map(c => c.value))].sort();
  // Repeated or syndicated claims never increase their evidence basis.
  const basis = claims.some(c => c.basis === "verified") ? "verified"
    : claims.some(c => c.basis === "reported") ? "reported" : "inferred";
  return { status: possibilities.length > 1 ? "conflicting" : possibilities.length ? basis : "unknown",
    value: possibilities.length === 1 ? possibilities[0] : null, possibilities, claims };
}

export function buildEvidenceProfile(sources: EvidenceSource[], vin?: string): EvidenceProfile {
  const claims: Claim[] = [];
  const add = (source: EvidenceSource, field: IdentityField, value: unknown, raw: unknown, inferred = false) => {
    if (value === null || value === undefined || String(value).trim() === "") return;
    claims.push({ field, value: String(value), source: source.id, basis: inferred ? "inferred" : source.basis || "reported", raw: String(raw ?? value) });
  };
  for (const source of sources) {
    const v = source.vehicle;
    const model = canonicalModelFamily(v);
    add(source, "make", canonicalVehicleMake(v.make), v.make);
    add(source, "modelFamily", model, v.model);
    if (v.year > 1900 && v.year < 2100) add(source, "year", v.year, v.year);
    add(source, "body", canonicalBodyClass(v), v.bodyType || v.model);
    // Preserve AWD / 4WD and ambiguous 2WD separately.
    add(source, "drivetrain", canonicalDrivetrain(v.drivetrain), v.drivetrain);
    add(source, "fuel", canonicalFuelType(v.fuelType), v.fuelType);
    add(source, "transmission", normalizeTransmission(v.transmission), v.transmission);
    add(source, "market", normalizeVehicleText(v.market), v.market);
    const displacement = Number(v.displacement || String(v.engine || "").match(/\b(\d+(?:\.\d+)?)\s*l\b/i)?.[1]);
    if (Number.isFinite(displacement) && displacement > 0 && displacement < 20) {
      add(source, "displacement", displacement.toFixed(1), v.displacement || v.engine, !v.displacement);
    }
    const cylinders = Number(v.cylinders || String(v.engine || "").match(/\b(?:v|i|l|h|w)\s*(\d{1,2})\b/i)?.[1]);
    if (Number.isInteger(cylinders) && cylinders > 0 && cylinders <= 16) add(source, "cylinders", cylinders, v.cylinders || v.engine, !v.cylinders);

    // Only split labels in a scoped family. A badge is not a factory-build verification.
    if (canonicalVehicleMake(v.make) === "land rover" && model === "range rover velar") {
      const label = [v.model, v.trim, v.configuration].filter(Boolean).join(" ");
      const badges = label.match(/\b[PD]\d{3}\b/gi) || [];
      for (const badge of badges) add(source, "powertrainBadge", badge.toLowerCase(), label, true);
      const equipment = String(v.trim || "").replace(/\b[PD]\d{3}\b/gi, "").trim();
      if (equipment && !isLikelyVariantEnumeration({ ...v, trim: equipment })) {
        add(source, "configuration", normalizeVehicleText(equipment), v.trim);
      }
    } else {
      const variant = canonicalVehicleVariant(v);
      if (!isNonRetailTrimLabel(v.trim) && !isLikelyVariantEnumeration(v)) add(source, "configuration", variant, [v.model, v.trim].filter(Boolean).join(" "));
    }
  }
  const facts = Object.fromEntries(identityFields.map(field => [field, resolved(claims.filter(c => c.field === field))])) as Record<IdentityField, Fact>;
  const get = (field: IdentityField) => facts[field].value || "";
  const identity: VehicleIdentity = { year: Number(get("year")), make: get("make"), model: get("modelFamily"), trim: get("configuration"),
    bodyType: get("body"), drivetrain: get("drivetrain"), fuelType: get("fuel"), transmission: get("transmission"),
    cylinders: Number(get("cylinders")) || null, engine: get("displacement") ? `${get("displacement")}L` : "" };
  return { version: IDENTITY_POLICY_VERSION, vin, identity, facts };
}

export type ComparisonDecision = {
  outcome: "direct" | "supporting" | "needs-verification" | "excluded";
  directPeerEligible: boolean;
  reasons: Array<{ code: string; field?: IdentityField; detail: string }>;
  legacyTier: string;
};

/** Pilot policy only. No speculative dollar adjustments; supporting is never a direct peer. */
export function compareEvidence(subject: EvidenceProfile, candidate: EvidenceProfile): ComparisonDecision {
  const reasons: ComparisonDecision["reasons"] = [];
  const legacy = evaluateVehicleEquivalence({ target: subject.identity, candidate: candidate.identity });
  const finish = (outcome: ComparisonDecision["outcome"]): ComparisonDecision => ({ outcome, directPeerEligible: outcome === "direct", reasons, legacyTier: legacy.tier });
  if (subject.vin && candidate.vin && subject.vin.toUpperCase() === candidate.vin.toUpperCase()) {
    reasons.push({ code: "subject-is-candidate", detail: "The subject's own listing is not independent evidence." });
    return finish("excluded");
  }
  // A definite hard mismatch takes precedence even if other attributes are unknown.
  for (const field of ["make", "modelFamily", "body"] as const) {
    const a = subject.facts[field], b = candidate.facts[field];
    if (a.value && b.value && a.value !== b.value) {
      reasons.push({ code: "different-family-or-body", field, detail: `${a.value} vs ${b.value}` });
    }
  }
  if (reasons.length) return finish("excluded");
  const required: IdentityField[] = ["make", "modelFamily", "year", "body", "drivetrain", "fuel", "transmission", "configuration"];
  if (subject.facts.fuel.value !== "electric" || candidate.facts.fuel.value !== "electric") required.push("displacement", "cylinders");
  // If either side carries a powertrain badge, equal displacement does not establish equal output.
  if (subject.facts.powertrainBadge.claims.length || candidate.facts.powertrainBadge.claims.length) required.push("powertrainBadge");
  if (subject.facts.market.claims.length || candidate.facts.market.claims.length) required.push("market");
  // Known differences already rule out a direct peer; do not spend enrichment resolving unrelated gaps.
  for (const field of required) {
    const a = subject.facts[field].value, b = candidate.facts[field].value;
    if (a && b && a !== b) reasons.push({ code: "material-difference", field,
      detail: `${a} vs ${b}; no approved adjustment in pilot` });
  }
  if (reasons.length) return finish("supporting");
  for (const field of required) {
    for (const [side, profile] of [["subject", subject], ["candidate", candidate]] as const) {
      const fact = profile.facts[field];
      if (!fact.value) reasons.push({ code: fact.status === "conflicting" ? "conflicting-attribute" : "missing-attribute", field, detail: `${side} ${field}: ${fact.status}` });
    }
  }
  if (reasons.length) return finish("needs-verification");
  // EV battery/drive-unit evidence is deliberately not modeled yet.
  if (subject.facts.fuel.value === "electric") {
    reasons.push({ code: "unsupported-ev-configuration", detail: "Battery and drive-unit variant require a dedicated policy before direct-peer admission." });
    return finish("needs-verification");
  }
  if (legacy.tier !== "direct" || legacy.needsClassificationReview) {
    reasons.push({ code: "existing-policy-ceiling", detail: legacy.reasons.join("; ") || legacy.tier });
    return finish(legacy.tier === "reject" ? "excluded" : "supporting");
  }
  reasons.push({ code: "documented-configuration-match", detail: "Pilot-required attributes agree. Pricing quality and independent verification remain separate checks." });
  return finish("direct");
}
