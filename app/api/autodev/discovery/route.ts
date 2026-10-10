import { NextResponse } from "next/server";
import { recordApiUsageEvent } from "@/lib/observability/api-usage";
import { checkUsageAllowance, evaluationUsageSubject, recordUsageEvent } from "@/lib/billing/usage";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import { findGenerationCompRule } from "@/lib/marketcheck/generation-comps";
import {
  evaluateVehicleEquivalence,
  type VehicleIdentity,
  type VehicleEquivalenceTier,
} from "@/lib/marketcheck/vehicle-equivalence";
import { resolveSemanticFuelType } from "@/lib/marketcheck/vehicle-identity";
import { buildAutoDevCompCandidates } from "@/lib/autodev/qualified-comps";
import { buildDiscoveryModels } from "@/lib/autodev/discovery-models";

export const dynamic = "force-dynamic";

type AutoDevListing = { vin: string | null; year: number | null; make: string | null; model: string | null; trim: string | null; drivetrain: string | null; fuelType: string | null; bodyType: string | null; price: number | null; miles: number | null; dealer: string | null; city: string | null; state: string | null; zip: string | null; url: string | null; longitude: number | null; latitude: number | null; equivalenceTier?: VehicleEquivalenceTier; };
type DiscoveryAttempt = { label: string; make: string; model: string; yearMin: number; yearMax: number };

function toNumber(value: unknown): number | null { if (value === null || value === undefined || String(value).trim() === "") return null; const parsed = Number(value); return Number.isFinite(parsed) ? parsed : null; }
function haversineMiles(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const earthRadiusMiles = 3958.8;
  const dLat = toRadians(b.latitude - a.latitude); const dLon = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude); const lat2 = toRadians(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadiusMiles * Math.asin(Math.sqrt(h));
}

function discoveryTierWeight(tier: VehicleEquivalenceTier) {
  if (tier === "direct") return 6;
  if (tier === "near") return 4;
  if (tier === "supporting") return 1;
  return 0;
}

function buildRecommendedMarkets(
  listings: AutoDevListing[],
  target: VehicleIdentity,
  maxMarkets = 3,
) {
  const eligibleCandidates = listings
    .map((listing) => {
      const candidate: VehicleIdentity = {
        year: Number(listing.year || 0),
        make: listing.make || target.make,
        model: listing.model || target.model,
        trim: listing.trim || "",
        drivetrain: listing.drivetrain || "",
        fuelType: resolveSemanticFuelType({
          make: listing.make || target.make,
          model: listing.model || target.model,
          trim: listing.trim || "",
          fuelType: listing.fuelType || "",
        }),
        bodyType: listing.bodyType || "",
      };
      const equivalence = evaluateVehicleEquivalence({ target, candidate });
      return { ...listing, equivalenceTier: equivalence.tier };
    })
    .filter(
      (
        listing,
      ): listing is AutoDevListing & {
        zip: string;
        latitude: number;
        longitude: number;
        equivalenceTier: VehicleEquivalenceTier;
      } =>
        listing.equivalenceTier !== "reject" &&
        Boolean(listing.zip) &&
        typeof listing.latitude === "number" &&
        typeof listing.longitude === "number",
    );

  // If Auto.dev found any Direct/Near inventory, build geography from those
  // cars only. Related Supporting vehicles are useful fallback evidence, but
  // they should not steer a TTS search toward ordinary TT inventory when true
  // TTS listings are available nationally.
  const highConfidenceCandidates = eligibleCandidates.filter(
    (listing) =>
      listing.equivalenceTier === "direct" ||
      listing.equivalenceTier === "near",
  );
  const candidates =
    highConfidenceCandidates.length > 0
      ? highConfidenceCandidates
      : eligibleCandidates;
  const remaining = new Set(candidates.map((_, index) => index));
  const recommendations: Array<{ market: string; zip: string; latitude: number; longitude: number; coverageCount: number; directCount: number; nearCount: number; supportingCount: number; qualityWeight: number; states: string[]; vins: string[] }> = [];
  while (remaining.size && recommendations.length < maxMarkets) {
    let bestCenterIndex: number | null = null; let bestCovered: number[] = []; let bestScore = -1;
    for (const centerIndex of remaining) {
      const center = candidates[centerIndex];
      const covered = Array.from(remaining).filter((candidateIndex) => { const candidate = candidates[candidateIndex]; return haversineMiles({ latitude: center.latitude, longitude: center.longitude }, { latitude: candidate.latitude, longitude: candidate.longitude }) <= 100; });
      const score = covered.reduce(
        (sum, candidateIndex) =>
          sum + discoveryTierWeight(candidates[candidateIndex].equivalenceTier),
        0,
      );
      if (score > bestScore || (score === bestScore && covered.length > bestCovered.length)) { bestCenterIndex = centerIndex; bestCovered = covered; bestScore = score; }
    }
    if (bestCenterIndex === null) break;
    const center = candidates[bestCenterIndex]; const coveredListings = bestCovered.map((index) => candidates[index]);
    recommendations.push({
      market: [center.city, center.state].filter(Boolean).join(", ") || center.zip,
      zip: center.zip,
      latitude: center.latitude,
      longitude: center.longitude,
      coverageCount: coveredListings.length,
      directCount: coveredListings.filter((listing) => listing.equivalenceTier === "direct").length,
      nearCount: coveredListings.filter((listing) => listing.equivalenceTier === "near").length,
      supportingCount: coveredListings.filter((listing) => listing.equivalenceTier === "supporting").length,
      qualityWeight: bestScore,
      states: Array.from(new Set(coveredListings.map((listing) => String(listing.state || "").trim()).filter(Boolean))),
      vins: coveredListings.map((listing) => String(listing.vin || "").trim()).filter(Boolean),
    });
    bestCovered.forEach((index) => remaining.delete(index));
  }
  return recommendations;
}

