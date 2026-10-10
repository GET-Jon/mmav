import { NextResponse } from "next/server";
import { GoogleAiTextClient } from "@/lib/ai/providers/google";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import {
  checkUsageAllowance,
  recordUsageEvent,
  vehicleUsageSubject,
} from "@/lib/billing/usage";
import {
  buildDeterministicVehicleIdentityProfile,
  type VehicleIdentityProfile,
} from "@/lib/evaluation/vehicle-identity-profile";
import {
  canonicalBodyClass,
  canonicalDrivetrain,
  canonicalFuelType,
  canonicalModelFamily,
  normalizeVehicleText,
  resolveSemanticFuelType,
} from "@/lib/marketcheck/vehicle-identity";
import {
  evaluateVehicleEquivalence,
  type VehicleIdentity,
} from "@/lib/marketcheck/vehicle-equivalence";
import type { VinDecodeResult } from "@/types/vin";

export const runtime = "nodejs";

function getGoogleClient() {
  const apiKey =
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.GOOGLE_AI_API_KEY;

  if (!apiKey) return null;

  return new GoogleAiTextClient({
    apiKey,
    model: (process.env.AI_MODEL ?? "gemini-3.1-flash-lite")
      .trim()
      .replace(/^["']|["']$/g, "")
      .replace(/^models\//, ""),
  });
}

function cleanString(value: unknown, maxLength = 160) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function cleanStringArray(value: unknown, maxItems = 8, maxLength = 120) {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().slice(0, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

function parseJsonObject(text: string) {
  const cleaned = text
    .trim()
    .replace(/^\`\`\`(?:json)?\s*/i, "")
    .replace(/\s*\`\`\`$/i, "");

  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start < 0 || end <= start) return {};
    try {
      return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
}

function unique(values: string[], maxItems = 10) {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const raw of values) {
    const value = raw.trim();
    const key = normalizeVehicleText(value);
    if (!value || !key || seen.has(key)) continue;
    seen.add(key);
    result.push(value);
    if (result.length >= maxItems) break;
  }

  return result;
}

function baselineIdentity(
  baseline: VehicleIdentityProfile,
  decoded: VinDecodeResult,
): VehicleIdentity {
  return {
    year: Number(decoded.year) || baseline.year || 0,
    make: decoded.make || baseline.make,
    model: baseline.modelFamily || decoded.model,
    trim: baseline.variant || decoded.trim,
    bodyType: baseline.bodyClass || decoded.bodyClass,
    drivetrain: baseline.drivetrain || decoded.driveType,
    fuelType: baseline.fuelType || decoded.fuelType,
  };
}

function modelCandidateIsSafe(
  candidate: string,
  baseline: VehicleIdentityProfile,
  decoded: VinDecodeResult,
) {
  const normalizedCandidate = normalizeVehicleText(candidate);
  const normalizedBaseline = normalizeVehicleText(baseline.modelFamily);
  if (!normalizedCandidate) return false;

  if (normalizedCandidate === normalizedBaseline) {
    return true;
  }

  // Parenthetical VIN-decoder annotations are safe to remove when the remaining
  // model name is unchanged. This handles cases such as
  // "RAV4 Prime (PHEV)" -> "RAV4 Prime" without allowing the AI to collapse
  // "RAV4 Prime" all the way to ordinary "RAV4".
  const decodedWithoutAnnotations = normalizeVehicleText(
    String(decoded.model || "").replace(/\([^)]*\)/g, " "),
  );
  if (
    decodedWithoutAnnotations &&
    normalizedCandidate === decodedWithoutAnnotations
  ) {
    return true;
  }

  const target = baselineIdentity(baseline, decoded);
  const candidateIdentity: VehicleIdentity = {
    ...target,
    model: candidate,
  };
  const equivalence = evaluateVehicleEquivalence({
    target,
    candidate: candidateIdentity,
  });

  // This deliberately rejects performance derivatives such as M4 when the
  // baseline is an ordinary 4 Series, while allowing aliases such as 428i.
  return equivalence.tier === "direct" || equivalence.tier === "near";
}

function variantCandidateIsSafe(
  candidate: string,
  baseline: VehicleIdentityProfile,
  decoded: VinDecodeResult,
) {
  const normalizedCandidate = normalizeVehicleText(candidate);
  if (!normalizedCandidate) return false;

  const candidateCompact = normalizedCandidate.replace(/\s+/g, "");
  const baselineCompact = normalizeVehicleText(baseline.variant).replace(
    /\s+/g,
    "",
  );
  const decodedCompact = normalizeVehicleText(
    [decoded.model, decoded.trim].filter(Boolean).join(" "),
  ).replace(/\s+/g, "");

  return Boolean(
    (baselineCompact &&
      (candidateCompact.includes(baselineCompact) ||
        baselineCompact.includes(candidateCompact))) ||
      (decodedCompact && decodedCompact.includes(candidateCompact)),
  );
}

function mergeCanonicalField(
  baselineValue: string | null,
  aiValue: string | null,
) {
  if (!aiValue) return baselineValue;
  if (!baselineValue) return aiValue;
  return baselineValue === aiValue ? aiValue : baselineValue;
}

function mergeAiProfile(
  baseline: VehicleIdentityProfile,
  ai: Record<string, unknown>,
  decoded: VinDecodeResult,
): VehicleIdentityProfile {
  const requestedModelFamily =
    cleanString(ai.modelFamily, 120) ||
    cleanString(ai.canonicalModel, 120);
  const modelFamily =
    requestedModelFamily &&
    modelCandidateIsSafe(requestedModelFamily, baseline, decoded)
      ? requestedModelFamily
      : baseline.modelFamily;

  const requestedVariant =
    cleanString(ai.variant, 120) ||
    cleanString(ai.comparisonVariant, 120);
  const variant =
    requestedVariant &&
    variantCandidateIsSafe(requestedVariant, baseline, decoded)
      ? normalizeVehicleText(requestedVariant)
      : baseline.variant;

  const requestedFuelType = canonicalFuelType(cleanString(ai.fuelType, 80));
  const requestedDrivetrain = canonicalDrivetrain(
    cleanString(ai.drivetrain, 80),
  );
  const requestedBodyClass = canonicalBodyClass({
    year: Number(decoded.year) || baseline.year || 0,
    make: decoded.make || baseline.make,
    model: modelFamily,
    trim: variant,
    bodyType: cleanString(ai.bodyClass, 80),
    drivetrain: requestedDrivetrain || baseline.drivetrain,
    fuelType: requestedFuelType || baseline.fuelType,
  });

  const fuelType =
    resolveSemanticFuelType({
      make: decoded.make || baseline.make,
      model: decoded.model || modelFamily,
      trim: decoded.trim || variant,
      fuelType: baseline.fuelType,
      aiFuelType: requestedFuelType,
    }) || "";
  const drivetrain = mergeCanonicalField(
    baseline.drivetrain,
    requestedDrivetrain,
  );
  const bodyClass = mergeCanonicalField(
    baseline.bodyClass,
    requestedBodyClass,
  );

  const aiAliases = cleanStringArray(ai.providerAliases, 8).filter((alias) =>
    modelCandidateIsSafe(alias, baseline, decoded),
  );
  const aiExclusions = cleanStringArray(ai.hardExclusions, 8);
  const aiNotes = cleanStringArray(ai.notes, 6, 180);
  const generationLabel = cleanString(ai.generation, 120);

  const providerAliases = unique(
    [
      modelFamily,
      ...baseline.providerAliases,
      ...aiAliases,
    ],
    8,
  );

  return {
    ...baseline,
    source: "ai-assisted",
    modelFamily,
    variant,
    bodyClass,
    drivetrain,
    fuelType,
    generation: baseline.generation || generationLabel || null,
    providerAliases,
    hardExclusions: unique(
      [...baseline.hardExclusions, ...aiExclusions],
      10,
    ),
    notes: unique(
      [
        ...baseline.notes,
        ...aiNotes,
        modelFamily !== baseline.modelFamily
          ? `AI normalized the decoder model “${baseline.modelFamily}” to the comp-search identity “${modelFamily}”.`
          : null,
        fuelType !== baseline.fuelType && fuelType
          ? `Semantic identity corrected fuel type from “${baseline.fuelType || "unknown"}” to “${fuelType}” using corroborating vehicle-name evidence.`
          : null,
        "AI-normalized identity feeds retrieval and target classification; deterministic vehicle-equivalence rules still prevent materially different vehicles from becoming valuation comps.",
      ].filter((value): value is string => Boolean(value)),
      10,
    ),
  };
}

function asDecodedVehicle(value: unknown): VinDecodeResult | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;

  const decoded: VinDecodeResult = {
    vin: cleanString(row.vin, 30),
    status: cleanString(row.status, 250),
    year: cleanString(row.year, 10),
    make: cleanString(row.make, 100),
    model: cleanString(row.model, 120),
    trim: cleanString(row.trim, 160),
    bodyClass: cleanString(row.bodyClass, 180),
    doors: cleanString(row.doors, 10),
    engineCylinders: cleanString(row.engineCylinders, 30),
    displacementL: cleanString(row.displacementL, 30),
    driveType: cleanString(row.driveType, 120),
    fuelType: cleanString(row.fuelType, 120),
    plantCountry: cleanString(row.plantCountry, 100),
  };

  return decoded.year && decoded.make && decoded.model ? decoded : null;
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = await request.json();
  const decoded = asDecodedVehicle(body.decodedVehicle);

  if (!decoded) {
    return NextResponse.json(
      { error: "A decoded vehicle is required." },
      { status: 400 },
    );
  }

  const baseline = buildDeterministicVehicleIdentityProfile(decoded);
  const client = getGoogleClient();

  if (!client) {
    return NextResponse.json({
      profile: baseline,
      aiEnhanced: false,
      reason: "AI identity enhancement is not configured; deterministic identity is ready.",
    });
  }

  const admin = createSupabaseAdminClient();
  const subjectKey = vehicleUsageSubject({
    vin: decoded.vin,
    year: decoded.year,
    make: decoded.make,
    model: decoded.model,
    trim: decoded.trim,
  });

  const allowance = await checkUsageAllowance({
    supabase: admin,
    userId: user.id,
    kind: "provider_api_call",
    expectedUnits: 1,
  });

  if (!allowance.allowed) {
    return NextResponse.json({
      profile: baseline,
      aiEnhanced: false,
      reason: "Deterministic identity is ready; AI enrichment was skipped by the provider-call limit.",
    });
  }

  try {
    const result = await client.generateText({
      usageFeature: "vehicle_identity_profile",
      responseMimeType: "application/json",
      temperature: 0.1,
      maxOutputTokens: 450,
      system: [
        "You are a vehicle identity normalization assistant for a professional dealer valuation tool.",
        "Your task is NOT to value the vehicle and NOT to invent replacement comps.",
        "Use the decoded VIN facts and deterministic baseline to create the canonical identity the comp engine should search and qualify against.",
        "Separate provider/model naming from trim, body style, drivetrain, and fuel/powertrain descriptors.",
        "Keep materially meaningful named derivatives in the model identity when dropping them would mix different vehicles. Example: RAV4 Prime stays RAV4 Prime; remove only the redundant PHEV annotation from RAV4 Prime (PHEV).",
        "For BMW-style taxonomy, a model code such as 428i can belong to the 4 Series family, but an M4 is a materially different performance derivative and must not be treated as the same direct-comp identity.",
        "Provider aliases must describe the same comparable vehicle identity, not merely a related model family.",
        "VIN decoders sometimes return a Series/Trim field that is actually a list of possible trims. Never treat a comma-separated option list as one exact trim. If the exact trim is not proven, leave variant empty rather than guessing.",
        "If uncertain, omit the claim.",
        "Return JSON only.",
      ].join("\n"),
      prompt: JSON.stringify({
        task: "Refine a vehicle identity profile for comp-search retrieval.",
        decodedVehicle: decoded,
        deterministicBaseline: baseline,
        outputShape: {
          modelFamily:
            "canonical provider-comparable model identity; remove redundant decoder annotations, but retain named derivatives needed to avoid mixing materially different vehicles",
          variant:
            "trim/engine/performance derivative within that model identity, excluding redundant drivetrain/fuel labels",
          fuelType:
            "canonical fuel/powertrain type such as gasoline, diesel, hybrid, plug-in hybrid, or electric",
          drivetrain:
            "canonical drivetrain when clearly supported, otherwise empty string",
          bodyClass:
            "canonical body class when clearly supported, otherwise empty string",
          generation: "string or empty string",
          providerAliases: [
            "up to 6 provider/listing model names for the same comparable vehicle identity; do not include materially different performance or powertrain variants",
          ],
          hardExclusions: [
            "short descriptions of materially different vehicles that must not qualify",
          ],
          notes: [
            "short identity/search notes; do not suggest values or prices",
          ],
        },
      }),
    });

    const ai = parseJsonObject(result.text);
    const profile = mergeAiProfile(baseline, ai, decoded);

    await recordUsageEvent({
      supabase: admin,
      companyId: allowance.summary.company.companyId,
      userId: user.id,
      kind: "provider_api_call",
      subjectKey,
      units: 1,
      metadata: {
        provider: "google_ai",
        feature: "vehicle_identity_profile",
        source: profile.source,
      },
    });

    return NextResponse.json({ profile, aiEnhanced: true });
  } catch (error) {
    console.warn("Vehicle identity AI enrichment unavailable:", error);

    return NextResponse.json({
      profile: baseline,
      aiEnhanced: false,
      reason:
        "AI identity enrichment was unavailable; deterministic identity is still ready.",
    });
  }
}
