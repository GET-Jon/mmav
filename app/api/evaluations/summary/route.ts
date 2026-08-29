import { NextResponse } from "next/server";
import { generateEvaluationSummary, type EvaluationSummaryInput } from "@/lib/ai";
import { buildEvaluatorIntelligenceContext } from "@/lib/lot-logic-intelligence/evaluator-context";
import { getCurrentCompanyForUser } from "@/lib/supabase/company";
import {
  createSupabaseServerAuthClient,
  getCurrentUser,
} from "@/lib/supabase/server-auth";

export const runtime = "nodejs";

function cleanNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/[$,]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function cleanString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function cleanStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 20);
}

function cleanThesisMode(value: unknown) {
  if (
    value === "financial" ||
    value === "enthusiast" ||
    value === "balanced"
  ) {
    return value;
  }

  return "balanced";
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const input: EvaluationSummaryInput = {
      thesisMode: cleanThesisMode(body.thesisMode),
      vehicleTitle: cleanString(body.vehicleTitle),
      vin: cleanString(body.vin),
      mileage: cleanNumber(body.mileage),
      auctionSite: cleanString(body.auctionSite),
      currentBid: cleanNumber(body.currentBid),

      marketCompAverage: cleanNumber(body.marketCompAverage),
      medianAdjusted: cleanNumber(body.medianAdjusted),
      finalRetailTarget: cleanNumber(body.finalRetailTarget),
      safeBid: cleanNumber(body.safeBid),
      maxSmartBid: cleanNumber(body.maxSmartBid),
      stretchBid: cleanNumber(body.stretchBid),
      expectedGrossProfit: cleanNumber(body.expectedGrossProfit),

      riskGrade: cleanString(body.riskGrade),
      decision: cleanString(body.decision),
      compConfidence: cleanString(body.compConfidence),
      includedCompCount: cleanNumber(body.includedCompCount),
      totalCompCount: cleanNumber(body.totalCompCount),

      dealerFitScore: cleanNumber(body.dealerFitScore),
      dealerFitLabel: cleanString(body.dealerFitLabel),
      dealerFitCategory: cleanString(body.dealerFitCategory),
      dealerFitGeneration: cleanString(body.dealerFitGeneration),
      dealerFitReasons: cleanStringArray(body.dealerFitReasons),
      dealerFitCautions: cleanStringArray(body.dealerFitCautions),

      mindfulIntelligenceMatched:
        body.mindfulIntelligenceMatched === true,
      mindfulIntelligenceTitle:
        cleanString(body.mindfulIntelligenceTitle),
      mindfulIntelligenceMatchLevel:
        cleanString(body.mindfulIntelligenceMatchLevel),
      mindfulIntelligenceConfidence:
        cleanString(body.mindfulIntelligenceConfidence),
      mindfulIntelligenceVerdict:
        cleanString(body.mindfulIntelligenceVerdict),
      mindfulIntelligenceRationale:
        cleanString(body.mindfulIntelligenceRationale),
      mindfulIntelligenceOpportunityTypes:
        cleanStringArray(body.mindfulIntelligenceOpportunityTypes),
      mindfulIntelligenceStrengths:
        cleanStringArray(body.mindfulIntelligenceStrengths),
      mindfulIntelligenceLimitations:
        cleanStringArray(body.mindfulIntelligenceLimitations),
      mindfulIntelligenceKnownIssues:
        cleanStringArray(body.mindfulIntelligenceKnownIssues),
      mindfulIntelligenceVerificationItems:
        cleanStringArray(body.mindfulIntelligenceVerificationItems),
      mindfulIntelligenceSourceSection:
        cleanString(body.mindfulIntelligenceSourceSection),

      lotLogicIntelligenceContext: [],
      selectedConditionRules: cleanStringArray(body.selectedConditionRules),
      notes: cleanString(body.notes),
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
        const issueText = [
          ...(input.selectedConditionRules ?? []),
          ...(input.mindfulIntelligenceKnownIssues ?? []),
          ...(input.dealerFitCautions ?? []),
        ].join("; ");
        const intelligence = await buildEvaluatorIntelligenceContext(
          supabase,
          company.companyId,
          {
            year: cleanString(body.year ?? body.vehicle?.year),
            make: cleanString(body.make ?? body.vehicle?.make),
            model: cleanString(body.model ?? body.vehicle?.model),
            trim: cleanString(body.trim ?? body.vehicle?.trim),
            mileage: input.mileage,
          },
          issueText,
        );
        input.lotLogicIntelligenceContext = intelligence.lines;
        intelligenceMeta = {
          applied: intelligence.lines.length > 0,
          assertionsUsed: intelligence.assertionsUsed,
          issueRelationsUsed: intelligence.issueRelationsUsed,
        };
      }
    } catch (error) {
      console.warn("Lot Logic Intelligence context unavailable for evaluation summary:", error);
    }

    const summary = await generateEvaluationSummary(input);

    return NextResponse.json({ summary, intelligence: intelligenceMeta });
  } catch (error) {
    console.error("Evaluation summary generation failed:", error);

    return NextResponse.json(
      { error: "Failed to generate evaluation summary." },
      { status: 500 }
    );
  }
}
