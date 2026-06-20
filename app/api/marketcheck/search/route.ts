import { NextResponse } from "next/server";
import { defaultAssumptions } from "@/lib/assumptions";
import type { MarketComp } from "@/types/comps";

type MarketCheckListing = Record<string, any>;

type MarketCheckSearchResult = {
  ok: boolean;
  status: number;
  zip: string;
  attemptName: string;
  retryAfter: string | null;
  requested: {
    year?: number;
    make: string;
    model?: string;
    zip: string;
    radius: number;
    rows: number;
  };
  numFound: number;
  listingCount: number;
  payload: Record<string, any>;
};

type CachedMarketCheckResponse = {
  createdAt: string;
  expiresAt: number;
  payload: Record<string, any>;
};

const CACHE_TTL_MS = 30 * 60 * 1000;
const MIN_MARKETCHECK_INTERVAL_MS = 350;

const globalForMarketCheck = globalThis as typeof globalThis & {
  __marketCheckSearchCache?: Map<string, CachedMarketCheckResponse>;
  __marketCheckLastRequestAt?: number;
};

const marketCheckSearchCache =
  globalForMarketCheck.__marketCheckSearchCache ||
  new Map<string, CachedMarketCheckResponse>();

globalForMarketCheck.__marketCheckSearchCache = marketCheckSearchCache;