function mapListings(payload: any): AutoDevListing[] {
  const rows = Array.isArray(payload?.data) ? payload.data : [];
  return rows.map((row: any) => {
    // The default v2 response is nested. Accept documented and legacy
    // mileage/price field aliases without inventing values when absent.
    const vehicle = row?.vehicle || {};
    const retail = row?.retailListing || {};
    const location = Array.isArray(row?.location) ? row.location : [];
    return {
      vin: String(vehicle.vin || row?.vin || "").trim().toUpperCase() || null,
      year: toNumber(vehicle.year ?? row?.year),
      make: String(vehicle.make || row?.make || "").trim() || null,
      model: String(vehicle.model || row?.model || "").trim() || null,
      trim: String(vehicle.trim || row?.trim || "").trim() || null,
      drivetrain: String(vehicle.drivetrain || row?.drivetrain || "").trim() || null,
      fuelType: String(vehicle.fuelType || vehicle.fuel || vehicle.powertrain || row?.fuel || "").trim() || null,
      bodyType: String(vehicle.bodyType || vehicle.bodyStyle || row?.bodyStyle || "").trim() || null,
      price: toNumber(retail.price ?? row?.price),
      miles: toNumber(retail.miles ?? retail.mileage ?? vehicle.miles ?? vehicle.mileage ?? row?.miles ?? row?.mileage),
      dealer: String(retail.dealer || row?.dealer || "").trim() || null,
      city: String(retail.city || row?.city || "").trim() || null,
      state: String(retail.state || row?.state || "").trim() || null,
      zip: String(retail.zip || row?.zip || "").trim() || null,
      url: String(retail.vdp || retail.url || row?.vdpUrl || row?.url || "").trim() || null,
      longitude: toNumber(location[0] ?? row?.longitude),
      latitude: toNumber(location[1] ?? row?.latitude),
    };
  });
}

