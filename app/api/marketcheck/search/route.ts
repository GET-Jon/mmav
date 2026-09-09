import { POST as runStrictMarketCheckSearch } from "./strict-search";
import {
  evaluateVehicleEquivalence,
  type VehicleIdentity,
} from "@/lib/marketcheck/vehicle-equivalence";

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
  model?: string;
  trim?: string;
  askingPrice?: number;
  qualityScore?: number;
  equivalenceTier?: "direct" | "near" | "supporting" | "reject";
  equivalenceReasons?: string[];
  autoIncludeEligible?: boolean;
  targetClassification?: string | null;
  candidateClassification?: string | null;
  needsClassificationReview?: boolean;
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
  drivetrain?: string;
  bodyType?: string;
  engine?: string;
  transmission?: string;
  doors?: number | null;
  cylinders?: number | null;
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

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function stripMakeFromModel(model: unknown, make: string) {
  const value = String(model || "").trim();
  const normalizedMake = normalizeIdentity(make);
  const normalizedModel = normalizeIdentity(value);

  if (!value || !normalizedMake) return value;

  if (normalizedModel.startsWith(`${normalizedMake} `)) {
    return value.slice(make.length).trim();
  }

  return value;
}

function buildTargetVehicle(target: TargetIdentity): VehicleIdentity {
  return {
    year: target.year,
    make: target.make,
    model: target.model,
    trim: target.trim,
    fuelType: target.fuelType,
    drivetrain: target.drivetrain,
    bodyType: target.bodyType,
    engine: target.engine,
    transmission: target.transmission,
    doors: target.doors,
    cylinders: target.cylinders,
  };
}

function buildCandidateVehicle(
  comp: RankedComp,
  target: TargetIdentity,
): VehicleIdentity {
  const details = comp.marketCheckDetails || {};
  const raw = asRecord(details.raw);
  const build = asRecord(raw.build);

  const make = String(build.make || raw.make || target.make || "").trim();
  const rawModel =
    build.model ||
    raw.model ||
    stripMakeFromModel(comp.model, make || target.make) ||
    target.model;

  return {
    year: Number(comp.year || build.year || raw.year || 0),
    make,
    model: String(rawModel || "").trim(),
    trim: String(comp.trim || build.trim || raw.trim || "").trim(),
    bodyType: String(
      details.bodyType || build.body_type || build.body_style || "",
    ).trim(),
    drivetrain: String(
      details.drivetrain || build.drivetrain || build.drive_type || "",
    ).trim(),
    fuelType: String(
      details.fuelType || build.fuel_type || build.fuel || "",
    ).trim(),
    engine: String(
      details.engine || build.engine || build.engine_description || "",
    ).trim(),
    transmission: String(
      details.transmission || build.transmission || "",
    ).trim(),
    doors: Number(details.doors || build.doors || 0) || null,
    cylinders: Number(details.cylinders || build.cylinders || 0) || null,
  };
}

const equivalenceRank = {
  direct: 0,
  near: 1,
  supporting: 2,
  reject: 3,
} as const;

