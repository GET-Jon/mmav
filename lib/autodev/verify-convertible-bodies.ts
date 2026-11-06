import type { VehicleIdentity } from "../marketcheck/vehicle-equivalence";

export type ConvertibleDiscoveryListing = {
  vin: string | null;
  year: number | null;
  make: string | null;
  model: string | null;
  trim: string | null;
  bodyType: string | null;
  price: number | null;
  miles: number | null;
};

const normalized = (value: unknown) => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function identifiableBody(value: string | null | undefined) {
  const text = normalized(value);
  return /convertible|cabriolet|cabrio|roadster|sedan|saloon|coupe|wagon|suv|hatchback/.test(text);
}

function s63Derivative(listing: ConvertibleDiscoveryListing) {
  const value = normalized([listing.model, listing.trim].join(" "));
  return /\bs\s?63\b/.test(value) || /\bamg\s+s\s?63\b/.test(value);
}

export function convertibleVinVerificationCandidates<T extends ConvertibleDiscoveryListing>(
  listings: T[],
  target: VehicleIdentity,
  max = 8,
) {
  if (!/convertible|cabriolet/.test(normalized(target.bodyType)) ||
      !normalized(target.make).includes("mercedes") ||
      !/\bs\s?63\b/.test(normalized([target.model, target.trim].join(" ")))) return [] as T[];

  return listings
    .filter(listing =>
      /^[A-HJ-NPR-Z0-9]{17}$/.test(String(listing.vin || "").trim().toUpperCase()) &&
      !identifiableBody(listing.bodyType) &&
      s63Derivative(listing) &&
      Number(listing.price || 0) > 0 &&
      Number(listing.miles || 0) > 0 &&
      Math.abs(Number(listing.year || 0) - Number(target.year)) <= 1,
    )
    .sort((a,b) =>
      Math.abs(Number(a.miles) - Number(target.year ? (target as VehicleIdentity & { mileage?: number }).mileage || 46000 : 46000)) -
      Math.abs(Number(b.miles) - Number(target.year ? (target as VehicleIdentity & { mileage?: number }).mileage || 46000 : 46000)),
    ).slice(0,max);
}

export function useVerifiedBodyType(currentBody: string | null, decodedBody: string | null) {
  if (identifiableBody(currentBody)) return currentBody;
  const normalizedDecoded = normalized(decodedBody);
  if (/convertible|cabriolet/.test(normalizedDecoded)) return "Convertible";
  if (/sedan|saloon/.test(normalizedDecoded)) return "Sedan";
  if (/coupe/.test(normalizedDecoded)) return "Coupe";
  return currentBody;
}

export async function verifyConvertibleBodies<T extends ConvertibleDiscoveryListing>(
  listings: T[],
  target: VehicleIdentity,
  remaining: number,
): Promise<{ listings: T[]; attempted: number; convertible: number; otherBody: number }> {
  const candidates = convertibleVinVerificationCandidates(listings, target, remaining);
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
      // VIN must actually decode as a matching Mercedes and plausible model year.
      if (!decodedMake.includes("mercedes") || Math.abs(decodedYear - Number(listing.year)) > 1) {
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
    return { ...listing, bodyType: body };
  });
  return { listings: enriched, attempted: candidates.length, convertible, otherBody };
}
