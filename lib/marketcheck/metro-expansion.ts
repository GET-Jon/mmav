import type { RegionalMarket } from "@/types/assumptions";

type MetroSeed = {
  market: string;
  zip: string;
  lat: number;
  lon: number;
};

export type ExpansionMarket = RegionalMarket & {
  source: "configured" | "metro";
  distanceMiles?: number;
};

const metroSeeds: MetroSeed[] = [
  { market: "Charleston, SC", zip: "29401", lat: 32.7765, lon: -79.9311 },
  { market: "Myrtle Beach, SC", zip: "29577", lat: 33.6891, lon: -78.8867 },
  { market: "Columbia, SC", zip: "29201", lat: 34.0007, lon: -81.0348 },
  { market: "Greenville, SC", zip: "29601", lat: 34.8526, lon: -82.3940 },
  { market: "Savannah, GA", zip: "31401", lat: 32.0809, lon: -81.0912 },
  { market: "Augusta, GA", zip: "30901", lat: 33.4735, lon: -82.0105 },
  { market: "Atlanta, GA", zip: "30303", lat: 33.7490, lon: -84.3880 },
  { market: "Macon, GA", zip: "31201", lat: 32.8407, lon: -83.6324 },
  { market: "Charlotte, NC", zip: "28202", lat: 35.2271, lon: -80.8431 },
  { market: "Wilmington, NC", zip: "28401", lat: 34.2257, lon: -77.9447 },
  { market: "Raleigh, NC", zip: "27601", lat: 35.7796, lon: -78.6382 },
  { market: "Greensboro, NC", zip: "27401", lat: 36.0726, lon: -79.7920 },
  { market: "Asheville, NC", zip: "28801", lat: 35.5951, lon: -82.5515 },
  { market: "Jacksonville, FL", zip: "32202", lat: 30.3322, lon: -81.6557 },
  { market: "Orlando, FL", zip: "32801", lat: 28.5383, lon: -81.3792 },
  { market: "Tampa, FL", zip: "33602", lat: 27.9506, lon: -82.4572 },
  { market: "Miami, FL", zip: "33130", lat: 25.7617, lon: -80.1918 },
  { market: "Tallahassee, FL", zip: "32301", lat: 30.4383, lon: -84.2807 },
  { market: "Richmond, VA", zip: "23219", lat: 37.5407, lon: -77.4360 },
  { market: "Virginia Beach, VA", zip: "23451", lat: 36.8529, lon: -75.9780 },
  { market: "Roanoke, VA", zip: "24011", lat: 37.2709, lon: -79.9414 },
  { market: "Washington, DC", zip: "20001", lat: 38.9072, lon: -77.0369 },
  { market: "Baltimore, MD", zip: "21201", lat: 39.2904, lon: -76.6122 },
  { market: "Nashville, TN", zip: "37201", lat: 36.1627, lon: -86.7816 },
  { market: "Knoxville, TN", zip: "37902", lat: 35.9606, lon: -83.9207 },
  { market: "Chattanooga, TN", zip: "37402", lat: 35.0456, lon: -85.3097 },
  { market: "Birmingham, AL", zip: "35203", lat: 33.5186, lon: -86.8104 },
  { market: "Huntsville, AL", zip: "35801", lat: 34.7304, lon: -86.5861 },
  { market: "Montgomery, AL", zip: "36104", lat: 32.3668, lon: -86.3000 },
  { market: "Mobile, AL", zip: "36602", lat: 30.6954, lon: -88.0399 },
  { market: "New Orleans, LA", zip: "70112", lat: 29.9511, lon: -90.0715 },
  { market: "Baton Rouge, LA", zip: "70801", lat: 30.4515, lon: -91.1871 },
  { market: "Jackson, MS", zip: "39201", lat: 32.2988, lon: -90.1848 },
  { market: "Louisville, KY", zip: "40202", lat: 38.2527, lon: -85.7585 },
  { market: "Lexington, KY", zip: "40507", lat: 38.0406, lon: -84.5037 },
  { market: "Cincinnati, OH", zip: "45202", lat: 39.1031, lon: -84.5120 },
  { market: "Columbus, OH", zip: "43215", lat: 39.9612, lon: -82.9988 },
  { market: "Cleveland, OH", zip: "44114", lat: 41.4993, lon: -81.6944 },
  { market: "Pittsburgh, PA", zip: "15222", lat: 40.4406, lon: -79.9959 },
  { market: "Philadelphia, PA", zip: "19107", lat: 39.9526, lon: -75.1652 },
  { market: "New York, NY", zip: "10001", lat: 40.7128, lon: -74.0060 },
  { market: "Boston, MA", zip: "02108", lat: 42.3601, lon: -71.0589 },
  { market: "Hartford, CT", zip: "06103", lat: 41.7658, lon: -72.6734 },
  { market: "Buffalo, NY", zip: "14202", lat: 42.8864, lon: -78.8784 },
  { market: "Detroit, MI", zip: "48226", lat: 42.3314, lon: -83.0458 },
  { market: "Grand Rapids, MI", zip: "49503", lat: 42.9634, lon: -85.6681 },
  { market: "Indianapolis, IN", zip: "46204", lat: 39.7684, lon: -86.1581 },
  { market: "Chicago, IL", zip: "60601", lat: 41.8781, lon: -87.6298 },
  { market: "Milwaukee, WI", zip: "53202", lat: 43.0389, lon: -87.9065 },
  { market: "Minneapolis, MN", zip: "55401", lat: 44.9778, lon: -93.2650 },
  { market: "St. Louis, MO", zip: "63101", lat: 38.6270, lon: -90.1994 },
  { market: "Kansas City, MO", zip: "64106", lat: 39.0997, lon: -94.5786 },
  { market: "Little Rock, AR", zip: "72201", lat: 34.7465, lon: -92.2896 },
  { market: "Memphis, TN", zip: "38103", lat: 35.1495, lon: -90.0490 },
  { market: "Oklahoma City, OK", zip: "73102", lat: 35.4676, lon: -97.5164 },
  { market: "Tulsa, OK", zip: "74103", lat: 36.1540, lon: -95.9928 },
  { market: "Dallas, TX", zip: "75201", lat: 32.7767, lon: -96.7970 },
  { market: "Fort Worth, TX", zip: "76102", lat: 32.7555, lon: -97.3308 },
  { market: "Austin, TX", zip: "78701", lat: 30.2672, lon: -97.7431 },
  { market: "San Antonio, TX", zip: "78205", lat: 29.4241, lon: -98.4936 },
  { market: "Houston, TX", zip: "77002", lat: 29.7604, lon: -95.3698 },
  { market: "Denver, CO", zip: "80202", lat: 39.7392, lon: -104.9903 },
  { market: "Colorado Springs, CO", zip: "80903", lat: 38.8339, lon: -104.8214 },
  { market: "Albuquerque, NM", zip: "87102", lat: 35.0844, lon: -106.6504 },
  { market: "Phoenix, AZ", zip: "85004", lat: 33.4484, lon: -112.0740 },
  { market: "Tucson, AZ", zip: "85701", lat: 32.2226, lon: -110.9747 },
  { market: "Las Vegas, NV", zip: "89101", lat: 36.1699, lon: -115.1398 },
  { market: "Salt Lake City, UT", zip: "84101", lat: 40.7608, lon: -111.8910 },
  { market: "Boise, ID", zip: "83702", lat: 43.6150, lon: -116.2023 },
  { market: "Los Angeles, CA", zip: "90012", lat: 34.0522, lon: -118.2437 },
  { market: "San Diego, CA", zip: "92101", lat: 32.7157, lon: -117.1611 },
  { market: "San Francisco, CA", zip: "94103", lat: 37.7749, lon: -122.4194 },
  { market: "Sacramento, CA", zip: "95814", lat: 38.5816, lon: -121.4944 },
  { market: "San Jose, CA", zip: "95113", lat: 37.3382, lon: -121.8863 },
  { market: "Portland, OR", zip: "97205", lat: 45.5152, lon: -122.6784 },
  { market: "Seattle, WA", zip: "98101", lat: 47.6062, lon: -122.3321 },
  { market: "Spokane, WA", zip: "99201", lat: 47.6588, lon: -117.4260 },
];