export async function POST(request: Request) {
  const startedAt = Date.now(); const apiKey = process.env.AUTODEV_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Missing AUTODEV_API_KEY server environment variable." }, { status: 500 });
  const body = await request.json(); const year = toNumber(body.year); const make = String(body.make || "").trim(); const model = String(body.model || "").trim(); const trim = String(body.trim || "").trim();
  const target: VehicleIdentity = {
    year: Number(year || 0),
    make,
    model,
    trim,
    drivetrain: String(body.drivetrain || "").trim(),
    fuelType: resolveSemanticFuelType({
      make,
      model,
      trim,
      fuelType: body.fuelType || "",
    }),
    bodyType: String(body.bodyClass || body.bodyStyle || "").trim(),
  };
  const user = await getCurrentUser(); if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!year || !make || !model) return NextResponse.json({ error: "Year, make, and model are required for national discovery." }, { status: 400 });
  const admin = createSupabaseAdminClient(); const subjectKey = evaluationUsageSubject({ evaluationUsageId: body.evaluationUsageId, vin: body.vin, year, make, model, trim });
  const discoveryAllowance = await checkUsageAllowance({ supabase: admin, userId: user.id, kind: "auto_dev_discovery", subjectKey });
  if (!discoveryAllowance.allowed) return NextResponse.json({ error: discoveryAllowance.message, code: discoveryAllowance.code, usage: discoveryAllowance.summary }, { status: discoveryAllowance.status });

  const generation = findGenerationCompRule({ year, make, model, trim, bodyStyle: String(body.bodyStyle || "").trim(), bodyClass: String(body.bodyClass || "").trim() });
  const yearMin = generation ? Math.max(generation.startYear, year - 1) : Math.max(1900, year - 1); const yearMax = generation ? Math.min(generation.endYear, year + 1) : Math.min(2100, year + 1);
  const providerAliases = Array.isArray(body.providerAliases)
    ? body.providerAliases
        .map((value: unknown) => String(value || "").trim())
        .filter(Boolean)
        .slice(0, 8)
    : [];
  const attempts: DiscoveryAttempt[] = buildDiscoveryModels(
    make,
    model,
    trim,
    providerAliases,
  ).map((candidateModel, index) => ({
    label: index === 0 ? "exact decoded model" : "normalized provider model",
    make,
    model: candidateModel,
    yearMin,
    yearMax,
  }));
  const attemptsResult: Array<{
    label: string; model: string; returned: number; total: number;
    directNear: number; supporting: number; qualifiedCandidates: number;
    autoSelected: number; missingPriceOrMileage: number;
    identityRejected: number; outOfYearRange: number;
  }> = [];
  let callsMade = 0;
  let exactTotal = 0;
  let listings: AutoDevListing[] = [];
  const seenListings = new Set<string>();
  let lastAttempt: DiscoveryAttempt | null = null;
  const targetMileage = Number(body.targetMileage || 0);

  for (const [attemptIndex, attempt] of attempts.entries()) {
    const providerAllowance = await checkUsageAllowance({
      supabase: admin, userId: user.id, kind: "provider_api_call",
      subjectKey, expectedUnits: 1,
    });
    if (!providerAllowance.allowed) {
      if (callsMade === 0) {
        return NextResponse.json({
          error: providerAllowance.message, code: providerAllowance.code,
          usage: providerAllowance.summary,
        }, { status: providerAllowance.status });
      }
      break;
    }

    const params = new URLSearchParams({
      "vehicle.make": attempt.make,
      "vehicle.model": attempt.model,
      "vehicle.year": attempt.yearMin === attempt.yearMax
        ? String(attempt.yearMin) : `${attempt.yearMin}-${attempt.yearMax}`,
      "retailListing.used": "true",
      "includes": "total",
      "limit": "20",
      "sort": "updatedAt.desc",
    });
    const upstream = await fetch(`https://api.auto.dev/listings?${params}`, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      cache: "no-store",
    });
    callsMade += 1;
    const raw = await upstream.text();
    let payload: any = null;
    try { payload = raw ? JSON.parse(raw) : null; }
    catch { payload = { message: raw }; }
    await recordUsageEvent({
      supabase: admin, companyId: discoveryAllowance.summary.company.companyId,
      userId: user.id, kind: "provider_api_call", subjectKey, units: 1,
      metadata: { provider: "auto_dev", discoveryModel: attempt.model, failed: !upstream.ok },
    });
    if (!upstream.ok) {
      return NextResponse.json({
        error: "Auto.dev national discovery failed.",
        status: upstream.status,
        details: typeof payload?.message === "string" ? payload.message :
          typeof payload?.error === "string" ? payload.error : undefined,
      }, { status: upstream.status });
    }

    lastAttempt = attempt;
    let batch = mapListings(payload);
    const total = typeof payload?.total === "number" ? payload.total : batch.length;
    if (attemptIndex === 0) exactTotal = total;

    // Auto.dev Free-plan pages may be capped at 20. When a broad provider
    // alias contains more than one page, inspect page two only if page one
    // has not established four qualified TTS candidates. Never bypass the
    // provider usage allowance or add unrelated TT variants to valuation.
    if (
      total > batch.length && batch.length > 0 &&
      buildAutoDevCompCandidates(batch, target, targetMileage)
        .diagnostics.autoIncluded < 4 &&
      callsMade < 6
    ) {
      const pageAllowance = await checkUsageAllowance({
        supabase: admin, userId: user.id, kind: "provider_api_call",
        subjectKey, expectedUnits: 1,
      });
      if (pageAllowance.allowed) {
        const pageParams = new URLSearchParams(params);
        pageParams.set("page", "2");
        const pageResponse = await fetch(
          `https://api.auto.dev/listings?${pageParams}`,
          {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              Accept: "application/json",
            },
            cache: "no-store",
          },
        );
        callsMade += 1;
        await recordUsageEvent({
          supabase: admin,
          companyId: discoveryAllowance.summary.company.companyId,
          userId: user.id, kind: "provider_api_call", subjectKey, units: 1,
          metadata: {
            provider: "auto_dev", discoveryModel: attempt.model,
            page: 2, failed: !pageResponse.ok,
          },
        });
        if (pageResponse.ok) {
          const pageData = await pageResponse.json();
          batch = [...batch, ...mapListings(pageData)];
        }
      }
    }
    const tiers = batch.map((listing) => evaluateVehicleEquivalence({
      target,
      candidate: {
        year: Number(listing.year || 0),
        make: listing.make || make, model: listing.model || attempt.model,
        trim: listing.trim || "", drivetrain: listing.drivetrain || "",
        fuelType: resolveSemanticFuelType({
          make: listing.make || make, model: listing.model || attempt.model,
          trim: listing.trim || "", fuelType: listing.fuelType || "",
        }),
        bodyType: listing.bodyType || "",
      },
    }).tier);
    for (const [index, listing] of batch.entries()) {
      // A broader provider alias must not add standard TT/TT RS to a TTS
      // valuation. Keep only Direct/Near for this national discovery pool.
      if (!["direct", "near"].includes(tiers[index])) continue;
      const key = listing.vin ||
        [listing.year, listing.make, listing.model, listing.trim,
          listing.miles, listing.price, listing.url].join("|").toLowerCase();
      if (!seenListings.has(key)) {
        seenListings.add(key);
        listings.push(listing);
      }
    }

    const checked = buildAutoDevCompCandidates(batch, target, targetMileage);
    const combined = buildAutoDevCompCandidates(listings, target, targetMileage);
    attemptsResult.push({
      label: attempt.label, model: attempt.model,
      returned: batch.length, total,
      directNear: tiers.filter(t => t === "direct" || t === "near").length,
      supporting: tiers.filter(t => t === "supporting").length,
      qualifiedCandidates: checked.comps.length,
      autoSelected: checked.diagnostics.autoIncluded,
      missingPriceOrMileage: checked.diagnostics.missingPriceOrMileage,
      identityRejected: checked.diagnostics.identityRejected,
      outOfYearRange: checked.diagnostics.outOfYearRange,
    });

    // Continue to the next provider alias when the exact model matches but
    // fails to supply four usable price/mileage candidates. Matching a name
    // is not proof that valuation evidence is sufficient.
    if (combined.diagnostics.autoIncluded >= 4) break;
  }

  const byState = listings.reduce((acc: Record<string, number>, listing) => {
    const state = listing.state || "Unknown";
    acc[state] = (acc[state] || 0) + 1;
    return acc;
  }, {});
  const candidateEvidence = buildAutoDevCompCandidates(listings, target, targetMileage);
  const total = Math.max(exactTotal, listings.length);
  const metadata = {
    callsMade, attemptResults: attemptsResult,
    screening: candidateEvidence.diagnostics,
    returned: listings.length, exactModelTotal: exactTotal, total,
    sampleFieldCoverage: {
      priced: listings.filter(x => x.price !== null && x.price !== undefined && x.price > 0).length,
      withMileage: listings.filter(x => x.miles !== null && x.miles !== undefined).length,
      withVin: listings.filter(x => Boolean(x.vin)).length,
      withUrl: listings.filter(x => Boolean(x.url)).length,
    },
  };
  await recordUsageEvent({
    supabase: admin, companyId: discoveryAllowance.summary.company.companyId,
    userId: user.id, kind: "auto_dev_discovery", subjectKey, metadata,
  });
  await recordApiUsageEvent({
    companyId: discoveryAllowance.summary.company.companyId,
    userId: user.id, provider: "auto_dev", endpoint: "/listings",
    vehicleYear: year, vehicleMake: make, vehicleModel: model,
    apiCallsMade: callsMade, status: 200,
    stopReason: candidateEvidence.comps.length
      ? "National discovery found qualifying retail candidates."
      : listings.length
        ? "National discovery found listings but they lacked qualifying valuation data."
        : "No matching derivative listings in exact or provider-alias searches.",
    metadata: { durationMs: Date.now() - startedAt, yearMin, yearMax, ...metadata },
  });

  return NextResponse.json({
    source: "auto.dev", role: "discovery-and-qualified-candidates",
    candidateComps: candidateEvidence.comps,
    candidateDiagnostics: candidateEvidence.diagnostics,
    query: {
      year, make, model, trim: trim || null, yearMin, yearMax,
      generation: generation?.generation || null, sampleLimit: 20,
    },
    discovery: {
      strategy: lastAttempt?.label || "exhausted",
      attempts: attemptsResult,
      normalizedIdentityUsed: attemptsResult.some(a => a.model !== model),
    },
    total, returned: listings.length, sampleCapped: exactTotal > 20,
    byState, recommendedMarkets: buildRecommendedMarkets(listings, target, 8),
    listings,
  });
}
