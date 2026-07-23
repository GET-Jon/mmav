import { NextResponse } from "next/server";
import { defaultAssumptions } from "@/lib/assumptions";
import type { MarketComp } from "@/types/comps";
import { findMarketCheckModelAliases } from "@/lib/marketcheck/model-aliases";
import {
  findGenerationCompRule,
  isInGenerationCompRange,
} from "@/lib/marketcheck/generation-comps";
import { findModelTaxonomyFallback } from "@/lib/marketcheck/model-taxonomy";

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

const MARKETCHECK_API_CONTROLS = {
  liveLookupEnabled: true,
  maxApiCallsPerSearch: 3,
  minUsableCompsToStop: 10,
  minInitialRegions: 2,
  hardStopOnRateLimit: true,
  includeSearchDiagnostics: true,
};

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

function normalizeFuelType(value: unknown) {
  const normalized = normalize(value)
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) {
    return "";
  }

  if (
    normalized.includes("plug in hybrid") ||
    normalized.includes("plug-in hybrid") ||
    normalized.includes("phev")
  ) {
    return "plug-in hybrid";
  }

  if (
    normalized.includes("electric") ||
    normalized === "ev" ||
    normalized.includes("battery")
  ) {
    return "electric";
  }

  if (normalized.includes("hybrid") || normalized.includes("hev")) {
    return "hybrid";
  }

  if (normalized.includes("diesel") || normalized.includes("tdi")) {
    return "diesel";
  }

  if (
    normalized.includes("gasoline") ||
    normalized.includes("gas") ||
    normalized.includes("petrol") ||
    normalized.includes("unleaded") ||
    normalized.includes("regular fuel") ||
    normalized.includes("premium fuel") ||
    normalized === "regular" ||
    normalized === "premium"
  ) {
    return "gasoline";
  }

  return normalized;
}

function getListingFuelType(listing: MarketCheckListing) {
  const build = listing.build || {};

  return normalizeFuelType(
    build.fuel_type ||
      build.fuelType ||
      build.fuel ||
      listing.fuel_type ||
      listing.fuelType ||
      listing.fuel ||
      listing.engine?.fuel_type ||
      listing.engine?.fuelType ||
      listing.engine?.fuel,
  );
}