function normalizeMarketName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function haversineMiles(a: MetroSeed, b: MetroSeed) {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const earthRadiusMiles = 3958.8;
  const dLat = toRadians(b.lat - a.lat);
  const dLon = toRadians(b.lon - a.lon);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadiusMiles * Math.asin(Math.sqrt(h));
}

function findSeedByMarketLabel(value: string) {
  const normalized = normalizeMarketName(value.replace(/\(\d{5}\)/g, " "));
  if (!normalized) return null;

  return (
    metroSeeds.find((seed) => {
      const seedName = normalizeMarketName(seed.market);
      const seedCity = seedName.split(" ").slice(0, -1).join(" ");
      return normalized.includes(seedName) || normalized.includes(seedCity);
    }) || null
  );
}

function getSearchedSeeds(searchedZips: string[], searchedRegions: string[]) {
  const seeds = [
    ...searchedZips.map((zip) => metroSeeds.find((seed) => seed.zip === zip) || null),
    ...searchedRegions.map((region) => findSeedByMarketLabel(region)),
  ].filter(Boolean) as MetroSeed[];

  return Array.from(new Map(seeds.map((seed) => [seed.zip, seed])).values());
}

function findAnchor(
  configured: RegionalMarket[],
  searchedZips: string[],
  searchedRegions: string[],
) {
  const searchedSeeds = getSearchedSeeds(searchedZips, searchedRegions);
  if (searchedSeeds.length) return searchedSeeds[0];

  for (const market of configured) {
    const exactZip = metroSeeds.find((seed) => seed.zip === market.zip);
    if (exactZip) return exactZip;

    const byName = findSeedByMarketLabel(market.market);
    if (byName) return byName;
  }

  return metroSeeds[0];
}

