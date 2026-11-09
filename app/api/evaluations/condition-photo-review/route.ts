import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getCurrentUser, createSupabaseServerAuthClient } from "@/lib/supabase/server-auth";
import { getCurrentCompanyForUser } from "@/lib/supabase/company";
import { CONDITION_PHOTO_BUCKET, listIssuePhotos, photoScope, photoIssueId, photoMime } from "@/lib/evaluation/condition-photos";
import { checkUsageAllowance, recordUsageEvent } from "@/lib/billing/usage";

export const runtime = "nodejs";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
function safeText(value: unknown, max = 250) {
  return typeof value === "string" ? value.slice(0, max).trim() : "";
}
function strings(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").slice(0, 8).map((item) => item.slice(0, 350)) : [];
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  // A server-side entitlement boundary allows this feature to be packaged as a
  // paid extra later, without trusting a client-side flag.
  const accessMode = (process.env.LOT_LOGIC_PHOTO_DEEP_DIVE_ACCESS || "included").trim();
  if (accessMode === "disabled") {
    return NextResponse.json({ error: "Photo analysis is not currently available." }, { status: 403 });
  }
  if (accessMode === "paid") {
    // Fail closed until a paid-entitlement check is installed. Do not charge or
    // promise access simply because the UI sent a request.
    return NextResponse.json({ error: "Photo analysis requires the paid add-on.", code: "PHOTO_ADDON_REQUIRED" }, { status: 402 });
  }
  if (accessMode !== "included") return NextResponse.json({ error: "Photo review configuration is invalid." }, { status: 503 });

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  if (!isRecord(body) || !isRecord(body.issue)) {
    return NextResponse.json({ error: "An issue is required." }, { status: 400 });
  }
  let evaluationUsageId: string;
  let issueId: string;
  try {
    evaluationUsageId = photoScope(body.evaluationUsageId, "evaluation identifier");
    issueId = photoIssueId(body.issueId);
  } catch {
    return NextResponse.json({ error: "Invalid evaluation or issue reference." }, { status: 400 });
  }
  const companyClient = await createSupabaseServerAuthClient();
  const company = await getCurrentCompanyForUser(companyClient, user.id);
  const admin = createSupabaseAdminClient();
  const stored = await listIssuePhotos(company.companyId, user.id, evaluationUsageId, issueId);
  if (!stored.length || stored.length > 3) {
    return NextResponse.json({ error: "Upload one to three issue photos first." }, { status: 400 });
  }
  const images: Array<{ inlineData: { mimeType: string; data: string } }> = [];
  for (const photo of stored) {
    const { data, error } = await admin.storage.from(CONDITION_PHOTO_BUCKET).download(photo.path);
    if (error || !data) return NextResponse.json({ error: "Could not read stored photo." }, { status: 503 });
    const bytes = Buffer.from(await data.arrayBuffer());
    const mimeType = photoMime(bytes);
    if (!mimeType || bytes.length > 4 * 1024 * 1024) {
      return NextResponse.json({ error: "Stored photo format or size is invalid." }, { status: 400 });
    }
    images.push({ inlineData: { mimeType, data: bytes.toString("base64") } });
  }

  const subjectKey = `condition_photo:${user.id}:${evaluationUsageId}:${issueId.slice(0, 60)}`;
  const allowance = await checkUsageAllowance({ supabase: admin, userId: user.id,
    kind: "provider_api_call", subjectKey, expectedUnits: 1 });
  if (!allowance.allowed) {
    return NextResponse.json({ error: allowance.message, code: allowance.code }, { status: allowance.status });
  }

  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Photo analysis is not configured." }, { status: 503 });
  const model = (process.env.AI_PHOTO_MODEL || "gemini-2.5-flash").trim();
  const vehicle = isRecord(body.vehicle) ? body.vehicle : {};
  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model,
      contents: [{ role: "user", parts: [
        { text: JSON.stringify({
          vehicle: {
            year: safeText(vehicle.year), make: safeText(vehicle.make),
            model: safeText(vehicle.model), trim: safeText(vehicle.trim),
            mileage: Number(vehicle.mileage) || null,
          },
          issue: {
            description: safeText(body.issue.description, 800),
            category: safeText(body.issue.category),
            severity: safeText(body.issue.severity),
            certainty: safeText(body.issue.certainty),
            planningEstimate: Number(body.issue.planningEstimate) || 0,
            assumptions: strings(body.issue.assumptions),
          },
        }) },
        ...images,
      ] }],
      config: {
        responseMimeType: "application/json", temperature: 0.2,
        systemInstruction: `You assess photos of a USED VEHICLE for a professional dealer.
Focus strictly on the specified issue. Distinguish visible evidence from guesses.
Never imply images establish mechanical condition, hidden damage, repair prices,
VIN identity, or full extent of damage. Give a cautious USD planning suggestion
using the provided estimate as the starting reference, NOT as a quote.
Return only JSON with keys summary (string), visibleEvidence (string array),
limitations (string array), suggestedPlanningEstimate (nonnegative number).
Include nonvisible damage and need for physical inspection in limitations.`,
      },
    });
    const parsed: unknown = JSON.parse(response.text || "{}");
    if (!isRecord(parsed) || typeof parsed.summary !== "string" ||
        !Number.isFinite(Number(parsed.suggestedPlanningEstimate)) ||
        Number(parsed.suggestedPlanningEstimate) < 0) {
      throw new Error("Invalid photo analysis response");
    }
    const review = {
      summary: safeText(parsed.summary, 2000),
      visibleEvidence: strings(parsed.visibleEvidence),
      limitations: strings(parsed.limitations),
      suggestedPlanningEstimate: Math.round(Number(parsed.suggestedPlanningEstimate)),
    };
    await recordUsageEvent({
      supabase: admin, companyId: allowance.summary.company.companyId,
      userId: user.id, kind: "provider_api_call", subjectKey, units: 1,
      metadata: { provider: "google_ai", feature: "condition_photo_review", model, photoCount: images.length },
    });
    return NextResponse.json({ review });
  } catch (error) {
    console.error("Condition photo review failed", error);
    return NextResponse.json({ error: "Photo analysis could not be completed. Please retry." }, { status: 503 });
  }
}
