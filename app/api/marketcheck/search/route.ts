import { loadCompanyAssumptions } from "@/lib/company/dealership-profile";
import { loadCompanyMarketCheckControls } from "@/lib/marketcheck/company-controls";
import { getCurrentCompanyForUser } from "@/lib/supabase/company";
import { POST as runStrictMarketCheckSearch } from "./strict-search";
import { createTraceId, recordSystemEvent } from "@/lib/observability/telemetry";
import { recordApiUsageEvent } from "@/lib/observability/api-usage";
import {
  checkUsageAllowance,
  recordUsageEvent,
  vehicleUsageSubject,
} from "@/lib/billing/usage";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import {
  evaluateVehicleEquivalence,
  type VehicleIdentity,
} from "@/lib/marketcheck/vehicle-equivalence";
import { resolveSemanticFuelType } from "@/lib/marketcheck/vehicle-identity";

function normalizeIdentity(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalFuelIdentity(value: unknown) {
  const normalized = normalizeIdentity(value);
  if (!normalized) return "";
  if (normalized.includes("plug in hybrid") || normalized.includes("phev")) return "plug-in hybrid";
  if (normalized.includes("electric") || normalized === "ev" || normalized.includes("battery")) return "electric";
  if (normalized.includes("hybrid") || normalized.includes("hev")) return "hybrid";
  if (normalized.includes("diesel") || normalized.includes("tdi")) return "diesel";
  if (
    normalized.includes("gasoline") ||
    normalized === "gas" ||
    normalized.includes("petrol") ||
    normalized.includes("unleaded") ||
    normalized.includes("regular fuel") ||
    normalized.includes("premium fuel") ||
    normalized === "regular" ||
    normalized === "premium"
  ) return "gasoline";
  return normalized;
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
    fuelType: resolveSemanticFuelType({
      make: target.make,
      model: target.model,
      trim: target.trim,
      fuelType: target.fuelType,
    }),
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
  const verification = asRecord(details.identityVerification);

  const make = String(
    verification.make || build.make || raw.make || target.make || "",
  ).trim();
  const rawModel =
    verification.model ||
    build.model ||
    raw.model ||
    stripMakeFromModel(comp.model, make || target.make) ||
    target.model;
  const trim = String(
    verification.trim || comp.trim || build.trim || raw.trim || "",
  ).trim();

  return {
    year: Number(
      verification.year || comp.year || build.year || raw.year || 0,
    ),
    make,
    model: String(rawModel || "").trim(),
    trim,
    bodyType: String(
      verification.bodyType ||
        details.bodyType ||
        build.body_type ||
        build.body_style ||
        "",
    ).trim(),
    drivetrain: String(
      verification.drivetrain ||
        details.drivetrain ||
        build.drivetrain ||
        build.drive_type ||
        "",
    ).trim(),
    fuelType: resolveSemanticFuelType({
      make,
      model: rawModel,
      trim,
      fuelType:
        verification.fuelType ||
        details.fuelType ||
        build.fuel_type ||
        build.fuel ||
        "",
    }),
    engine: String(
      details.engine || build.engine || build.engine_description || "",
    ).trim(),
    transmission: String(
      details.transmission || build.transmission || "",
    ).trim(),
    doors: Number(details.doors || build.doors || 0) || null,
    cylinders:
      Number(
        verification.cylinders ||
          details.cylinders ||
          build.cylinders ||
          0,
      ) || null,
  };
}

type CandidateVinIdentity = {
  year: number | null;
  make: string;
  model: string;
  trim: string;
  bodyType: string;
  drivetrain: string;
  fuelType: string;
  cylinders: number | null;
};

async function decodeCandidateVinIdentity(
  vin: string,
): Promise<CandidateVinIdentity | null> {
  const normalizedVin = vin.trim().toUpperCase();
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(normalizedVin)) return null;

  try {
    const response = await fetch(
      `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${encodeURIComponent(
        normalizedVin,
      )}?format=json`,
      { cache: "no-store" },
    );
    if (!response.ok) return null;

    const payload = (await response.json()) as {
      Results?: Array<Record<string, string>>;
    };
    const row = payload.Results?.[0];
    if (!row) return null;

    const make = String(row.Make || "").trim();
    const model = String(row.Model || "").trim();
    const trim = String(row.Trim || row.Series || "").trim();

    return {
      year: Number(row.ModelYear || 0) || null,
      make,
      model,
      trim,
      bodyType: String(row.BodyClass || "").trim(),
      drivetrain: String(row.DriveType || "").trim(),
      fuelType: resolveSemanticFuelType({
        make,
        model,
        trim,
        fuelType: row.FuelTypePrimary || "",
      }),
      cylinders: Number(row.EngineCylinders || 0) || null,
    };
  } catch {
    return null;
  }
}

