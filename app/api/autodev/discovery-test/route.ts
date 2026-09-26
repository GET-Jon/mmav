import { NextResponse } from "next/server";
import { recordApiUsageEvent } from "@/lib/observability/api-usage";

export const dynamic = "force-dynamic";

function clampInteger(value: string | null, fallback: number, min: number, max: number) {
  if (value === null || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

export async function GET(request: Request) {
  const startedAt = Date.now();
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
    await recordApiUsageEvent({
      provider: "auto_dev",
      endpoint: "/listings",
      vehicleYear: yearMin === yearMax ? yearMin : null,
      vehicleMake: make,
      vehicleModel: model,
      apiCallsMade: 1,
      status: upstream.status,
      stopReason: "Auto.dev discovery test failed.",
      metadata: { durationMs: Date.now() - startedAt, feature: "discovery_test", failed: true, yearMin, yearMax },
    });
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

  await recordApiUsageEvent({
    provider: "auto_dev",
    endpoint: "/listings",
    vehicleYear: yearMin === yearMax ? yearMin : null,
    vehicleMake: make,
    vehicleModel: model,
    apiCallsMade: 1,
    status: upstream.status,
    stopReason: "Auto.dev discovery test completed.",
    metadata: {
      durationMs: Date.now() - startedAt,
      feature: "discovery_test",
      yearMin,
      yearMax,
      returned: listings.length,
      total: typeof payload?.total === "number" ? payload.total : null,
    },
  });

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
