import type { VehicleIdentity } from "../marketcheck/vehicle-equivalence";
import { evaluateVehicleEquivalence } from "../marketcheck/vehicle-equivalence";
import {
  canonicalBodyClass,
  canonicalVehicleMake,
  canonicalModelFamily,
  canonicalVehicleVariant,
  compactVehicleText,
} from "../marketcheck/vehicle-identity";

export type ConvertibleDiscoveryListing = {
  vin: string | null;
  year: number | null;
  make: string | null;
  model: string | null;
  trim: string | null;
  bodyType: string | null;
  bodyVerificationSource?: "nhtsa-vin" | null;
  price: number | null;
  miles: number | null;
};

const normalized = (value: unknown) => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function identifiableBody(value: string | null | undefined) {
  const text = normalized(value);
  return /convertible|cabriolet|cabrio|roadster|sedan|saloon|coupe|wagon|suv|hatchback|pickup|truck/.test(text);
}

/**
 * Shared VIN-check candidate selection for price-sensitive body variants.
 * Verify only potentially equivalent variants, never ordinary derivatives
 * merely because a broad provider query returned them.
 */
export function convertibleVinVerificationCandidates<T extends ConvertibleDiscoveryListing>(
  listings: T[],
  target: VehicleIdentity,
  max = 8,
  targetMileage = 0,
) {
  const subjectBody = canonicalBodyClass(target);
  const critical = new Set(["convertible", "coupe", "wagon", "pickup"]);
  if (!subjectBody || !critical.has(subjectBody)) return [] as T[];

  const targetFamily = canonicalModelFamily(target);
  const targetMake = canonicalVehicleMake(target.make);
  const targetVariant = compactVehicleText(canonicalVehicleVariant(target));

  return listings
    .filter(listing => {
      const candidate = {
        year: Number(listing.year || 0),
        make: listing.make || "",
        model: listing.model || "",
        trim: listing.trim || "",
        bodyType: listing.bodyType || "",
      };
      if (canonicalVehicleMake(candidate.make) !== targetMake ||
          canonicalModelFamily(candidate) !== targetFamily) return false;
      const listingVariant = compactVehicleText(canonicalVehicleVariant(candidate));
      if (targetVariant && listingVariant && targetVariant !== listingVariant) return false;
      return /^[A-HJ-NPR-Z0-9]{17}$/.test(String(listing.vin || "").trim().toUpperCase()) &&
        !identifiableBody(listing.bodyType) &&
        Number(listing.price || 0) > 0 &&
        Number(listing.miles || 0) > 0 &&
        Math.abs(Number(listing.year || 0) - Number(target.year)) <= 1 &&
        evaluateVehicleEquivalence({ target, candidate }).tier !== "reject";
    })
    .sort((a,b) => Math.abs(Number(a.miles) - targetMileage) - Math.abs(Number(b.miles) - targetMileage))
    .slice(0,max);
}

export function useVerifiedBodyType(currentBody: string | null, decodedBody: string | null) {
  if (identifiableBody(currentBody)) return currentBody;
  const normalizedDecoded = normalized(decodedBody);
  if (/convertible|cabriolet/.test(normalizedDecoded)) return "Convertible";
  if (/sedan|saloon/.test(normalizedDecoded)) return "Sedan";
  if (/coupe/.test(normalizedDecoded)) return "Coupe";
  if (/wagon|estate/.test(normalizedDecoded)) return "Wagon";
  if (/pickup|truck/.test(normalizedDecoded)) return "Pickup";
  return currentBody;
}

export async function verifyConvertibleBodies<T extends ConvertibleDiscoveryListing>(
  listings: T[],
  target: VehicleIdentity,
  remaining: number,
  targetMileage: number,
): Promise<{ listings: T[]; attempted: number; convertible: number; otherBody: number }> {
  const candidates = convertibleVinVerificationCandidates(listings, target, remaining, targetMileage);
  if (!candidates.length) return { listings, attempted: 0, convertible: 0, otherBody: 0 };
  const results = await Promise.all(candidates.map(async listing => {
    try {
      const vin = String(listing.vin).trim().toUpperCase();
      const response = await fetch(
        `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${encodeURIComponent(vin)}?format=json`,
        { signal: AbortSignal.timeout(3500), cache: "no-store" },
      );
      if (!response.ok) return { vin, body: null };
      const raw = await response.json();
      const row = raw?.Results?.[0];
      const decodedMake = normalized(row?.Make);
      const decodedYear = Number(row?.ModelYear || 0);
      // Validate decoded make and year for any manufacturer. A VIN body type
      // is not trusted when its basic identity contradicts the listing.
      if (canonicalVehicleMake(decodedMake) !== canonicalVehicleMake(listing.make) ||
          !decodedYear || Math.abs(decodedYear - Number(listing.year)) > 1) {
        return { vin, body: null };
      }
      return { vin, body: String(row?.BodyClass || "") };
    } catch {
      return { vin: String(listing.vin).trim().toUpperCase(), body: null };
    }
  }));
  const mapped = new Map(results.map(value => [value.vin, value.body]));
  let convertible = 0;
  let otherBody = 0;
  const enriched = listings.map(listing => {
    const vin = String(listing.vin || "").trim().toUpperCase();
    if (!mapped.has(vin)) return listing;
    const body = useVerifiedBodyType(listing.bodyType, mapped.get(vin) || null);
    if (body === "Convertible") convertible++;
    else if (body === "Sedan" || body === "Coupe") otherBody++;
    return { ...listing, bodyType: body, bodyVerificationSource: body !== listing.bodyType && body !== null ? "nhtsa-vin" as const : listing.bodyVerificationSource };
  });
  return { listings: enriched, attempted: candidates.length, convertible, otherBody };
}
