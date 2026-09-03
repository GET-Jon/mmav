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

  if (!isMercedes) {
    return body;
  }

  // Normalize only the manufacturer name here. Keep the evaluator's model
  // identity intact so the strict search layer can apply its existing model
  // aliases without bouncing C-Class -> C300 -> C-Class.
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
  const present = usefulFields.filter((value) => value !== null && value !== undefined && String(value).trim() !== "").length;
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

function rerankByCompFit(payload: Record<string, unknown>, targetYear: number, targetMileage: number) {
  if (!Array.isArray(payload.comps) || !targetYear) return payload;

  const original = payload.comps as RankedComp[];
  const originalIncludedCount = original.filter((comp) => comp.included === true).length;

  const ranked = original.map((comp) => {
    const compYear = Number(comp.year || 0);
    const delta = compYear && targetYear ? Math.abs(compYear - targetYear) : 99;
    const currentScore = Number(comp.qualityScore || 40);

    // The strict search historically used a flat 20-point penalty for every
    // non-exact year. Replace that flat penalty with a graduated model-year
    // preference: exact, +/-1, +/-2, then a materially larger penalty beyond
    // two years. This remains a preference rather than a hard exclusion.
    const previousYearPenalty = delta === 0 ? 0 : 20;
    const fitScore = Math.max(
      30,
      Math.min(100, Math.round(currentScore + previousYearPenalty - yearPenalty(delta))),
    );

    const mileage = Number(comp.mileage || 0);
    const mileageDelta = targetMileage && mileage ? Math.abs(mileage - targetMileage) : null;
    const details = comp.marketCheckDetails || {};

    return {
      ...comp,
      qualityScore: fitScore,
      marketCheckDetails: {
        ...details,
        targetYear,
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
    const aDelta = Math.abs(Number(a.year || 0) - targetYear);
    const bDelta = Math.abs(Number(b.year || 0) - targetYear);
    const aPreferred = aDelta <= 2 ? 0 : 1;
    const bPreferred = bDelta <= 2 ? 0 : 1;

    if (aPreferred !== bPreferred) return aPreferred - bPreferred;
    if (Number(b.qualityScore || 0) !== Number(a.qualityScore || 0)) {
      return Number(b.qualityScore || 0) - Number(a.qualityScore || 0);
    }
    if (aDelta !== bDelta) return aDelta - bDelta;
    return Number(a.distance || 0) - Number(b.distance || 0);
  });

  // Preserve the strict search's decision about how many comps can be trusted,
  // but make sure those automatic inclusions are the best-ranked fits after the
  // +/-2-year preference is applied.
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
  const targetYear = Number(normalizedBody.year || 0);
  const targetMileage = Number(normalizedBody.targetMileage || 0);
  const rankedPayload = rerankByCompFit(payload, targetYear, targetMileage);

  return Response.json(rankedPayload, { status: response.status });
}
