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

export const dynamic = "force-dynamic";

type AutoDevListing = { vin: string | null; year: number | null; make: string | null; model: string | null; trim: string | null; drivetrain: string | null; fuelType: string | null; bodyType: string | null; price: number | null; miles: number | null; dealer: string | null; city: string | null; state: string | null; zip: string | null; url: string | null; longitude: number | null; latitude: number | null; equivalenceTier?: VehicleEquivalenceTier; };
type DiscoveryAttempt = { label: string; make: string; model: string; yearMin: number; yearMax: number };

function toNumber(value: unknown): number | null { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : null; }
function normalizeText(value: unknown) { return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
function uniqueStrings(values: Array<string | null | undefined>) { return Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean))); }

function buildDiscoveryModels(
  make: string,
  model: string,
  trim: string,
  providerAliases: string[] = [],
) {
  const models = [...providerAliases, model];
  const normalizedMake = normalizeText(make);
  const normalizedModel = normalizeText(model);
  const normalizedTrim = normalizeText(trim);
  if (normalizedMake.includes("mercedes")) {
    const eqBadge = normalizedTrim.match(/\b(eq[a-z]*\d*)/i)?.[1] || normalizedModel.match(/\b(eq[a-z]*)/i)?.[1];
    if (eqBadge) {
      const family = eqBadge.replace(/\d+$/g, "").toUpperCase();
      models.push(family);
      if (normalizedModel.includes("suv")) models.push(`${family} SUV`);
    }
    const withoutClass = model.replace(/[-\s]*class\b/gi, "").replace(/\s+/g, " ").trim();
    if (withoutClass && withoutClass !== model) models.push(withoutClass);
  }
  return uniqueStrings(models).slice(0, 4);
}

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
  const candidates = listings
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
  return rows.map((row: any) => { const vehicle = row?.vehicle || {}; const retail = row?.retailListing || {}; const location = Array.isArray(row?.location) ? row.location : []; return { vin: String(vehicle.vin || row?.vin || "").trim() || null, year: toNumber(vehicle.year), make: String(vehicle.make || "").trim() || null, model: String(vehicle.model || "").trim() || null, trim: String(vehicle.trim || "").trim() || null, drivetrain: String(vehicle.drivetrain || "").trim() || null, fuelType: String(vehicle.fuelType || vehicle.fuel || vehicle.powertrain || "").trim() || null, bodyType: String(vehicle.bodyType || vehicle.bodyStyle || "").trim() || null, price: toNumber(retail.price), miles: toNumber(retail.miles ?? retail.mileage), dealer: String(retail.dealer || "").trim() || null, city: String(retail.city || "").trim() || null, state: String(retail.state || "").trim() || null, zip: String(retail.zip || "").trim() || null, url: String(retail.vdp || "").trim() || null, longitude: toNumber(location[0]), latitude: toNumber(location[1]) }; });
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
  let selectedAttempt: DiscoveryAttempt | null = null; let selectedPayload: any = null; let listings: AutoDevListing[] = []; let callsMade = 0;
  let fallbackAttempt: DiscoveryAttempt | null = null; let fallbackPayload: any = null; let fallbackListings: AutoDevListing[] = []; let fallbackScore = -1;
  const attemptResults: Array<{ label: string; model: string; returned: number; total: number; directNear: number; supporting: number }> = [];

  for (const attempt of attempts) {
    const providerAllowance = await checkUsageAllowance({ supabase: admin, userId: user.id, kind: "provider_api_call", subjectKey, expectedUnits: 1 });
    if (!providerAllowance.allowed) { if (callsMade === 0) return NextResponse.json({ error: providerAllowance.message, code: providerAllowance.code, usage: providerAllowance.summary }, { status: providerAllowance.status }); break; }
    const params = new URLSearchParams({ "vehicle.make": attempt.make, "vehicle.model": attempt.model, "vehicle.year": attempt.yearMin === attempt.yearMax ? String(attempt.yearMin) : `${attempt.yearMin}-${attempt.yearMax}`, "retailListing.used": "true", includes: "total", limit: "20", sort: "updatedAt.desc" });
    const upstream = await fetch(`https://api.auto.dev/listings?${params.toString()}`, { method: "GET", headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" }, cache: "no-store" }); callsMade += 1;
    const raw = await upstream.text(); let payload: any = null; try { payload = raw ? JSON.parse(raw) : null; } catch { payload = { message: raw }; }
    await recordUsageEvent({ supabase: admin, companyId: discoveryAllowance.summary.company.companyId, userId: user.id, kind: "provider_api_call", subjectKey, units: 1, metadata: { provider: "auto_dev", discoveryModel: attempt.model, failed: !upstream.ok } });
    if (!upstream.ok) return NextResponse.json({ error: "Auto.dev national discovery failed.", status: upstream.status, details: typeof payload?.message === "string" ? payload.message : typeof payload?.error === "string" ? payload.error : undefined }, { status: upstream.status });
    const attemptListings = mapListings(payload); const total = typeof payload?.total === "number" ? payload.total : attemptListings.length;
    const tiers = attemptListings.map((listing) =>
      evaluateVehicleEquivalence({
        target,
        candidate: {
          year: Number(listing.year || 0),
          make: listing.make || make,
          model: listing.model || attempt.model,
          trim: listing.trim || "",
          drivetrain: listing.drivetrain || "",
          fuelType: resolveSemanticFuelType({
            make: listing.make || make,
            model: listing.model || attempt.model,
            trim: listing.trim || "",
            fuelType: listing.fuelType || "",
          }),
          bodyType: listing.bodyType || "",
        },
      }).tier,
    );
    const directNear = tiers.filter((tier) => tier === "direct" || tier === "near").length;
    const supporting = tiers.filter((tier) => tier === "supporting").length;
    const attemptScore = tiers.reduce((sum, tier) => sum + discoveryTierWeight(tier), 0);
    attemptResults.push({ label: attempt.label, model: attempt.model, returned: attemptListings.length, total, directNear, supporting });

    if (directNear > 0) {
      selectedAttempt = attempt; selectedPayload = payload; listings = attemptListings; break;
    }

    if ((supporting > 0 || attemptListings.length > 0) && attemptScore > fallbackScore) {
      fallbackAttempt = attempt; fallbackPayload = payload; fallbackListings = attemptListings; fallbackScore = attemptScore;
    }
  }

  if (!selectedAttempt && fallbackAttempt) {
    selectedAttempt = fallbackAttempt;
    selectedPayload = fallbackPayload;
    listings = fallbackListings;
  }

  await recordUsageEvent({ supabase: admin, companyId: discoveryAllowance.summary.company.companyId, userId: user.id, kind: "auto_dev_discovery", subjectKey, metadata: { callsMade, attemptResults } });
  const byState = listings.reduce((acc: Record<string, number>, listing) => { const state = String(listing.state || "Unknown"); acc[state] = (acc[state] || 0) + 1; return acc; }, {});
  const total = selectedPayload && typeof selectedPayload.total === "number" ? selectedPayload.total : listings.length;
  await recordApiUsageEvent({ companyId: discoveryAllowance.summary.company.companyId, userId: user.id, provider: "auto_dev", endpoint: "/listings", vehicleYear: year, vehicleMake: make, vehicleModel: selectedAttempt?.model || model, apiCallsMade: callsMade, status: 200, stopReason: listings.length ? "Auto.dev national discovery found inventory." : "Auto.dev national discovery exhausted exact and normalized vehicle identities.", metadata: { durationMs: Date.now() - startedAt, yearMin, yearMax, returned: listings.length, total, attemptResults } });
  return NextResponse.json({ source: "auto.dev", role: "discovery-only", query: { year, make, model: selectedAttempt?.model || model, originalModel: model, trim: trim || null, yearMin, yearMax, generation: generation?.generation || null, sampleLimit: 20 }, discovery: { strategy: selectedAttempt?.label || "exhausted", attempts: attemptResults, normalizedIdentityUsed: Boolean(selectedAttempt && selectedAttempt.model !== model) }, total, returned: listings.length, sampleCapped: total > listings.length, byState, recommendedMarkets: buildRecommendedMarkets(listings, target, 3), listings });
}
