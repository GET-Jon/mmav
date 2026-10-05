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
import { normalizeVehicleText } from "@/lib/marketcheck/vehicle-identity";
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

function mergeAiProfile(
  baseline: VehicleIdentityProfile,
  ai: Record<string, unknown>,
): VehicleIdentityProfile {
  const family = normalizeVehicleText(baseline.modelFamily).replace(/\s+/g, "");
  const sourceModel = normalizeVehicleText(
    baseline.displayName,
  ).replace(/\s+/g, "");

  const aiAliases = cleanStringArray(ai.providerAliases, 8).filter((alias) => {
    const compact = normalizeVehicleText(alias).replace(/\s+/g, "");
    if (!compact) return false;

    // AI aliases are retrieval hints only, but still require a recognizable
    // relationship to the deterministic model family/source identity.
    return (
      !family ||
      compact.includes(family) ||
      family.includes(compact) ||
      sourceModel.includes(compact)
    );
  });

  const aiExclusions = cleanStringArray(ai.hardExclusions, 8);
  const aiNotes = cleanStringArray(ai.notes, 6, 180);
  const generationLabel = cleanString(ai.generation, 120);

  return {
    ...baseline,
    source: "ai-assisted",
    generation: baseline.generation || generationLabel || null,
    providerAliases: unique(
      [...baseline.providerAliases, ...aiAliases],
      8,
    ),
    hardExclusions: unique(
      [...baseline.hardExclusions, ...aiExclusions],
      10,
    ),
    notes: unique(
      [
        ...baseline.notes,
        ...aiNotes,
        "AI identity hints can broaden retrieval, but deterministic vehicle-equivalence rules decide what may influence valuation.",
      ],
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
        "Use the decoded VIN facts and deterministic baseline to clarify provider naming only.",
        "Keep body style, powertrain, performance variant, and materially different models separate.",
        "A provider alias may broaden retrieval, but it does not make a different vehicle equivalent.",
        "If uncertain, omit the claim.",
        "Return JSON only.",
      ].join("\n"),
      prompt: JSON.stringify({
        task: "Refine a vehicle identity profile for comp-search retrieval.",
        decodedVehicle: decoded,
        deterministicBaseline: baseline,
        outputShape: {
          generation: "string or empty string",
          providerAliases: [
            "up to 6 model names a listing provider might use for this same model family/configuration",
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
    const profile = mergeAiProfile(baseline, ai);

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
