import { NextResponse } from "next/server";
import { findGenerationCompRule } from "@/lib/marketcheck/generation-comps";

export const dynamic = "force-dynamic";

type AutoDevListing = {
  vin: string | null;
  year: number | null;
  make: string | null;
  model: string | null;
  trim: string | null;
  drivetrain: string | null;
  price: number | null;
  miles: number | null;
  dealer: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  url: string | null;
  longitude: number | null;
  latitude: number | null;
};

function toNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function haversineMiles(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
) {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const earthRadiusMiles = 3958.8;
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadiusMiles * Math.asin(Math.sqrt(h));
}

function buildRecommendedMarkets(listings: AutoDevListing[], maxMarkets = 3) {
  const candidates = listings.filter(
    (listing): listing is AutoDevListing & {
      zip: string;
      latitude: number;
      longitude: number;
    } =>
      Boolean(listing.zip) &&
      typeof listing.latitude === "number" &&
      typeof listing.longitude === "number",
  );

  const remaining = new Set(candidates.map((_, index) => index));
  const recommendations: Array<{
    market: string;
    zip: string;
    latitude: number;
    longitude: number;
    coverageCount: number;
    states: string[];
    vins: string[];
  }> = [];

  while (remaining.size && recommendations.length < maxMarkets) {
    let bestCenterIndex: number | null = null;
    let bestCovered: number[] = [];

    for (const centerIndex of remaining) {
      const center = candidates[centerIndex];
      const covered = Array.from(remaining).filter((candidateIndex) => {
        const candidate = candidates[candidateIndex];
        return (
          haversineMiles(
            { latitude: center.latitude, longitude: center.longitude },
            { latitude: candidate.latitude, longitude: candidate.longitude },
          ) <= 100
        );
      });

      if (covered.length > bestCovered.length) {
        bestCenterIndex = centerIndex;
        bestCovered = covered;
      }
    }

    if (bestCenterIndex === null) break;

    const center = candidates[bestCenterIndex];
    const coveredListings = bestCovered.map((index) => candidates[index]);
    recommendations.push({
      market: [center.city, center.state].filter(Boolean).join(", ") || center.zip,
      zip: center.zip,
      latitude: center.latitude,
      longitude: center.longitude,
      coverageCount: coveredListings.length,
      states: Array.from(
        new Set(
          coveredListings
            .map((listing) => String(listing.state || "").trim())
            .filter(Boolean),
        ),
      ),
      vins: coveredListings
        .map((listing) => String(listing.vin || "").trim())
        .filter(Boolean),
    });

    bestCovered.forEach((index) => remaining.delete(index));
  }

  return recommendations;
}

export async function POST(request: Request) {
  const apiKey = process.env.AUTODEV_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing AUTODEV_API_KEY server environment variable." },
      { status: 500 },
    );
  }

  const body = await request.json();
  const year = toNumber(body.year);
  const make = String(body.make || "").trim();
  const model = String(body.model || "").trim();
  const trim = String(body.trim || "").trim();

  if (!year || !make || !model) {
    return NextResponse.json(
      { error: "Year, make, and model are required for national discovery." },
      { status: 400 },
    );
  }

  const generation = findGenerationCompRule({
    year,
    make,
    model,
    trim,
    bodyStyle: String(body.bodyStyle || "").trim(),
    bodyClass: String(body.bodyClass || "").trim(),
  });

  // Discovery starts with the target year +/- 1, bounded by the known
  // generation when one exists. This mirrors the successful TTS test and avoids
  // letting a long model generation swamp the free-plan 20-listing sample.
  const yearMin = generation
    ? Math.max(generation.startYear, year - 1)
    : Math.max(1900, year - 1);
  const yearMax = generation
    ? Math.min(generation.endYear, year + 1)
    : Math.min(2100, year + 1);

  const params = new URLSearchParams({
    "vehicle.make": make,
    "vehicle.model": model,
    "vehicle.year": yearMin === yearMax ? String(yearMin) : `${yearMin}-${yearMax}`,
    "retailListing.used": "true",
    includes: "total",
    limit: "20",
    sort: "updatedAt.desc",
  });

  const upstream = await fetch(`https://api.auto.dev/listings?${params.toString()}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  const raw = await upstream.text();
  let payload: any = null;

  try {
    payload = raw ? JSON.parse(raw) : null;
  } catch {
    payload = { message: raw };
  }

  if (!upstream.ok) {
    return NextResponse.json(
      {
        error: "Auto.dev national discovery failed.",
        status: upstream.status,
        details:
          typeof payload?.message === "string"
            ? payload.message
            : typeof payload?.error === "string"
              ? payload.error
              : undefined,
      },
      { status: upstream.status },
    );
  }

  const rows = Array.isArray(payload?.data) ? payload.data : [];

  const listings: AutoDevListing[] = rows.map((row: any) => {
    const vehicle = row?.vehicle || {};
    const retail = row?.retailListing || {};
    const location = Array.isArray(row?.location) ? row.location : [];

    return {
      vin: String(vehicle.vin || row?.vin || "").trim() || null,
      year: toNumber(vehicle.year),
      make: String(vehicle.make || "").trim() || null,
      model: String(vehicle.model || "").trim() || null,
      trim: String(vehicle.trim || "").trim() || null,
      drivetrain: String(vehicle.drivetrain || "").trim() || null,
      price: toNumber(retail.price),
      miles: toNumber(retail.miles ?? retail.mileage),
      dealer: String(retail.dealer || "").trim() || null,
      city: String(retail.city || "").trim() || null,
      state: String(retail.state || "").trim() || null,
      zip: String(retail.zip || "").trim() || null,
      url: String(retail.vdp || "").trim() || null,
      longitude: toNumber(location[0]),
      latitude: toNumber(location[1]),
    };
  });

  const byState = listings.reduce((acc: Record<string, number>, listing) => {
    const state = String(listing.state || "Unknown");
    acc[state] = (acc[state] || 0) + 1;
    return acc;
  }, {});

  return NextResponse.json({
    source: "auto.dev",
    role: "discovery-only",
    query: {
      year,
      make,
      model,
      trim: trim || null,
      yearMin,
      yearMax,
      generation: generation?.generation || null,
      sampleLimit: 20,
    },
    total: typeof payload?.total === "number" ? payload.total : listings.length,
    returned: listings.length,
    sampleCapped: typeof payload?.total === "number" && payload.total > listings.length,
    byState,
    recommendedMarkets: buildRecommendedMarkets(listings, 3),
    listings,
  });
}