if (typeof globalForMarketCheck.__marketCheckLastRequestAt !== "number") {
  globalForMarketCheck.__marketCheckLastRequestAt = 0;
}

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalize(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForMarketCheckSlot() {
  const lastRequestAt = globalForMarketCheck.__marketCheckLastRequestAt || 0;
  const elapsed = Date.now() - lastRequestAt;
  const waitMs = Math.max(0, MIN_MARKETCHECK_INTERVAL_MS - elapsed);

  if (waitMs > 0) {
    await wait(waitMs);
  }

  globalForMarketCheck.__marketCheckLastRequestAt = Date.now();
}

function makeStableSearchKey({
  year,
  make,
  model,
  preferredTrim,
  targetMileage,
  zips,
  radius,
  rows,
}: {
  year: number;
  make: string;
  model: string;
  preferredTrim: string;
  targetMileage: number;
  zips: string[];
  radius: number;
  rows: number;
}) {
  return JSON.stringify({
    year,
    make: normalize(make),
    model: normalize(model),
    trim: normalize(preferredTrim),
    targetMileage,
    zips: [...zips].map((zip) => String(zip).trim()).filter(Boolean).sort(),
    radius,
    rows,
    searchType: "used-active-comps",
  });
}

function logMarketCheckCall({
  endpoint,
  searchKey,
  cacheHit,
  reason,
  details = {},
}: {
  endpoint: string;
  searchKey: string;
  cacheHit: boolean;
  reason: string;
  details?: Record<string, unknown>;
}) {
  console.info("[MarketCheck]", {
    endpoint,
    searchKey,
    timestamp: new Date().toISOString(),
    cacheHit,
    reason,
    ...details,
  });
}

function getCachedResponse(searchKey: string) {
  const cached = marketCheckSearchCache.get(searchKey);

  if (!cached) {
    return null;
  }

  if (Date.now() > cached.expiresAt) {
    marketCheckSearchCache.delete(searchKey);
    return null;
  }

  return cached;
}

function setCachedResponse(searchKey: string, payload: Record<string, any>) {
  marketCheckSearchCache.set(searchKey, {
    createdAt: new Date().toISOString(),
    expiresAt: Date.now() + CACHE_TTL_MS,
    payload,
  });
}

function trimMatches({
  listingTrim,
  preferredTrim,
}: {
  listingTrim: string;
  preferredTrim: string;
}) {
  const listing = normalize(listingTrim);
  const preferred = normalize(preferredTrim);

  if (!preferred || !listing) {
    return true;
  }

  return listing.includes(preferred) || preferred.includes(listing);
}

function calculateQualityScore({
  listing,
  searchYear,
  targetMileage,
  preferredTrim,
}: {
  listing: MarketCheckListing;
  searchYear: number;
  targetMileage: number;
  preferredTrim: string;
}) {
  const build = listing.build || {};

  const distance = toNumber(listing.dist ?? listing.distance);
  const mileage = toNumber(listing.miles ?? listing.mileage ?? listing.odometer);
  const year = toNumber(build.year ?? listing.year, searchYear);
  const listingTrim = String(build.trim || listing.trim || "");

  let score = 100;

  if (searchYear && year !== searchYear) {
    score -= 20;
  }

  if (preferredTrim && !trimMatches({ listingTrim, preferredTrim })) {
    score -= 10;
  }

  if (targetMileage && mileage) {
    const mileageDelta = Math.abs(mileage - targetMileage);
    score -= Math.min(24, Math.round(mileageDelta / 2500));
  } else {
    score -= 10;
  }

  if (distance) {
    score -= Math.min(16, Math.round(distance / 10));
  } else {
    score -= 3;
  }

  if (!listing.price && !listing.list_price && !listing.msrp) {
    score -= 20;
  }

  return Math.max(40, Math.min(100, score));
}

function mapListingToComp({
  listing,
  index,
  searchYear,
  searchMake,
  searchModel,
  targetMileage,
  preferredTrim,
}: {
  listing: MarketCheckListing;
  index: number;
  searchYear: number;
  searchMake: string;
  searchModel: string;
  targetMileage: number;
  preferredTrim: string;
}): MarketComp | null {
  const build = listing.build || {};

  const askingPrice = toNumber(
    listing.price ?? listing.list_price ?? listing.msrp
  );

  const mileage = toNumber(
    listing.miles ?? listing.mileage ?? listing.odometer
  );

  if (!askingPrice || !mileage) {
    return null;
  }

  const make = build.make || searchMake;
  const model = build.model || searchModel;

  return {
    id: String(listing.id || listing.vin || `marketcheck-${index}`),
    included: false,
    source: "MarketCheck/API",
    distance: toNumber(listing.dist ?? listing.distance),
    year: toNumber(build.year ?? listing.year, searchYear),
    model: `${make} ${model}`.trim(),
    trim: build.trim || listing.trim || "",
    mileage,
    askingPrice,
    qualityScore: calculateQualityScore({
      listing,
      searchYear,
      targetMileage,
      preferredTrim,
    }),
  };
}

async function searchMarketCheck({
  apiKey,
  year,
  make,
  model,
  zip,
  radius,
  rows,
  attemptName,
  searchKey,
  reason,
}: {
  apiKey: string;
  year?: number;
  make: string;
  model?: string;
  zip: string;
  radius: number;
  rows: number;
  attemptName: string;
  searchKey: string;
  reason: string;
}): Promise<MarketCheckSearchResult> {
  const params = new URLSearchParams({
    api_key: apiKey,
    car_type: "used",
    make,
    zip,
    radius: String(radius),
    rows: String(rows),
  });

  if (year) {
    params.set("year", String(year));
  }

  if (model) {
    params.set("model", model);
  }

  const endpoint = "/v2/search/car/active";
  const marketCheckUrl = `https://api.marketcheck.com/v2/search/car/active?${params.toString()}`;

  await waitForMarketCheckSlot();

  logMarketCheckCall({
    endpoint,
    searchKey,
    cacheHit: false,
    reason,
    details: {
      attemptName,
      zip,
      year,
      make,
      model,
      radius,
      rows,
    },
  });

  const response = await fetch(marketCheckUrl, {
    cache: "no-store",
  });

  const rawPayload = await response.text();

  let payload: Record<string, any> = {};

  try {
    payload = rawPayload ? JSON.parse(rawPayload) : {};
  } catch {
    payload = {
      message: rawPayload,
    };
  }

  return {
    ok: response.ok,
    status: response.status,
    zip,
    attemptName,
    retryAfter: response.headers.get("retry-after"),
    requested: {
      year,
      make,
      model,
      zip,
      radius,
      rows,
    },
    numFound: toNumber(payload?.num_found),
    listingCount: Array.isArray(payload?.listings) ? payload.listings.length : 0,
    payload,
  };
}

async function runMarketCheckSearches({
  apiKey,
  year,
  make,
  model,
  zips,
  radius,
  rows,
  attemptName,
  searchKey,
  reason,
}: {
  apiKey: string;
  year?: number;
  make: string;
  model: string;
  zips: string[];
  radius: number;
  rows: number;
  attemptName: string;
  searchKey: string;
  reason: string;
}) {
  const searches: MarketCheckSearchResult[] = [];

  for (const zip of zips) {
    const result = await searchMarketCheck({
      apiKey,
      year,
      make,
      model,
      zip,
      radius,
      rows,
      attemptName,
      searchKey,
      reason,
    });

    searches.push(result);

    if (!result.ok) {
      break;
    }
  }

  return searches;
}

function buildFailedMarketCheckResponse(failedSearch: MarketCheckSearchResult) {
  if (failedSearch.status === 429) {
    const retryAfterSeconds = failedSearch.retryAfter
      ? Number(failedSearch.retryAfter)
      : null;

    return NextResponse.json(
      {
        error: retryAfterSeconds
          ? `MarketCheck rate limit hit. Wait ${retryAfterSeconds} seconds and try again.`
          : "MarketCheck rate limit hit. Wait a few seconds and try again.",
        failedZip: failedSearch.zip,
        failedAttempt: failedSearch.attemptName,
        retryAfter: failedSearch.retryAfter,
      },
      {
        status: 429,
        headers: failedSearch.retryAfter
          ? {
              "Retry-After": failedSearch.retryAfter,
            }
          : undefined,
      }
    );
  }

  return NextResponse.json(
    {
      error:
        failedSearch.payload?.message ||
        failedSearch.payload?.error ||
        `MarketCheck failed with status ${failedSearch.status}.`,
      failedZip: failedSearch.zip,
      failedAttempt: failedSearch.attemptName,
    },
    {
      status: failedSearch.status,
    }
  );
}

export async function POST(request: Request) {
  const endpoint = "/api/marketcheck/search";

  try {
    const apiKey = process.env.MARKETCHECK_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            "Missing MARKETCHECK_API_KEY. Add it to .env.local and restart the dev server.",
        },
        {
          status: 500,
        }
      );
    }

    const body = await request.json();

    const year = toNumber(body.year);
    const make = String(body.make || "").trim();
    const model = String(body.model || "").trim();
    const preferredTrim = String(body.trim || "").trim();
    const targetMileage = toNumber(body.targetMileage);
    const radius = Math.min(toNumber(body.radius, 100), 100);
    const rows = Math.min(toNumber(body.rows, 10), 25);
    const debug = Boolean(body.debug);
    const reason = String(body.reason || "explicit-user-comp-search");

    const requestedZips = Array.isArray(body.zips)
      ? body.zips.map((zip: unknown) => String(zip).trim()).filter(Boolean)
      : [];

    const defaultZips = defaultAssumptions.regionalMarkets
      .filter((market) => market.enabled)
      .map((market) => market.zip);

    const zips = requestedZips.length ? requestedZips : defaultZips;

    if (!make || !model) {
      return NextResponse.json(
        {
          error: "Make and model are required for MarketCheck search.",
        },
        {
          status: 400,
        }
      );
    }

    const searchKey = makeStableSearchKey({
      year,
      make,
      model,
      preferredTrim,
      targetMileage,
      zips,
      radius,
      rows,
    });

    const cached = getCachedResponse(searchKey);

    if (cached) {
      logMarketCheckCall({
        endpoint,
        searchKey,
        cacheHit: true,
        reason,
        details: {
          cachedAt: cached.createdAt,
        },
      });

      return NextResponse.json({
        ...cached.payload,
        cache: {
          hit: true,
          searchKey,
          cachedAt: cached.createdAt,
          ttlMs: CACHE_TTL_MS,
        },
      });
    }

    logMarketCheckCall({
      endpoint,
      searchKey,
      cacheHit: false,
      reason,
      details: {
        zips,
        year,
        make,
        model,
        preferredTrim,
        targetMileage,
        radius,
        rows,
      },
    });

    const exactSearches = await runMarketCheckSearches({
      apiKey,
      year,
      make,
      model,
      zips,
      radius,
      rows,
      attemptName: "exact-year-make-model",
      searchKey,
      reason,
    });

    const failedExactSearch = exactSearches.find((search) => !search.ok);

    if (failedExactSearch) {
      return buildFailedMarketCheckResponse(failedExactSearch);
    }

    let searches = exactSearches;

    const exactRawCount = exactSearches.reduce(
      (sum, search) => sum + search.numFound,
      0
    );

    if (exactRawCount === 0) {
      const fallbackSearches = await runMarketCheckSearches({
        apiKey,
        make,
        model,
        zips,
        radius,
        rows,
        attemptName: "fallback-make-model",
        searchKey,
        reason,
      });

      const failedFallbackSearch = fallbackSearches.find((search) => !search.ok);

      if (failedFallbackSearch) {
        return buildFailedMarketCheckResponse(failedFallbackSearch);
      }

      searches = [...exactSearches, ...fallbackSearches];
    }

    const allListings = searches.flatMap((search) =>
      Array.isArray(search.payload.listings) ? search.payload.listings : []
    );

    const rawCount = searches.reduce((sum, search) => sum + search.numFound, 0);
    const seen = new Set<string>();

    const mapped = allListings.map((listing: MarketCheckListing, index: number) =>
      mapListingToComp({
        listing,
        index,
        searchYear: year,
        searchMake: make,
        searchModel: model,
        targetMileage,
        preferredTrim,
      })
    );

    const mappedNullCount = mapped.filter((comp) => !comp).length;

    const deduped = mapped
      .filter(Boolean)
      .filter((comp) => {
        const typedComp = comp as MarketComp;
        const key = typedComp.id;

        if (seen.has(key)) {
          return false;
        }

        seen.add(key);
        return true;
      }) as MarketComp[];

    const rankedComps = deduped.sort((a, b) => {
      if (b.qualityScore !== a.qualityScore) {
        return b.qualityScore - a.qualityScore;
      }

      if (a.distance !== b.distance) {
        return a.distance - b.distance;
      }

      return Math.abs(a.mileage - targetMileage) - Math.abs(b.mileage - targetMileage);
    });

    const comps = rankedComps.map((comp, index) => ({
      ...comp,
      included:
        index < 6 &&
        comp.qualityScore >= defaultAssumptions.compSettings.minimumQualityScore,
    }));

    const responsePayload = {
      search: {
        year,
        make,
        model,
        preferredTrim,
        targetMileage,
        zips,
        radius,
        rows,
      },
      rawCount,
      totalListingsReturned: allListings.length,
      filteredOutMissingPriceOrMileage: mappedNullCount,
      comps,
      cache: {
        hit: false,
        searchKey,
        ttlMs: CACHE_TTL_MS,
      },
      debug: debug
        ? {
            attempts: searches.map((search) => ({
              attemptName: search.attemptName,
              zip: search.zip,
              numFound: search.numFound,
              listingCount: search.listingCount,
              requested: search.requested,
            })),
            sampleListingKeys: allListings[0]
              ? Object.keys(allListings[0]).slice(0, 30)
              : [],
            sampleListing: allListings[0] || null,
          }
        : undefined,
    };

    setCachedResponse(searchKey, responsePayload);

    return NextResponse.json(responsePayload);
  } catch (error) {
    console.error("[MarketCheck] search route failed", {
      endpoint,
      timestamp: new Date().toISOString(),
      error,
    });

    return NextResponse.json(
      {
        error: "MarketCheck search failed.",
      },
      {
        status: 500,
      }
    );
  }
}
