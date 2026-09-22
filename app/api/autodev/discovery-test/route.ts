import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function clampInteger(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

export async function GET(request: Request) {
  const apiKey = process.env.AUTODEV_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing AUTODEV_API_KEY server environment variable." },
      { status: 500 },
    );
  }

  const { searchParams } = new URL(request.url);
  const make = (searchParams.get("make") || "Audi").trim();
  const model = (searchParams.get("model") || "TTS").trim();
  const yearMin = clampInteger(searchParams.get("yearMin"), 2011, 1900, 2100);
  const yearMax = clampInteger(searchParams.get("yearMax"), 2013, yearMin, 2100);
  const limit = clampInteger(searchParams.get("limit"), 20, 1, 20);

  const params = new URLSearchParams({
    "vehicle.make": make,
    "vehicle.model": model,
    "vehicle.year": yearMin === yearMax ? String(yearMin) : `${yearMin}-${yearMax}`,
    "retailListing.used": "true",
    includes: "total",
    limit: String(limit),
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
        error: "Auto.dev request failed.",
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

  const listings = rows.map((row: any) => {
    const vehicle = row?.vehicle || {};
    const retail = row?.retailListing || {};

    return {
      vin: vehicle.vin || row?.vin || null,
      year: vehicle.year || null,
      make: vehicle.make || null,
      model: vehicle.model || null,
      trim: vehicle.trim || null,
      drivetrain: vehicle.drivetrain || null,
      price: retail.price || null,
      miles: retail.miles ?? retail.mileage ?? null,
      dealer: retail.dealer || null,
      city: retail.city || null,
      state: retail.state || null,
      zip: retail.zip || null,
      url: retail.vdp || null,
      updatedAt: row?.updatedAt || null,
    };
  });

  const byState = listings.reduce((acc: Record<string, number>, listing: any) => {
    const state = String(listing.state || "Unknown");
    acc[state] = (acc[state] || 0) + 1;
    return acc;
  }, {});

  return NextResponse.json({
    source: "auto.dev",
    query: {
      make,
      model,
      yearMin,
      yearMax,
      usedOnly: true,
      limit,
    },
    total: typeof payload?.total === "number" ? payload.total : null,
    returned: listings.length,
    byState,
    listings,
  });
}
