import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { resolveVehicleGeneration } from "@/lib/vehicle-generations";
import type { MotorMatchListing } from "./solver";

type CachedCohort = {
  expiresAt: number;
  listings: MotorMatchListing[];
  providerTotal: number;
  calls: 0;
  trim: string;
  trimApplied: boolean;
  source: "database";
  targetYear: number;
  generation: string | null;
  generationStartYear: number;
  generationEndYear: number;
};

const CACHE_TTL_MS = 30 * 60 * 1000;
const DB_MAX_SAMPLE = 500;
const cache = new Map<string, CachedCohort>();

const n = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const s = (value: unknown) => String(value || "").trim();

function keyFor({
  make,
  model,
  trim,
  zip,
  distance,
  year,
}: {
  make: string;
  model: string;
  trim: string;
  zip: string;
  distance: number;
  year: number;
}) {
  return [make, model, trim || "*", zip || "national", zip ? distance : "all", year]
    .map((value) => String(value).trim().toLowerCase())
    .join("|");
}

async function queryStoredRows({
  make,
  model,
  yearMin,
  yearMax,
}: {
  make: string;
  model: string;
  yearMin: number;
  yearMax: number;
}) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("motor_match_market_observations")
    .select(
      "vin,year,make,model,trim,price,miles,dealer,city,state,listing_url",
    )
    .eq("bucket_make", make)
    .eq("bucket_model", model)
    .gte("year", yearMin)
    .lte("year", yearMax)
    .order("observed_at", { ascending: false })
    .limit(DB_MAX_SAMPLE);

  if (error) throw error;

  return (data || [])
    .map((row: any): MotorMatchListing => ({
      vin: s(row.vin) || null,
      year: n(row.year),
      make: s(row.make) || null,
      model: s(row.model) || null,
      trim: s(row.trim) || null,
      price: n(row.price),
      miles: n(row.miles),
      dealer: s(row.dealer) || null,
      city: s(row.city) || null,
      state: s(row.state) || null,
      url: s(row.listing_url) || null,
    }))
    .filter(
      (row) =>
        typeof row.price === "number" &&
        row.price > 0 &&
        typeof row.miles === "number" &&
        row.miles >= 0,
    );
}

export async function getMotorMatchCohort(
  input: {
    make: string;
    model: string;
    trim: string;
    zip: string;
    distance: number;
    year: number;
  },
) {
  const key = keyFor(input);
  const now = Date.now();
  const existing = cache.get(key);

  if (existing && existing.expiresAt > now) {
    return { key, cohort: existing, cacheHit: true, calls: 0 as const };
  }

  const generation = resolveVehicleGeneration({
    year: input.year,
    make: input.make,
    model: input.model,
    trim: input.trim,
  });

  const generationStartYear = generation?.startYear ?? input.year;
  const generationEndYear = generation?.endYear ?? input.year;

  const allRows = await queryStoredRows({
    make: input.make,
    model: input.model,
    yearMin: generationStartYear,
    yearMax: generationEndYear,
  });

  const normalizedTrim = input.trim.toLowerCase().trim();
  const trimRows = normalizedTrim
    ? allRows.filter((row) =>
        String(row.trim || "").toLowerCase().includes(normalizedTrim),
      )
    : [];

  // Trim data from listing providers is inconsistent. Only narrow the cohort
  // when the requested trim has enough support to remain useful.
  const trimApplied = Boolean(normalizedTrim && trimRows.length >= 3);
  const listings = trimApplied ? trimRows : allRows;

  const cohort: CachedCohort = {
    expiresAt: now + CACHE_TTL_MS,
    listings,
    providerTotal: listings.length,
    calls: 0,
    trim: input.trim,
    trimApplied,
    source: "database",
    targetYear: input.year,
    generation: generation?.generation ?? null,
    generationStartYear,
    generationEndYear,
  };

  cache.set(key, cohort);

  if (cache.size > 200) {
    for (const [cacheKey, value] of cache) {
      if (value.expiresAt <= now) cache.delete(cacheKey);
    }
  }

  return { key, cohort, cacheHit: false, calls: 0 as const };
}

export function closestListings(
  listings: MotorMatchListing[],
  input: { budget: number; mileage: number },
  limit = 3,
) {
  const priceScale = Math.max(input.budget, 10000);
  const mileageScale = Math.max(input.mileage, 20000);

  return [...listings]
    .filter(
      (listing) =>
        typeof listing.price === "number" &&
        typeof listing.miles === "number",
    )
    .sort((a, b) => {
      const score = (listing: MotorMatchListing) =>
        Math.abs((listing.price as number) - input.budget) / priceScale +
        Math.abs((listing.miles as number) - input.mileage) / mileageScale;
      return score(a) - score(b);
    })
    .slice(0, limit);
}

export function getCachedMotorMatch(key: string) {
  const cohort = cache.get(key);
  return cohort && cohort.expiresAt > Date.now() ? cohort : null;
}

export type { MotorMatchListing } from "./solver";
