import type { MarketComp } from "../../types/comps";
import {
  evaluateVehicleEquivalence,
  type VehicleIdentity,
} from "../marketcheck/vehicle-equivalence";
import { findGenerationCompRule } from "../marketcheck/generation-comps";
import { resolveSemanticFuelType } from "../marketcheck/vehicle-identity";

// National listings provide independent retail asking-price evidence.
// They must pass identity + data checks before they can affect valuation;
// the discovery total alone is never a count of valuation comps.
export type AutoDevCompListing = {
  vin?: string | null;
  year?: number | null;
  make?: string | null;
  model?: string | null;
  trim?: string | null;
  drivetrain?: string | null;
  fuelType?: string | null;
  bodyType?: string | null;
  price?: number | null;
  miles?: number | null;
  dealer?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  url?: string | null;
};

export function buildAutoDevCompCandidates(
  listings: AutoDevCompListing[],
  target: VehicleIdentity,
  targetMileage: number,
): {
  comps: MarketComp[];
  diagnostics: {
    listingsReviewed: number;
    missingPriceOrMileage: number;
    identityRejected: number;
    outOfYearRange: number;
    direct: number;
    near: number;
    supporting: number;
    autoIncluded: number;
  };
} {
  const diagnostics = {
    listingsReviewed: listings.length,
    missingPriceOrMileage: 0,
    identityRejected: 0,
    outOfYearRange: 0,
    direct: 0,
    near: 0,
    supporting: 0,
    autoIncluded: 0,
  };
  const seen = new Set<string>();
  const comps: MarketComp[] = [];
  const generation = findGenerationCompRule({
    year: target.year,
    make: target.make,
    model: target.model,
    trim: target.trim || "",
    bodyClass: target.bodyType || "",
  });

  for (const listing of listings) {
    const year = Number(listing.year || 0);
    const price = Number(listing.price);
    const miles = Number(listing.miles);
    if (
      !Number.isFinite(price) || price < 500 || price > 1000000 ||
      listing.miles === null || listing.miles === undefined ||
      !Number.isFinite(miles) || miles < 0 || miles > 500000
    ) {
      diagnostics.missingPriceOrMileage += 1;
      continue;
    }
    if (
      !year || Math.abs(year - target.year) > 2 ||
      (generation && (year < generation.startYear || year > generation.endYear))
    ) {
      diagnostics.outOfYearRange += 1;
      continue;
    }
    const candidate: VehicleIdentity = {
      year,
      make: listing.make || "",
      model: listing.model || "",
      trim: listing.trim || "",
      bodyType: listing.bodyType || "",
      drivetrain: listing.drivetrain || "",
      fuelType: resolveSemanticFuelType({
        make: listing.make || "",
        model: listing.model || "",
        trim: listing.trim || "",
        fuelType: listing.fuelType || "",
      }),
    };
    const match = evaluateVehicleEquivalence({ target, candidate });
    if (match.tier === "reject") {
      diagnostics.identityRejected += 1;
      continue;
    }
    diagnostics[match.tier] += 1;
    const vin = String(listing.vin || "").trim().toUpperCase();
    const validVin = /^[A-HJ-NPR-Z0-9]{17}$/.test(vin);
    const url = String(listing.url || "").trim();
    const key = validVin ? "vin:" + vin : [year, listing.model, listing.trim, miles, price, url].join("|").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const yearGap = Math.abs(year - target.year);
    const milesGap = Math.abs(miles - targetMileage);
    const qualityScore = Math.max(
      40,
      Math.min(96, (match.tier === "direct" ? 92 : match.tier === "near" ? 81 : 62)
        - yearGap * 5 - Math.min(12, Math.round(milesGap / 8000))
        - (validVin ? 0 : 12) - (url ? 0 : 8)),
    );
    // Only well-documented Direct/Near retail listings may be selected without
    // a dealer action; Supporting stays optional evidence.
    // An absent trim is not evidence of a verified derivative.
    const autoInclude =
      (match.tier === "direct" || match.tier === "near") &&
      match.autoIncludeEligible &&
      !match.needsClassificationReview &&
      Boolean(String(listing.trim || "").trim()) &&
      validVin && Boolean(url) && qualityScore >= (match.tier === "direct" ? 60 : 75);

    if (autoInclude) diagnostics.autoIncluded += 1;
    comps.push({
      id: "autodev-" + (validVin ? vin : String(comps.length) + "-" + year + "-" + miles),
      included: autoInclude,
      source: "Auto.dev",
      region: [listing.city, listing.state].filter(Boolean).join(", ") || "National",
      regionZip: listing.zip || undefined,
      distance: 0,
      year,
      model: listing.model || target.model,
      trim: listing.trim || "",
      mileage: miles,
      askingPrice: price,
      qualityScore,
      equivalenceTier: match.tier,
      equivalenceReasons: [...match.reasons, "independently sourced Auto.dev retail listing"],
      autoIncludeEligible: autoInclude,
      targetClassification: match.targetClassification,
      candidateClassification: match.candidateClassification,
      needsClassificationReview: match.needsClassificationReview || !validVin || !listing.trim,
      marketCheckDetails: {
        vin: validVin ? vin : null,
        heading: [year, listing.make, listing.model, listing.trim].filter(Boolean).join(" "),
        listingUrl: url || null,
        dealerName: listing.dealer || null,
        city: listing.city || null,
        state: listing.state || null,
        zip: listing.zip || null,
        targetYear: target.year,
        targetMake: target.make,
        targetModel: target.model,
        targetTrim: target.trim || null,
        targetMileage,
        listingConfidence: autoInclude ? "High" : "Medium",
        retrievalAttempt: "auto-dev-national-discovery",
        compFitFactors: {
          yearDelta: year - target.year,
          mileageDelta: miles - targetMileage,
          finalScore: qualityScore,
          equivalenceTier: match.tier,
          equivalenceReasons: match.reasons,
          autoIncludeEligible: autoInclude,
          needsClassificationReview: match.needsClassificationReview || !validVin || !listing.trim,
        },
      },
    });
  }
  return { comps, diagnostics };
}