function compNeedsVinIdentityVerification(comp: RankedComp) {
  const classification = String(comp.candidateClassification || "").toLowerCase();
  const reasons = (comp.equivalenceReasons || []).join(" ").toLowerCase();

  if (comp.equivalenceTier === "supporting") {
    return (
      comp.needsClassificationReview === true ||
      classification.includes("unknown") ||
      reasons.includes("unknown") ||
      reasons.includes("incomplete")
    );
  }

  // A provider fuel label can be wrong even when the listing VIN is valid.
  // Give high-quality same-family candidates one VIN-backed chance to prove
  // themselves before a fuel mismatch becomes a hard reject.
  return comp.equivalenceTier === "reject" && reasons.includes("fuel mismatch");
}

async function enrichAmbiguousCompsByVin({
  payload,
  target,
  maxCandidates = 8,
}: {
  payload: Record<string, unknown>;
  target: TargetIdentity;
  maxCandidates?: number;
}) {
  if (!Array.isArray(payload.comps)) {
    return { payload, attempted: 0, verified: 0 };
  }

  const preliminary = rerankByCompFit(payload, target);
  const preliminaryComps = Array.isArray(asRecord(preliminary).comps)
    ? (asRecord(preliminary).comps as RankedComp[])
    : [];

  const candidates = preliminaryComps
    .filter(compNeedsVinIdentityVerification)
    .filter((comp) => {
      const vin = String(comp.marketCheckDetails?.vin || "").trim();
      return /^[A-HJ-NPR-Z0-9]{17}$/i.test(vin);
    })
    .sort((a, b) => {
      const scoreDelta =
        Number(b.qualityScore || 0) - Number(a.qualityScore || 0);
      if (scoreDelta) return scoreDelta;
      return Number(a.distance || 0) - Number(b.distance || 0);
    });

  const uniqueCandidates: RankedComp[] = [];
  const seenVins = new Set<string>();
  for (const comp of candidates) {
    const vin = String(comp.marketCheckDetails?.vin || "")
      .trim()
      .toUpperCase();
    if (!vin || seenVins.has(vin)) continue;
    seenVins.add(vin);
    uniqueCandidates.push(comp);
    if (uniqueCandidates.length >= maxCandidates) break;
  }

  if (!uniqueCandidates.length) {
    return { payload, attempted: 0, verified: 0 };
  }

  const results = await Promise.all(
    uniqueCandidates.map(async (comp) => {
      const vin = String(comp.marketCheckDetails?.vin || "")
        .trim()
        .toUpperCase();
      return {
        id: String(comp.id || ""),
        vin,
        identity: await decodeCandidateVinIdentity(vin),
      };
    }),
  );

  const byId = new Map(
    results
      .filter((result) => result.identity && result.id)
      .map((result) => [result.id, result.identity as CandidateVinIdentity]),
  );

  const comps = (payload.comps as RankedComp[]).map((comp) => {
    const identity = byId.get(String(comp.id || ""));
    if (!identity) return comp;

    const details = comp.marketCheckDetails || {};
    return {
      ...comp,
      marketCheckDetails: {
        ...details,
        fuelType: identity.fuelType || details.fuelType || null,
        drivetrain: identity.drivetrain || details.drivetrain || null,
        bodyType: identity.bodyType || details.bodyType || null,
        cylinders: identity.cylinders || details.cylinders || null,
        identityVerification: {
          source: "nhtsa-vin",
          status: identity.model ? "verified" : "partial",
          year: identity.year,
          make: identity.make || null,
          model: identity.model || null,
          trim: identity.trim || null,
          fuelType: identity.fuelType || null,
          drivetrain: identity.drivetrain || null,
          bodyType: identity.bodyType || null,
          cylinders: identity.cylinders,
          note:
            "Candidate identity verified from the listing VIN before final comp qualification.",
        },
      },
    };
  });

  return {
    payload: {
      ...payload,
      comps,
      identityVerification: {
        attempted: uniqueCandidates.length,
        verified: byId.size,
        source: "nhtsa-vin",
      },
    },
    attempted: uniqueCandidates.length,
    verified: byId.size,
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

  const apiUsage = asRecord(payload.apiUsage);
  const retrievalCandidateCount = Number(apiUsage.usableCompCount || 0);
  const retrievalStopReason = String(apiUsage.stopReason || "").trim();
  const finalStopReason =
    qualityPassingEquivalentCount > 0
      ? `Retrieved ${retrievalCandidateCount} candidate comp${retrievalCandidateCount === 1 ? "" : "s"}; ${qualityPassingEquivalentCount} qualified after vehicle-equivalence checks.`
      : retrievalCandidateCount > 0
        ? `Retrieved ${retrievalCandidateCount} candidate comp${retrievalCandidateCount === 1 ? "" : "s"}, but none qualified after vehicle-equivalence checks.`
        : retrievalStopReason;

  return {
    ...payload,
    lowConfidenceFallback: false,
    usableCompCount: qualityPassingEquivalentCount,
    stopReason: finalStopReason,
    apiUsage: {
      ...apiUsage,
      retrievalStopReason,
      candidateCompCount: retrievalCandidateCount,
      usableCompCount: qualityPassingEquivalentCount,
      stopReason: finalStopReason,
    },
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
  const traceId = request.headers.get("x-lot-logic-trace-id") || createTraceId("comps");
  const startedAt = Date.now();
  const body = (await request.json()) as Record<string, unknown>;
  const normalizedBody = canonicalizeMercedesSearch(body);
  const decodedVehicle = asRecord(normalizedBody.decodedVehicle);
  const nestedVehicle = asRecord(normalizedBody.vehicle);

  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const company = await getCurrentCompanyForUser(admin, user.id);
  const [{ assumptions, profile }, { controls }] = await Promise.all([
    loadCompanyAssumptions(admin, company.companyId, company.companySlug),
    loadCompanyMarketCheckControls(admin, company.companyId, user.id),
  ]);
  if (company.companySlug !== "mindful-motor-co" && !profile.zip) {
    return Response.json({ error: "Set your dealership ZIP in Organization & Team before searching comps.", code: "DEALERSHIP_ZIP_REQUIRED" }, { status: 422 });
  }
  // Resolve search limits on the server; provider usage stays metered.
  delete normalizedBody.liveLookupEnabled;
  if (!normalizedBody.searchStage || normalizedBody.searchStage === "initial") {
    normalizedBody.regions = assumptions.regionalMarkets;
    normalizedBody.maxApiCallsPerSearch = controls.maxApiCallsPerSearch;
    normalizedBody.minInitialRegions = controls.minInitialRegions;
  }
  normalizedBody.minUsableCompsToStop = controls.minUsableCompsToStop;

  const subjectKey = vehicleUsageSubject({
    vin: normalizedBody.vin || decodedVehicle.vin || nestedVehicle.vin,
    year:
      normalizedBody.qualificationYear ||
      normalizedBody.year ||
      decodedVehicle.year ||
      nestedVehicle.year,
    make:
      normalizedBody.qualificationMake ||
      normalizedBody.make ||
      decodedVehicle.make ||
      nestedVehicle.make,
    model:
      normalizedBody.qualificationModel ||
      normalizedBody.model ||
      decodedVehicle.model ||
      nestedVehicle.model,
    trim:
      normalizedBody.qualificationTrim ||
      normalizedBody.trim ||
      decodedVehicle.trim ||
      nestedVehicle.trim,
  });

  const searchAllowance = await checkUsageAllowance({
    supabase: admin,
    userId: user.id,
    kind: "market_search",
    subjectKey,
  });

  if (!searchAllowance.allowed) {
    return Response.json(
      { error: searchAllowance.message, code: searchAllowance.code, usage: searchAllowance.summary },
      { status: searchAllowance.status },
    );
  }

  const providerAllowance = await checkUsageAllowance({
    supabase: admin,
    userId: user.id,
    kind: "provider_api_call",
    expectedUnits: 3,
  });

  if (!providerAllowance.allowed) {
    return Response.json(
      { error: providerAllowance.message, code: providerAllowance.code, usage: providerAllowance.summary },
      { status: providerAllowance.status },
    );
  }

  const forwardedRequest = new Request(request.url, {
    method: "POST",
    headers: request.headers,
    body: JSON.stringify(normalizedBody),
  });

  const response = await runStrictMarketCheckSearch(forwardedRequest);
  if (!response.ok) {
    let failurePayload: Record<string, unknown> = {};
    try {
      failurePayload = (await response.clone().json()) as Record<string, unknown>;
    } catch {
      failurePayload = {};
    }
    const failureUsage = asRecord(failurePayload.apiUsage);
    const failedCallCount = Math.max(1, Number(failureUsage.apiCallsMade || 1));
    await Promise.all([
      recordUsageEvent({
        supabase: admin,
        companyId: searchAllowance.summary.company.companyId,
        userId: user.id,
        kind: "market_search",
        subjectKey,
        metadata: { failed: true, searchStage: String(normalizedBody.searchStage || "initial") },
      }),
      recordUsageEvent({
        supabase: admin,
        companyId: searchAllowance.summary.company.companyId,
        userId: user.id,
        kind: "provider_api_call",
        subjectKey,
        units: failedCallCount,
        metadata: { provider: "marketcheck", failed: true },
      }),
    ]);
    await recordApiUsageEvent({
      companyId: searchAllowance.summary.company.companyId,
      userId: user.id,
      provider: "marketcheck",
      endpoint: "/v2/search/car/active",
      vehicleYear: Number(normalizedBody.year || decodedVehicle.year || nestedVehicle.year || 0) || null,
      vehicleMake: String(normalizedBody.make || decodedVehicle.make || nestedVehicle.make || "").trim() || null,
      vehicleModel: String(normalizedBody.model || decodedVehicle.model || nestedVehicle.model || "").trim() || null,
      apiCallsMade: Number(failureUsage.apiCallsMade || 0),
      cacheHit: failureUsage.cacheHit === true,
      status: response.status,
      stopReason: typeof failureUsage.stopReason === "string" ? failureUsage.stopReason : "MarketCheck request failed.",
      metadata: {
        traceId,
        durationMs: Date.now() - startedAt,
        failed: true,
        searchStage: String(normalizedBody.searchStage || "initial"),
        searchLog: failureUsage.searchLog || null,
      },
    });
    await recordSystemEvent({
      traceId,
      subsystem: "marketcheck",
      eventName: "comp_search",
      status: "error",
      durationMs: Date.now() - startedAt,
      message: `Strict comp search returned HTTP ${response.status}.`,
      metadata: {
        year: normalizedBody.year || decodedVehicle.year || nestedVehicle.year || null,
        make: normalizedBody.make || decodedVehicle.make || nestedVehicle.make || null,
        model: normalizedBody.model || decodedVehicle.model || nestedVehicle.model || null,
      },
    });
    return response;
  }

  const payload = (await response.json()) as Record<string, unknown>;
  const targetIdentity: TargetIdentity = {
    year: Number(
      normalizedBody.qualificationYear ||
        normalizedBody.year ||
        decodedVehicle.year ||
        nestedVehicle.year ||
        0,
    ),
    make: String(
      normalizedBody.qualificationMake ||
        normalizedBody.make ||
        decodedVehicle.make ||
        nestedVehicle.make ||
        "",
    ).trim(),
    model: String(
      normalizedBody.qualificationModel ||
        normalizedBody.model ||
        decodedVehicle.model ||
        nestedVehicle.model ||
        "",
    ).trim(),
    trim: String(
      normalizedBody.qualificationTrim ||
        normalizedBody.trim ||
        decodedVehicle.trim ||
        nestedVehicle.trim ||
        "",
    ).trim(),
    fuelType: resolveSemanticFuelType({
      make:
        normalizedBody.qualificationMake ||
        normalizedBody.make ||
        decodedVehicle.make ||
        nestedVehicle.make ||
        "",
      model:
        normalizedBody.qualificationModel ||
        normalizedBody.model ||
        decodedVehicle.model ||
        nestedVehicle.model ||
        "",
      trim:
        normalizedBody.qualificationTrim ||
        normalizedBody.trim ||
        decodedVehicle.trim ||
        nestedVehicle.trim ||
        "",
      fuelType:
        normalizedBody.qualificationFuelType ||
        normalizedBody.fuelType ||
        normalizedBody.targetFuelType ||
        decodedVehicle.fuelType ||
        nestedVehicle.fuelType ||
        "",
    }),
    mileage: Number(
      normalizedBody.targetMileage ||
        normalizedBody.mileage ||
        decodedVehicle.mileage ||
        nestedVehicle.mileage ||
        0,
    ),
    drivetrain: String(
      normalizedBody.qualificationDrivetrain ||
        normalizedBody.drivetrain ||
        decodedVehicle.drivetrain ||
        nestedVehicle.drivetrain ||
        "",
    ).trim(),
    bodyType: String(
      normalizedBody.qualificationBodyType ||
        normalizedBody.bodyType ||
        decodedVehicle.bodyType ||
        decodedVehicle.bodyStyle ||
        nestedVehicle.bodyType ||
        nestedVehicle.bodyStyle ||
        "",
    ).trim(),
    engine: String(
      normalizedBody.engine || decodedVehicle.engine || nestedVehicle.engine || "",
    ).trim(),
    transmission: String(
      normalizedBody.transmission ||
        decodedVehicle.transmission ||
        nestedVehicle.transmission ||
        "",
    ).trim(),
    doors:
      Number(
        normalizedBody.doors ||
          decodedVehicle.doors ||
          nestedVehicle.doors ||
          0,
      ) || null,
    cylinders:
      Number(
        normalizedBody.cylinders ||
          decodedVehicle.cylinders ||
          nestedVehicle.cylinders ||
          0,
      ) || null,
  };

  const identityEnrichment = await enrichAmbiguousCompsByVin({
    payload,
    target: targetIdentity,
  });
  const rankedPayload = rerankByCompFit(
    identityEnrichment.payload,
    targetIdentity,
  );

  const rankedRecord = asRecord(rankedPayload);
  const usage = asRecord(rankedRecord.apiUsage);
  const equivalence = asRecord(rankedRecord.equivalenceSummary);

  const providerCallCount = Math.max(1, Number(usage.apiCallsMade || 1));
  await Promise.all([
    recordUsageEvent({
      supabase: admin,
      companyId: searchAllowance.summary.company.companyId,
      userId: user.id,
      kind: "market_search",
      subjectKey,
      metadata: { searchStage: String(normalizedBody.searchStage || "initial") },
    }),
    recordUsageEvent({
      supabase: admin,
      companyId: searchAllowance.summary.company.companyId,
      userId: user.id,
      kind: "provider_api_call",
      subjectKey,
      units: providerCallCount,
      metadata: { provider: "marketcheck" },
    }),
  ]);

  await recordApiUsageEvent({
    provider: "marketcheck",
    endpoint: "/v2/search/car/active",
    vehicleYear: Number(normalizedBody.year || decodedVehicle.year || nestedVehicle.year || 0) || null,
    vehicleMake: String(normalizedBody.make || decodedVehicle.make || nestedVehicle.make || "").trim() || null,
    vehicleModel: String(normalizedBody.model || decodedVehicle.model || nestedVehicle.model || "").trim() || null,
    apiCallsMade: Number(usage.apiCallsMade || 0),
    cacheHit: usage.cacheHit === true,
    status: response.status,
    stopReason: typeof usage.stopReason === "string" ? usage.stopReason : null,
    metadata: {
      traceId,
      durationMs: Date.now() - startedAt,
      candidateCompCount: usage.candidateCompCount ?? usage.usableCompCount ?? null,
      usableCompCount: rankedRecord.usableCompCount ?? null,
      candidateVinVerificationAttempted: identityEnrichment.attempted,
      candidateVinVerificationVerified: identityEnrichment.verified,
      searchStage: String(normalizedBody.searchStage || "initial"),
      searchLog: usage.searchLog || null,
    },
  });

  await recordSystemEvent({
    traceId,
    subsystem: "marketcheck",
    eventName: "comp_search",
    status: Number(rankedRecord.usableCompCount || 0) > 0 ? "ok" : "warning",
    durationMs: Date.now() - startedAt,
    message:
      typeof rankedRecord.stopReason === "string"
        ? rankedRecord.stopReason
        : null,
    metadata: {
      year: normalizedBody.year || decodedVehicle.year || nestedVehicle.year || null,
      make: normalizedBody.make || decodedVehicle.make || nestedVehicle.make || null,
      model: normalizedBody.model || decodedVehicle.model || nestedVehicle.model || null,
      targetMileage: normalizedBody.targetMileage || normalizedBody.mileage || decodedVehicle.mileage || nestedVehicle.mileage || null,
      candidateCompCount: usage.candidateCompCount ?? usage.usableCompCount ?? null,
      usableCompCount: rankedRecord.usableCompCount ?? null,
      candidateVinVerificationAttempted: identityEnrichment.attempted,
      candidateVinVerificationVerified: identityEnrichment.verified,
      autoIncludedCount: equivalence.autoIncludedCount ?? null,
      directCount: equivalence.directCount ?? null,
      nearCount: equivalence.nearCount ?? null,
      supportingCount: equivalence.supportingCount ?? null,
      rejectedCount: equivalence.rejectedCount ?? null,
    },
  });

  return Response.json(rankedPayload, {
    status: response.status,
    headers: { "x-lot-logic-trace-id": traceId },
  });
}
