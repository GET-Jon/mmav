import type { MarketComp } from "@/types/comps";

/**
 * Primary vs supporting are PRICING roles, not vehicle-identity tiers.
 * A "Direct" vehicle can still be a weak pricing peer if it needs a large
 * mileage correction, is too old/new, or differs in verified configuration.
 */
export type PricingPeer = {
  comp: MarketComp;
  adjustedPrice: number;
  mileage: {
    capped: boolean;
    mileageDelta: number;
    reliability: "normal" | "caution" | "low";
  };
};

export type SubjectPricingProfile = {
  year?: number | null;
  mileage: number;
  fuelType?: string | null;
  drivetrain?: string | null;
  engine?: string | null;
};

export type PrimaryCohort<T extends PricingPeer> = {
  primary: T[];
  supporting: T[];
  /** True only when we have enough closely matched prices for primary pricing. */
  usable: boolean;
  unverifiedConfigCount: number;
};

function canonicalDrive(value: string | null | undefined) {
  const text = String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (!text) return null;
  if (/quattro|4matic|xdrive|all wheel|\bawd\b/.test(text)) return "awd";
  if (/four wheel|4 wheel|\b4wd\b|\b4x4\b/.test(text)) return "4wd";
  if (/front wheel|\bfwd\b|fronttrak/.test(text)) return "fwd";
  if (/rear wheel|\brwd\b/.test(text)) return "rwd";
  return null;
}

function canonicalFuel(value: string | null | undefined) {
  const text = String(value || "").toLowerCase();
  if (!text) return null;
  if (/plug.?in hybrid|phev/.test(text)) return "phev";
  if (/hybrid/.test(text)) return "hybrid";
  if (/diesel/.test(text)) return "diesel";
  if (/electric/.test(text)) return "electric";
  if (/gasoline|petrol|gas\b/.test(text)) return "gas";
  return null;
}

function engineSize(value: string | null | undefined) {
  const match = String(value || "").toLowerCase().match(/\b([1-9]\.\d)\s*(?:l|liter|litre)\b/);
  return match ? Number(match[1]) : null;
}

function knownConfigurationDiffers(
  subject: SubjectPricingProfile,
  comp: MarketComp,
) {
  const details = comp.marketCheckDetails;
  const targetDrive = canonicalDrive(subject.drivetrain);
  const listingDrive = canonicalDrive(details?.drivetrain);
  if (targetDrive && listingDrive && targetDrive !== listingDrive) return true;

  const targetFuel = canonicalFuel(subject.fuelType);
  const listingFuel = canonicalFuel(details?.fuelType);
  if (targetFuel && listingFuel && targetFuel !== listingFuel) return true;

  const targetEngine = engineSize(subject.engine);
  const listingEngine = engineSize(details?.engine);
  if (targetEngine && listingEngine && targetEngine !== listingEngine) return true;
  return false;
}

function configurationUnverified(subject: SubjectPricingProfile, comp: MarketComp) {
  const details = comp.marketCheckDetails;
  return Boolean(
    (canonicalDrive(subject.drivetrain) && !canonicalDrive(details?.drivetrain)) ||
    (canonicalFuel(subject.fuelType) && !canonicalFuel(details?.fuelType)) ||
    (engineSize(subject.engine) && !engineSize(details?.engine)),
  );
}

/** A single conservative, predictable definition; never infer missing attributes. */
export function buildPrimaryPricingCohort<T extends PricingPeer>(
  entries: T[],
  subject: SubjectPricingProfile,
  minPrimary = 4,
): PrimaryCohort<T> {
  const hasYear = Number.isInteger(subject.year) && Number(subject.year) >= 1900;
  const validMileage = Number.isFinite(subject.mileage) && subject.mileage >= 0;
  const primary: T[] = [];
  const supporting: T[] = [];
  let unverifiedConfigCount = 0;
  for (const entry of entries) {
    const { comp, mileage } = entry;
    const eligible = hasYear && validMileage &&
      comp.equivalenceTier === "direct" &&
      Number(comp.qualityScore) >= 75 &&
      comp.dealerDecision !== "include" &&
      Math.abs(comp.year - Number(subject.year)) <= 1 &&
      Math.abs(mileage.mileageDelta) <= 20000 &&
      !mileage.capped &&
      mileage.reliability === "normal" &&
      !knownConfigurationDiffers(subject, comp);
    if (eligible) {
      primary.push(entry);
      if (configurationUnverified(subject, comp)) unverifiedConfigCount++;
    } else {
      supporting.push(entry);
    }
  }
  return {
    primary,
    supporting,
    usable: primary.length >= minPrimary,
    unverifiedConfigCount,
  };
}

/** Interpolated percentiles (deterministic for both even and odd samples). */
export function percentile(sortedPrices: number[], fraction: number) {
  if (!sortedPrices.length) return 0;
  const prices = [...sortedPrices].sort((a,b) => a-b);
  const index = (prices.length - 1) * Math.min(1, Math.max(0, fraction));
  const floor = Math.floor(index);
  return prices[floor] + (prices[Math.min(floor+1,prices.length-1)]-prices[floor]) * (index-floor);
}
