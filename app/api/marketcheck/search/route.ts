import { NextResponse } from "next/server";
import { defaultAssumptions } from "@/lib/assumptions";
import type { MarketComp } from "@/types/comps";

type MarketCheckListing = Record<string, any>;

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function calculateQualityScore({
  listing,
  searchYear,
}: {
  listing: MarketCheckListing;
  searchYear: number;
}) {
  const distance = toNumber(listing.dist ?? listing.distance);
  const mileage = toNumber(listing.miles ?? listing.mileage ?? listing.odometer);
  const year = toNumber(listing.build?.year ?? listing.year, searchYear);

  let score = 80;

  if (distance > 150) score -= 14;
  else if (distance > 100) score -= 10;
  else if (distance > 50) score -= 5;

  if (mileage > 100000) score -= 16;
  else if (mileage > 85000) score -= 10;
  else if (mileage > 75000) score -= 5;

  if (searchYear && year !== searchYear) score -= 10;

  if (!listing.price && !listing.list_price && !listing.msrp) score -= 20;

  return Math.max(40, Math.min(95, score));
}

function mapListingToComp({
  listing,
  index,
  searchYear,
  searchMake,
  searchModel,
}: {
  listing: MarketCheckListing;
  index: number;
  searchYear: number;
  searchMake: string;
  searchModel: string;
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
    included: index < 6,
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
}: {
  apiKey: string;
  year?: number;
  make: string;
  model?: string;
  zip: string;
  radius: number;
  rows: number;
  attemptName: string;
}) {
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

  const marketCheckUrl = `https://api.marketcheck.com/v2/search/car/active?${params.toString()}`;

  const response = await fetch(marketCheckUrl, {
    cache: "no-store",
  });

  const payload = await response.json();

  return {
    ok: response.ok,
    status: response.status,
    zip,
    attemptName,
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

export async function POST(request: Request) {
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
    const radius = Math.min(toNumber(body.radius, 100), 100);
    const rows = Math.min(toNumber(body.rows, 10), 25);
    const debug = Boolean(body.debug);

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

    const exactSearches = await Promise.all(
      zips.map((zip) =>
        searchMarketCheck({
          apiKey,
          year,
          make,
          model,
          zip,
          radius,
          rows,
          attemptName: "exact-year-make-model",
        })
      )
    );

    let searches = exactSearches;

    const exactRawCount = exactSearches.reduce(
      (sum, search) => sum + search.numFound,
      0
    );

    if (exactRawCount === 0) {
      const fallbackSearches = await Promise.all(
        zips.map((zip) =>
          searchMarketCheck({
            apiKey,
            make,
            model,
            zip,
            radius,
            rows,
            attemptName: "fallback-make-model",
          })
        )
      );

      searches = [...exactSearches, ...fallbackSearches];
    }

    const failedSearch = searches.find((search) => !search.ok);

    if (failedSearch) {
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
      })
    );

    const mappedNullCount = mapped.filter((comp) => !comp).length;

    const comps = mapped
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

    return NextResponse.json({
      search: {
        year,
        make,
        model,
        zips,
        radius,
        rows,
      },
      rawCount,
      totalListingsReturned: allListings.length,
      filteredOutMissingPriceOrMileage: mappedNullCount,
      comps,
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
    });
  } catch (error) {
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