function fuelTypesMatch({
  targetFuelType,
  listing,
}: {
  targetFuelType: string;
  listing: MarketCheckListing;
}) {
  const normalizedTargetFuelType = normalizeFuelType(targetFuelType);

  if (!normalizedTargetFuelType) {
    return true;
  }

  const listingFuelType = getListingFuelType(listing);

  if (!listingFuelType) {
    return false;
  }

  return listingFuelType === normalizedTargetFuelType;
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
  targetFuelType,
  targetMileage,
  zips,
  radius,
  rows,
}: {
  year: number;
  make: string;
  model: string;
  preferredTrim: string;
  targetFuelType: string;
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
    fuelType: normalizeFuelType(targetFuelType),
    targetMileage,
    zips: [...zips].map((zip) => String(zip).trim()).filter(Boolean),
    radius,
    rows,
    searchType: "used-active-comps",
    cacheVersion: "progressive-regions-low-confidence-v8-generation-comps",
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
  const mileage = toNumber(
    listing.miles ?? listing.mileage ?? listing.odometer,
  );
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

function getListingImageUrl(listing: MarketCheckListing) {
  const media = listing.media || {};

  const cachedPhotos = Array.isArray(media.photo_links_cached)
    ? media.photo_links_cached
    : [];

  const originalPhotos = Array.isArray(media.photo_links)
    ? media.photo_links
    : [];

  const fallbackPhotos = [
    listing.photo_url,
    listing.image_url,
    listing.primary_photo,
  ];

  const imageUrl = [...cachedPhotos, ...originalPhotos, ...fallbackPhotos].find(
    (value) => typeof value === "string" && /^https?:\/\//i.test(value.trim()),
  );

  return imageUrl ? imageUrl.trim() : null;
}

function mapListingToComp({
  listing,
  index,
  searchYear,
  searchMake,
  searchModel,
  targetMileage,
  preferredTrim,
  targetFuelType,
}: {
  listing: MarketCheckListing;
  index: number;
  searchYear: number;
  searchMake: string;
  searchModel: string;
  targetMileage: number;
  preferredTrim: string;
  targetFuelType: string;
}): MarketComp | null {
  const build = listing.build || {};

  if (
    targetFuelType &&
    !fuelTypesMatch({
      targetFuelType,
      listing,
    })
  ) {
    return null;
  }

  const askingPrice = toNumber(
    listing.price ?? listing.list_price ?? listing.msrp,
  );

  const mileage = toNumber(
    listing.miles ?? listing.mileage ?? listing.odometer,
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
    region: String(listing.__searchRegion || ""),
    regionZip: String(listing.__searchZip || ""),
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
    imageUrl: getListingImageUrl(listing),
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
    photo_links_cached: "true",
    stats: "dom,d om_180,dom_active,dos_active".replace("d om", "dom"),
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
    listingCount: Array.isArray(payload?.listings)
      ? payload.listings.length
      : 0,
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

function buildFailedMarketCheckResponse({
  failedSearch,
  searches,
  orderedRegions,
  apiControls,
}: {
  failedSearch: MarketCheckSearchResult;
  searches: MarketCheckSearchResult[];
  orderedRegions: { market?: string; zip: string }[];
  apiControls: typeof MARKETCHECK_API_CONTROLS;
}) {
  const searchLog = searches.map((search) => {
    const region = orderedRegions.find(
      (orderedRegion) => orderedRegion.zip === search.zip,
    );

    return {
      attemptName: search.attemptName,
      market: region?.market || "",
      zip: search.zip,
      label: region ? `${region.market} (${region.zip})` : search.zip,
      ok: search.ok,
      status: search.status,
      apiCallMade: true,
      numFound: search.numFound,
      listingCount: search.listingCount,
      retryAfter: search.retryAfter,
      requested: search.requested,
    };
  });

  const apiUsage = {
    apiCallsMade: searches.length,
    cacheHit: false,
    stopReason:
      failedSearch.status === 429
        ? "Stopped immediately because MarketCheck returned a rate-limit response."
        : `Stopped because MarketCheck returned status ${failedSearch.status}.`,
    failedZip: failedSearch.zip,
    failedAttempt: failedSearch.attemptName,
    failedStatus: failedSearch.status,
    retryAfter: failedSearch.retryAfter,
    searchLog,
  };

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
        apiControls,
        apiUsage,
      },
      {
        status: 429,
        headers: failedSearch.retryAfter
          ? {
              "Retry-After": failedSearch.retryAfter,
            }
          : undefined,
      },
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
      apiControls,
      apiUsage,
    },
    {
      status: failedSearch.status,
    },
  );
}

function getStatNumber(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (!value || typeof value !== "object") {
    return 0;
  }

  const record = value as Record<string, unknown>;

  return toNumber(
    record.avg ??
      record.average ??
      record.mean ??
      record.median ??
      record.value,
  );
}

function getPayloadStat(payload: Record<string, any>, keys: string[]) {
  const stats = payload?.stats;

  if (!stats || typeof stats !== "object") {
    return 0;
  }

  for (const key of keys) {
    const value = getStatNumber((stats as Record<string, unknown>)[key]);

    if (value) {
      return value;
    }
  }

  return 0;
}

function averagePositive(values: number[]) {
  const positiveValues = values.filter((value) => value > 0);

  if (!positiveValues.length) {
    return 0;
  }

  return Math.round(
    positiveValues.reduce((sum, value) => sum + value, 0) /
      positiveValues.length,
  );
}

