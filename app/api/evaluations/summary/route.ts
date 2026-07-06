import { NextResponse } from "next/server";
import { generateEvaluationSummary, type EvaluationSummaryInput } from "@/lib/ai";

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

      selectedConditionRules: cleanStringArray(body.selectedConditionRules),
      notes: cleanString(body.notes),
    };

    const summary = await generateEvaluationSummary(input);

    return NextResponse.json({ summary });
  } catch (error) {
    console.error("Evaluation summary generation failed:", error);

    return NextResponse.json(
      { error: "Failed to generate evaluation summary." },
      { status: 500 }
    );
  }
}