function rerankByCompFit(payload: Record<string, unknown>, target: TargetIdentity) {
  if (!Array.isArray(payload.comps) || !target.year) return payload;

  const original = payload.comps as RankedComp[];
  const originalIncludedCount = original.filter((comp) => comp.included === true).length;
  const targetVehicle = buildTargetVehicle(target);
  const minimumQualityScore = Number(payload.minimumQualityScore || 55);

  const ranked = original.map((comp) => {
    const compYear = Number(comp.year || 0);
    const delta = compYear && target.year ? Math.abs(compYear - target.year) : 99;
    const currentScore = Number(comp.qualityScore || 40);
    const previousYearPenalty = delta === 0 ? 0 : 20;
    const yearAdjustedScore = Math.max(
      30,
      Math.min(100, Math.round(currentScore + previousYearPenalty - yearPenalty(delta))),
    );

    const candidateVehicle = buildCandidateVehicle(comp, target);
    const equivalence = evaluateVehicleEquivalence({
      target: targetVehicle,
      candidate: candidateVehicle,
    });

    const fitScore = Math.max(
      0,
      Math.min(100, Math.round(yearAdjustedScore + equivalence.scoreModifier)),
    );

    const mileage = Number(comp.mileage || 0);
    const mileageDelta = target.mileage && mileage ? Math.abs(mileage - target.mileage) : null;
    const details = comp.marketCheckDetails || {};

    return {
      ...comp,
      qualityScore: fitScore,
      equivalenceTier: equivalence.tier,
      equivalenceReasons: equivalence.reasons,
      autoIncludeEligible: equivalence.autoIncludeEligible,
      targetClassification: equivalence.targetClassification || null,
      candidateClassification: equivalence.candidateClassification || null,
      needsClassificationReview: equivalence.needsClassificationReview === true,
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
          equivalenceTier: equivalence.tier,
          equivalenceReasons: equivalence.reasons,
          autoIncludeEligible: equivalence.autoIncludeEligible,
          needsClassificationReview: equivalence.needsClassificationReview === true,
        },
      },
    };
  });

  ranked.sort((a, b) => {
    const aTier = equivalenceRank[a.equivalenceTier || "supporting"];
    const bTier = equivalenceRank[b.equivalenceTier || "supporting"];

    if (aTier !== bTier) return aTier - bTier;

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

  let included = 0;
  const desiredIncludedCount = Math.min(6, Math.max(0, originalIncludedCount));

  const withInclusions = ranked.map((comp) => {
    const scorePasses = Number(comp.qualityScore || 0) >= minimumQualityScore;
    const eligible =
      comp.autoIncludeEligible === true &&
      (comp.equivalenceTier === "direct" || comp.equivalenceTier === "near") &&
      scorePasses;

    const shouldInclude = eligible && included < desiredIncludedCount;
    if (shouldInclude) included += 1;

    return {
      ...comp,
      included: shouldInclude,
    };
  });

  const directCount = withInclusions.filter(
    (comp) => comp.equivalenceTier === "direct",
  ).length;
  const nearCount = withInclusions.filter(
    (comp) => comp.equivalenceTier === "near",
  ).length;
  const supportingCount = withInclusions.filter(
    (comp) => comp.equivalenceTier === "supporting",
  ).length;
  const rejectedCount = withInclusions.filter(
    (comp) => comp.equivalenceTier === "reject",
  ).length;
  const aiReviewCandidateCount = withInclusions.filter(
    (comp) => comp.needsClassificationReview === true,
  ).length;
  const qualityPassingEquivalentCount = withInclusions.filter(
    (comp) =>
      (comp.equivalenceTier === "direct" || comp.equivalenceTier === "near") &&
      Number(comp.qualityScore || 0) >= minimumQualityScore,
  ).length;

  return {
    ...payload,
    lowConfidenceFallback: false,
    comps: withInclusions,
    equivalenceSummary: {
      directCount,
      nearCount,
      supportingCount,
      rejectedCount,
      aiReviewCandidateCount,
      qualityPassingEquivalentCount,
      autoIncludedCount: included,
      valuationReady: included > 0,
      methodology:
        "Vehicle equivalence and quality thresholds are evaluated before mileage normalization. Only Direct/Near comps that pass the quality floor are auto-included; weak fallback rows never create an automatic valuation.",
    },
  };
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
    fuelType: String(
      normalizedBody.fuelType ||
        normalizedBody.targetFuelType ||
        "",
    ).trim(),
    mileage: Number(normalizedBody.targetMileage || normalizedBody.mileage || 0),
    drivetrain: String(normalizedBody.drivetrain || "").trim(),
    bodyType: String(normalizedBody.bodyType || "").trim(),
    engine: String(normalizedBody.engine || "").trim(),
    transmission: String(normalizedBody.transmission || "").trim(),
    doors: Number(normalizedBody.doors || 0) || null,
    cylinders: Number(normalizedBody.cylinders || 0) || null,
  });

  return Response.json(rankedPayload, { status: response.status });
}
