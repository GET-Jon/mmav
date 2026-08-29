import { NextResponse } from "next/server";
import {
  generateConditionAnalysis,
  type ConditionAnalysisInput,
} from "@/lib/ai";
import { buildEvaluatorIntelligenceContext } from "@/lib/lot-logic-intelligence/evaluator-context";
import { getCurrentCompanyForUser } from "@/lib/supabase/company";
import {
  createSupabaseServerAuthClient,
  getCurrentUser,
} from "@/lib/supabase/server-auth";

export const runtime = "nodejs";

function cleanString(value: unknown, maxLength = 500) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function cleanNumber(value: unknown) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.replace(/[$,]/g, ""))
        : Number.NaN;

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const rawIssueText = cleanString(body.rawIssueText, 20_000);

    if (!rawIssueText) {
      return NextResponse.json(
        { error: "Condition information is required." },
        { status: 400 },
      );
    }

    const input: ConditionAnalysisInput = {
      vehicle: {
        year: cleanString(body.vehicle?.year, 20),
        make: cleanString(body.vehicle?.make, 100),
        model: cleanString(body.vehicle?.model, 100),
        trim: cleanString(body.vehicle?.trim, 150),
        mileage: cleanNumber(body.vehicle?.mileage),
        vin: cleanString(body.vehicle?.vin, 30),
        location: cleanString(body.vehicle?.location, 150),
      },
      auctionSite: cleanString(body.auctionSite, 150),
      sourceType: cleanString(body.sourceType, 100),
      rawIssueText,
      lotLogicIntelligenceContext: [],
    };

    let intelligenceMeta = {
      applied: false,
      assertionsUsed: 0,
      issueRelationsUsed: 0,
    };

    try {
      const user = await getCurrentUser();
      if (user) {
        const supabase = await createSupabaseServerAuthClient();
        const company = await getCurrentCompanyForUser(supabase, user.id);
        const intelligence = await buildEvaluatorIntelligenceContext(
          supabase,
          company.companyId,
          {
            year: input.vehicle.year,
            make: input.vehicle.make,
            model: input.vehicle.model,
            trim: input.vehicle.trim,
            mileage: input.vehicle.mileage,
          },
          rawIssueText,
        );
        input.lotLogicIntelligenceContext = intelligence.lines;
        intelligenceMeta = {
          applied: intelligence.lines.length > 0,
          assertionsUsed: intelligence.assertionsUsed,
          issueRelationsUsed: intelligence.issueRelationsUsed,
        };
      }
    } catch (error) {
      console.warn("Lot Logic Intelligence context unavailable for condition analysis:", error);
    }

    const analysis = await generateConditionAnalysis(input);

    return NextResponse.json({ analysis, intelligence: intelligenceMeta });
  } catch (error) {
    console.error("Condition analysis generation failed:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to analyze vehicle condition.",
      },
      { status: 500 },
    );
  }
}
