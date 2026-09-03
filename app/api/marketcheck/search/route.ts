import { POST as runStrictMarketCheckSearch } from "./strict-search";

function normalizeIdentity(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalizeMercedesSearch(body: Record<string, unknown>) {
  const normalizedMake = normalizeIdentity(body.make);

  const isMercedes =
    normalizedMake === "mercedes" ||
    normalizedMake === "mercedes benz" ||
    normalizedMake === "mercedesbenz";

  if (!isMercedes) return body;

  return {
    ...body,
    make: "Mercedes-Benz",
  };
}

type RankedComp = {
  id?: string;
  included?: boolean;
  year?: number;
  mileage?: number;
  distance?: number;
  trim?: string;
  askingPrice?: number;
  qualityScore?: number;
  marketCheckDetails?: Record<string, unknown>;
  [key: string]: unknown;
};

type TargetIdentity = {
  year: number;
  make: string;
  model: string;
  trim: string;
  fuelType: string;
  mileage: number;
};

function hasValue(value: unknown) {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

function listingConfidence(comp: RankedComp) {
  const details = comp.marketCheckDetails || {};
  const usefulFields = [
    details.vin,
    comp.trim,
    details.drivetrain,
    details.fuelType,
    details.engine,
    details.listingUrl,
    details.dealerName,
    details.city,
    details.state,
    details.listingDate,
  ];
  const present = usefulFields.filter(hasValue).length;
  if (present >= 8) return "High";
  if (present >= 5) return "Medium";
  return "Low";
}

function yearPenalty(yearDelta: number) {
  if (yearDelta === 0) return 0;
  if (yearDelta === 1) return 6;
  if (yearDelta === 2) return 12;
  return Math.min(36, 24 + Math.max(0, yearDelta - 3) * 3);
}

function rerankByCompFit(payload: Record<string, unknown>, target: TargetIdentity) {
  if (!Array.isArray(payload.comps) || !target.year) return payload;

  const original = payload.comps as RankedComp[];
  const originalIncludedCount = original.filter((comp) => comp.included === true).length;

  const ranked = original.map((comp) => {
    const compYear = Number(comp.year || 0);
    const delta = compYear && target.year ? Math.abs(compYear - target.year) : 99;
    const currentScore = Number(comp.qualityScore || 40);
    const previousYearPenalty = delta === 0 ? 0 : 20;
    const fitScore = Math.max(
      30,
      Math.min(100, Math.round(currentScore + previousYearPenalty - yearPenalty(delta))),
    );

    const mileage = Number(comp.mileage || 0);
    const mileageDelta = target.mileage && mileage ? Math.abs(mileage - target.mileage) : null;
    const details = comp.marketCheckDetails || {};

    return {
      ...comp,
      qualityScore: fitScore,
      marketCheckDetails: {
        ...details,
        targetYear: target.year,
        targetMake: target.make,
        targetModel: target.model,
        targetTrim: target.trim,
        targetFuelType: target.fuelType,
        targetMileage: target.mileage,
        listingConfidence: listingConfidence(comp),
        compFitFactors: {
          yearDelta: delta === 99 ? null : delta,
          yearPreference:
            delta === 0
              ? "Exact model year"
              : delta === 1
                ? "Within 1 model year"
                : delta === 2
                  ? "Within 2 model years"
                  : `${delta} model years away`,
          yearPenalty: yearPenalty(delta),
          mileageDelta,
          distanceMiles: Number(comp.distance || 0),
          trimAvailable: Boolean(String(comp.trim || "").trim()),
          originalScore: currentScore,
        },
      },
    };
  });

  ranked.sort((a, b) => {
    const aDelta = Math.abs(Number(a.year || 0) - target.year);
    const bDelta = Math.abs(Number(b.year || 0) - target.year);
    const aPreferred = aDelta <= 2 ? 0 : 1;
    const bPreferred = bDelta <= 2 ? 0 : 1;

    if (aPreferred !== bPreferred) return aPreferred - bPreferred;
    if (Number(b.qualityScore || 0) !== Number(a.qualityScore || 0)) {
      return Number(b.qualityScore || 0) - Number(a.qualityScore || 0);
    }
    if (aDelta !== bDelta) return aDelta - bDelta;
    return Number(a.distance || 0) - Number(b.distance || 0);
  });

  const withInclusions = ranked.map((comp, index) => ({
    ...comp,
    included: originalIncludedCount > 0 ? index < originalIncludedCount : false,
  }));

  return { ...payload, comps: withInclusions };
}

export async function POST(request: Request) {
  const body = (await request.json()) as Record<string, unknown>;
  const normalizedBody = canonicalizeMercedesSearch(body);

  const forwardedRequest = new Request(request.url, {
    method: "POST",
    headers: request.headers,
    body: JSON.stringify(normalizedBody),
  });

  const response = await runStrictMarketCheckSearch(forwardedRequest);
  if (!response.ok) return response;

  const payload = (await response.json()) as Record<string, unknown>;
  const rankedPayload = rerankByCompFit(payload, {
    year: Number(normalizedBody.year || 0),
    make: String(normalizedBody.make || "").trim(),
    model: String(normalizedBody.model || "").trim(),
    trim: String(normalizedBody.trim || "").trim(),
    fuelType: String(normalizedBody.fuelType || "").trim(),
    mileage: Number(normalizedBody.targetMileage || 0),
  });

  return Response.json(rankedPayload, { status: response.status });
}