function getMarketTimingStats(searches: MarketCheckSearchResult[]) {
  const dealerDaysBySearch = searches.map((search) =>
    getPayloadStat(search.payload, ["dos_active", "dos", "days_on_site"]),
  );

  const marketDaysBySearch = searches.map((search) =>
    getPayloadStat(search.payload, [
      "dom_active",
      "dom_180",
      "dom",
      "days_on_market",
    ]),
  );

  return {
    averageDealerDays: averagePositive(dealerDaysBySearch),
    averageMarketDays: averagePositive(marketDaysBySearch),
  };
}

function getMarketTimingDebug(searches: MarketCheckSearchResult[]) {
  const firstPayload = searches[0]?.payload || {};
  const firstStats = firstPayload?.stats;
  const firstListing = Array.isArray(firstPayload?.listings)
    ? firstPayload.listings[0]
    : null;

  const listingKeys = firstListing ? Object.keys(firstListing) : [];
  const timingListingKeys = listingKeys.filter(
    (key) =>
      key.toLowerCase().includes("dom") ||
      key.toLowerCase().includes("dos") ||
      key.toLowerCase().includes("day"),
  );

  const statsKeys =
    firstStats && typeof firstStats === "object" ? Object.keys(firstStats) : [];

  return {
    statsKeys,
    statsSample: firstStats || null,
    timingListingKeys,
  };
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
        },
      );
    }

    const marketCheckApiKey = apiKey;

    const body = await request.json();

    const year = toNumber(body.year);
    const make = String(body.make || "").trim();
    const model = String(body.model || "").trim();
    const preferredTrim = String(body.trim || "").trim();
    const targetFuelType = String(
      body.fuelType ||
        body.targetFuelType ||
        body.decodedVehicle?.fuelType ||
        body.vehicle?.fuelType ||
        "",
    ).trim();
    const targetMileage = toNumber(
      body.targetMileage ?? body.mileage ?? body.odometer,
      0,
    );
    const radius = Math.min(toNumber(body.radius, 100), 100);
    const rows = Math.min(toNumber(body.rows, 10), 25);
    const debug = Boolean(body.debug);
    const reason = String(body.reason || "explicit-user-comp-search");

    const apiControls = {
      ...MARKETCHECK_API_CONTROLS,
      liveLookupEnabled:
        body.liveLookupEnabled === false
          ? false
          : MARKETCHECK_API_CONTROLS.liveLookupEnabled,
      maxApiCallsPerSearch: Math.max(
        1,
        Math.min(
          toNumber(
            body.maxApiCallsPerSearch,
            MARKETCHECK_API_CONTROLS.maxApiCallsPerSearch,
          ),
          10,
        ),
      ),
      minUsableCompsToStop: Math.max(
        1,
        Math.min(
          toNumber(
            body.minUsableCompsToStop,
            MARKETCHECK_API_CONTROLS.minUsableCompsToStop,
          ),
          50,
        ),
      ),
      minInitialRegions: Math.max(
        1,
        Math.min(
          toNumber(
            body.minInitialRegions,
            MARKETCHECK_API_CONTROLS.minInitialRegions,
          ),
          10,
        ),
      ),
    };

    const requestedRegions = Array.isArray(body.regions)
      ? body.regions
          .map((region: any, index: number) => ({
            market: String(region.market || `Region ${index + 1}`).trim(),
            zip: String(region.zip || "").trim(),
            order: toNumber(region.order, index + 1),
            enabled: region.enabled !== false,
          }))
          .filter(
            (region: { zip: string; enabled: boolean }) =>
              region.zip && region.enabled,
          )
      : [];

    const legacyRequestedRegions = Array.isArray(body.zips)
      ? body.zips
          .map((zip: unknown, index: number) => ({
            market: `Region ${index + 1}`,
            zip: String(zip).trim(),
            order: index + 1,
            enabled: true,
          }))
          .filter((region: { zip: string }) => region.zip)
      : [];

    const defaultRegions = defaultAssumptions.regionalMarkets
      .filter((market) => market.enabled)
      .map((market, index) => ({
        market: market.market,
        zip: market.zip,
        order: typeof market.order === "number" ? market.order : index + 1,
        enabled: market.enabled,
      }));

    const orderedRegions = (
      requestedRegions.length
        ? requestedRegions
        : legacyRequestedRegions.length
          ? legacyRequestedRegions
          : defaultRegions
    ).sort((a: { order: number }, b: { order: number }) => a.order - b.order);

    const zips = orderedRegions.map((region: { zip: string }) => region.zip);

    if (!make || !model) {
      return NextResponse.json(
        {
          error: "Make and model are required for MarketCheck search.",
        },
        {
          status: 400,
        },
      );
    }

    const generationCompRule = findGenerationCompRule({
      year,
      make,
      model,
      trim: preferredTrim,
    });

    if (!apiControls.liveLookupEnabled) {
      return NextResponse.json({
        error: "Live MarketCheck lookup is currently disabled by API controls.",
        apiControls,
        apiUsage: {
          apiCallsMade: 0,
          cacheHit: false,
          stopReason:
            "Live lookup disabled before any MarketCheck API request was made.",
          searchLog: [],
        },
        search: {
          year,
          make,
          model,
          preferredTrim,
          targetMileage,
          zips,
          regions: orderedRegions,
          radius,
          rows,
          generationFilter: generationCompRule,
        },
        comps: [],
      });
    }

    const searchKey = makeStableSearchKey({
      year,
      make,
      model,
      preferredTrim,
      targetFuelType,
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
        apiControls,
        apiUsage: {
          ...(cached.payload.apiUsage || {}),
          cacheHit: true,
          apiCallsMade: 0,
          stopReason:
            "Returned cached MarketCheck response. No live API call was made.",
        },
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
        generationFilter: generationCompRule,
      },
    });

    const MIN_USABLE_COMPS = apiControls.minUsableCompsToStop;
    const MIN_INITIAL_REGIONS = Math.min(
      apiControls.minInitialRegions,
      zips.length,
    );

    function buildCompSummary(currentSearches: MarketCheckSearchResult[]) {
      const allListings = currentSearches.flatMap(
        (search): MarketCheckListing[] => {
          const region = orderedRegions.find(
            (orderedRegion: { zip: string }) =>
              orderedRegion.zip === search.zip,
          );

          const listings = Array.isArray(search.payload.listings)
            ? search.payload.listings
            : [];

          return listings.map((listing: MarketCheckListing) => ({
            ...listing,
            __searchZip: search.zip,
            __searchRegion: region?.market || "",
          }));
        },
      );

      const rawCount = currentSearches.reduce(
        (sum, search) => sum + search.numFound,
        0,
      );

      const seen = new Set<string>();

      const mapped = allListings.map(
        (listing: MarketCheckListing, index: number) =>
          mapListingToComp({
            listing,
            index,
            searchYear: year,
            searchMake: make,
            searchModel: model,
            targetMileage,
            preferredTrim,
            targetFuelType,
          }),
      );

      const mappedNullCount = mapped.filter((comp) => !comp).length;

      const minimumQualityScore =
        defaultAssumptions.compSettings.minimumQualityScore;

      const listingDiagnostics = allListings.map(
        (listing: MarketCheckListing, index) => {
          const build = listing.build || {};
          const askingPrice = toNumber(
            listing.price ?? listing.list_price ?? listing.msrp,
          );
          const mileage = toNumber(
            listing.miles ?? listing.mileage ?? listing.odometer,
          );

          const rejectedReasons: string[] = [];

          if (
            targetFuelType &&
            !fuelTypesMatch({
              targetFuelType,
              listing,
            })
          ) {
            rejectedReasons.push("fuel mismatch");
          }

          if (!askingPrice || !mileage) {
            rejectedReasons.push("missing price or mileage");
          }

          const mappedComp = mapped[index];

          if (
            mappedComp &&
            generationCompRule &&
            !isInGenerationCompRange({
              year: mappedComp.year,
              generationRule: generationCompRule,
            })
          ) {
            rejectedReasons.push("generation mismatch");
          }

          if (mappedComp && mappedComp.qualityScore < minimumQualityScore) {
            rejectedReasons.push("quality below threshold");
          }

          return {
            title: String(
              listing.heading ||
                listing.title ||
                listing.vdp_url ||
                listing.vin ||
                "Untitled listing",
            ),
            year: build.year ?? listing.year ?? "",
            make: build.make ?? listing.make ?? "",
            model: build.model ?? listing.model ?? "",
            trim: build.trim ?? listing.trim ?? "",
            fuelType:
              getListingFuelType(listing) ||
              build.fuel_type ||
              build.fuel ||
              listing.fuel_type ||
              listing.fuel ||
              "",
            price: askingPrice,
            mileage,
            rejectedReasons,
          };
        },
      );

      const generationFiltered = mapped.filter((comp) => {
        if (!comp || !generationCompRule) {
          return true;
        }

        return isInGenerationCompRange({
          year: comp.year,
          generationRule: generationCompRule,
        });
      });

      const deduped = generationFiltered.filter(Boolean).filter((comp) => {
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

        return (
          Math.abs(a.mileage - targetMileage) -
          Math.abs(b.mileage - targetMileage)
        );
      });

      const scoredComps = rankedComps.map((comp, index) => ({
        ...comp,
        included: index < 6 && comp.qualityScore >= minimumQualityScore,
      }));

      const hasAutoIncludedComps = scoredComps.some((comp) => comp.included);
      const lowConfidenceFallback =
        scoredComps.length > 0 && !hasAutoIncludedComps;

      const comps = lowConfidenceFallback
        ? scoredComps.map((comp, index) => ({
            ...comp,
            included: index < 3,
          }))
        : scoredComps;

      const usableListings = comps.filter(
        (comp) => comp.qualityScore >= minimumQualityScore,
      ).length;

      const rejectionCounts = listingDiagnostics.reduce(
        (counts, listing) => {
          if (!listing.rejectedReasons.length) {
            return counts;
          }

          for (const reason of listing.rejectedReasons) {
            if (reason === "fuel mismatch") {
              counts.fuelMismatch += 1;
            } else if (reason === "missing price or mileage") {
              counts.missingPriceOrMileage += 1;
            } else if (reason === "quality below threshold") {
              counts.qualityBelowThreshold += 1;
            } else if (reason === "generation mismatch") {
              counts.generationMismatch += 1;
            } else {
              counts.other += 1;
            }
          }

          return counts;
        },
        {
          fuelMismatch: 0,
          missingPriceOrMileage: 0,
          qualityBelowThreshold: 0,
          generationMismatch: 0,
          other: 0,
        },
      );

      const sampleRejectedListings = listingDiagnostics
        .filter((listing) => listing.rejectedReasons.length)
        .slice(0, 3);

      return {
        allListings,
        rawCount,
        mappedNullCount,
        comps,
        lowConfidenceFallback,
        minimumQualityScore,
        filterDiagnostics: {
          returnedListings: allListings.length,
          mappedListings: mapped.length - mappedNullCount,
          usableListings,
          rejectedListings: Math.max(0, allListings.length - usableListings),
          rejectionCounts,
          sampleRejectedListings,
          generationFilter: generationCompRule,
        },
      };
    }

    async function runProgressiveRegionSearches({
      attemptName,
      attemptYear,
      attemptModel,
      maxApiCallsOverride,
      reserveOneCallWhenNoResults,
    }: {
      attemptName: string;
      attemptYear?: number;
      attemptModel?: string;
      maxApiCallsOverride?: number;
      reserveOneCallWhenNoResults?: boolean;
    }) {
      const progressiveSearches: MarketCheckSearchResult[] = [];

      for (let regionIndex = 0; regionIndex < zips.length; regionIndex += 1) {
        if (
          progressiveSearches.length >=
          (maxApiCallsOverride ?? apiControls.maxApiCallsPerSearch)
        ) {
          break;
        }

        const zip = zips[regionIndex];

        const result = await searchMarketCheck({
          apiKey: marketCheckApiKey,
          year: attemptYear,
          make,
          model: attemptModel ?? model,
          zip,
          radius,
          rows,
          attemptName,
          searchKey,
          reason,
        });

        progressiveSearches.push(result);

        if (!result.ok) {
          break;
        }

        const summary = buildCompSummary(progressiveSearches);
        const searchedMinimumRegions = regionIndex + 1 >= MIN_INITIAL_REGIONS;
        const effectiveApiCallCap =
          maxApiCallsOverride ?? apiControls.maxApiCallsPerSearch;
        const shouldReserveFallbackCall =
          reserveOneCallWhenNoResults &&
          effectiveApiCallCap > 1 &&
          summary.rawCount === 0 &&
          progressiveSearches.length >= effectiveApiCallCap - 1;

        if (shouldReserveFallbackCall) {
          break;
        }

        if (
          searchedMinimumRegions &&
          summary.comps.length >= MIN_USABLE_COMPS
        ) {
          break;
        }
      }

      return progressiveSearches;
    }

    const exactSearches = await runProgressiveRegionSearches({
      attemptName: generationCompRule
        ? `generation-aware-make-model-${generationCompRule.generation}`
        : "exact-year-make-model",
      attemptYear: generationCompRule ? undefined : year,
      reserveOneCallWhenNoResults: true,
    });

    const failedExactSearch = exactSearches.find((search) => !search.ok);

    if (failedExactSearch) {
      return buildFailedMarketCheckResponse({
        failedSearch: failedExactSearch,
        searches: exactSearches,
        orderedRegions,
        apiControls,
      });
    }

    let searches = exactSearches;

    const exactSummary = buildCompSummary(exactSearches);

    if (exactSummary.rawCount === 0) {
      const modelAliases = findMarketCheckModelAliases({ make, model });

      for (const aliasModel of modelAliases) {
        const remainingAliasApiCalls = Math.max(
          0,
          apiControls.maxApiCallsPerSearch - searches.length,
        );

        if (remainingAliasApiCalls <= 0) {
          break;
        }

        const aliasSearches = await runProgressiveRegionSearches({
          attemptName: `fallback-model-alias-${aliasModel}`,
          attemptModel: aliasModel,
          maxApiCallsOverride: remainingAliasApiCalls,
        });

        const failedAliasSearch = aliasSearches.find((search) => !search.ok);

        if (failedAliasSearch) {
          return buildFailedMarketCheckResponse({
            failedSearch: failedAliasSearch,
            searches: [...searches, ...aliasSearches],
            orderedRegions,
            apiControls,
          });
        }

        searches = [...searches, ...aliasSearches];

        const aliasSummary = buildCompSummary(searches);

        if (aliasSummary.rawCount > 0) {
          break;
        }
      }

      const aliasSummary = buildCompSummary(searches);

      if (aliasSummary.rawCount === 0) {
        const taxonomyFallback = findModelTaxonomyFallback({ make, model });

        if (taxonomyFallback) {
          const remainingTaxonomyApiCalls = Math.max(
            0,
            apiControls.maxApiCallsPerSearch - searches.length,
          );

          if (remainingTaxonomyApiCalls > 0) {
            const taxonomySearches = await runProgressiveRegionSearches({
              attemptName: `fallback-taxonomy-${taxonomyFallback.fallbackModel}`,
              attemptModel: taxonomyFallback.fallbackModel,
              maxApiCallsOverride: remainingTaxonomyApiCalls,
            });

            const failedTaxonomySearch = taxonomySearches.find(
              (search) => !search.ok,
            );

            if (failedTaxonomySearch) {
              return buildFailedMarketCheckResponse({
                failedSearch: failedTaxonomySearch,
                searches: [...searches, ...taxonomySearches],
                orderedRegions,
                apiControls,
              });
            }

            searches = [...searches, ...taxonomySearches];
          }
        }
      }

      const aliasAndTaxonomySummary = buildCompSummary(searches);

      if (aliasAndTaxonomySummary.rawCount === 0) {
        const remainingApiCalls = Math.max(
          0,
          apiControls.maxApiCallsPerSearch - searches.length,
        );

        const fallbackSearches =
          remainingApiCalls > 0
            ? await runProgressiveRegionSearches({
                attemptName: "fallback-make-model",
                maxApiCallsOverride: remainingApiCalls,
              })
            : [];

        const failedFallbackSearch = fallbackSearches.find(
          (search) => !search.ok,
        );

        if (failedFallbackSearch) {
          return buildFailedMarketCheckResponse({
            failedSearch: failedFallbackSearch,
            searches: searches.length
              ? [...searches, ...fallbackSearches]
              : fallbackSearches,
            orderedRegions,
            apiControls,
          });
        }

        searches = [...searches, ...fallbackSearches];
      }
    }

    const {
      allListings,
      rawCount,
      mappedNullCount,
      comps,
      lowConfidenceFallback,
      minimumQualityScore,
      filterDiagnostics,
    } = buildCompSummary(searches);

    const searchLog = searches.map((search, index) => {
      const region = orderedRegions.find(
        (orderedRegion: { zip: string; market?: string }) =>
          orderedRegion.zip === search.zip,
      );

      const individualSummary = buildCompSummary([search]);
      const cumulativeSummary = buildCompSummary(searches.slice(0, index + 1));

      const usableComps = individualSummary.comps.filter(
        (comp) => comp.qualityScore >= minimumQualityScore,
      ).length;

      const cumulativeUsableComps = cumulativeSummary.comps.filter(
        (comp) => comp.qualityScore >= minimumQualityScore,
      ).length;

      return {
        attemptName: search.attemptName,
        market: region?.market || "",
        zip: search.zip,
        label: region ? `${region.market} (${region.zip})` : search.zip,
        ok: search.ok,
        status: search.status,
        apiCallMade: true,
        numFound: search.numFound,
        listingCount: search.listingCount,
        usableComps,
        cumulativeUsableComps,
        requested: search.requested,
      };
    });

    const usableCompCount = comps.filter(
      (comp) => comp.qualityScore >= minimumQualityScore,
    ).length;

    const hitApiCallCap = searches.length >= apiControls.maxApiCallsPerSearch;

    const stopReason = searches.some((search) => !search.ok)
      ? "Stopped because a MarketCheck request failed."
      : hitApiCallCap && usableCompCount < MIN_USABLE_COMPS
        ? `Stopped after reaching the API-call cap of ${apiControls.maxApiCallsPerSearch}.`
        : rawCount === 0
          ? "Checked configured regions and no MarketCheck listings were returned."
          : usableCompCount >= MIN_USABLE_COMPS
            ? `Stopped after finding ${usableCompCount} usable comps.`
            : "Checked all required configured regions for this search.";

    const marketTiming = getMarketTimingStats(searches);
    const marketTimingDebug = getMarketTimingDebug(searches);

    const responsePayload = {
      search: {
        year,
        make,
        model,
        preferredTrim,
        targetFuelType,
        targetMileage,
        zips,
        regions: orderedRegions,
        regionsChecked: searches.map((search) => {
          const region = orderedRegions.find(
            (orderedRegion: { zip: string; market?: string }) =>
              orderedRegion.zip === search.zip,
          );

          return region ? `${region.market} (${region.zip})` : search.zip;
        }),
        radius,
        rows,
        generationFilter: generationCompRule,
      },
      rawCount,
      totalListingsReturned: allListings.length,
      filteredOutMissingPriceOrMileage: mappedNullCount,
      lowConfidenceFallback,
      minimumQualityScore,
      apiControls,
      apiUsage: {
        apiCallsMade: searches.length,
        cacheHit: false,
        stopReason,
        usableCompCount,
        searchLog,
        filterDiagnostics,
        marketTiming,
        marketTimingDebug,
      },
      apiCallsMade: searches.length,
      usableCompCount,
      stopReason,
      searchLog,
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
      },
    );
  }
}