export function buildExpansionMarkets(
  configuredMarkets: RegionalMarket[],
  searchedZips: string[] = [],
  searchedRegions: string[] = [],
): ExpansionMarket[] {
  const configured = configuredMarkets
    .filter(
      (market) =>
        market.enabled && /^\d{5}$/.test(market.zip) && market.market.trim(),
    )
    .sort((a, b) => a.order - b.order);

  const anchor = findAnchor(configured, searchedZips, searchedRegions);
  const searchedSeeds = getSearchedSeeds(searchedZips, searchedRegions);
  const searchedZipSet = new Set(searchedZips);
  const configuredZips = new Set(configured.map((market) => market.zip));
  const configuredNames = new Set(
    configured.map((market) => normalizeMarketName(market.market)),
  );

  // MarketCheck's free/basic search radius is capped at 100 miles.
  // Two 100-mile circles need ~200 miles between centers to avoid materially
  // re-querying the same inventory. Expansion suggestions should therefore
  // prefer genuinely new coverage, not merely a new city label.
  const isFarEnoughFromSearched = (seed: MetroSeed) =>
    searchedSeeds.length === 0 ||
    searchedSeeds.every((searchedSeed) => haversineMiles(searchedSeed, seed) >= 200);

  const configuredForExpansion = configured.filter((market) => {
    if (searchedZipSet.has(market.zip)) return true;
    const seed =
      metroSeeds.find((candidate) => candidate.zip === market.zip) ||
      findSeedByMarketLabel(market.market);
    return !seed || isFarEnoughFromSearched(seed);
  });

  const seeded = metroSeeds
    .filter(
      (seed) =>
        !configuredZips.has(seed.zip) &&
        !configuredNames.has(normalizeMarketName(seed.market)) &&
        isFarEnoughFromSearched(seed),
    )
    .map((seed) => ({
      seed,
      distanceMiles: haversineMiles(anchor, seed),
    }))
    .sort((a, b) => a.distanceMiles - b.distanceMiles);

  return [
    ...configuredForExpansion.map((market) => ({
      ...market,
      source: "configured" as const,
    })),
    ...seeded.map(({ seed, distanceMiles }, index) => ({
      market: seed.market,
      zip: seed.zip,
      order: configured.length + index + 1,
      enabled: true,
      source: "metro" as const,
      distanceMiles: Math.round(distanceMiles),
    })),
  ];
}