// Cross-provider identity is the VIN, not provider row ID. Prefer an existing
// dealer choice and existing MarketCheck evidence when both describe one car.
export function mergeCompCandidates(existing: MarketComp[], additional: MarketComp[]) {
  const merged = [...existing];
  const seenIds = new Set(merged.map((comp) => comp.id));
  const vinIndex = new Map<string, number>();
  merged.forEach((comp, index) => {
    const vin = String(comp.marketCheckDetails?.vin || "").trim().toUpperCase();
    if (vin && !vinIndex.has(vin)) vinIndex.set(vin, index);
  });

  for (const comp of additional) {
    if (seenIds.has(comp.id)) continue;
    const vin = String(comp.marketCheckDetails?.vin || "").trim().toUpperCase();
    const index = vin ? vinIndex.get(vin) : undefined;
    if (index !== undefined) {
      const old = merged[index];
      // Prefer MarketCheck's detailed listing evidence, but never discard the
      // dealer's explicitly recorded include/exclude choice.
      if (old.source === "Auto.dev" && comp.source !== "Auto.dev") {
        merged[index] = {
          ...comp,
          dealerDecision: old.dealerDecision || comp.dealerDecision,
          dealerDecisionAt: old.dealerDecisionAt || comp.dealerDecisionAt,
          included: old.dealerDecision ? old.included : comp.included,
        };
        seenIds.delete(old.id);
        seenIds.add(comp.id);
      }
      continue;
    }
    merged.push(comp);
    seenIds.add(comp.id);
    if (vin) vinIndex.set(vin, merged.length - 1);
  }
  return merged;
}
