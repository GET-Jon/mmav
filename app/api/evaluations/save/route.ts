import { NextResponse } from "next/server";
import { recordPrediction } from "@/lib/lot-logic-intelligence";
import { getCurrentCompanyForUser } from "@/lib/supabase/company";
import {
  createSupabaseServerAuthClient,
  getCurrentUser,
} from "@/lib/supabase/server-auth";

type JsonRecord = Record<string, unknown>;

function toRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toInteger(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

function toStringOrNull(value: unknown) {
  const clean = String(value || "").trim();
  return clean || null;
}

function evaluationSubjectKey(prefix: string, make: string | null, model: string | null) {
  return [prefix, make || "unknown_make", model || "unknown_model"].join("_");
}

async function recordEvaluationPredictions(args: {
  supabase: Awaited<ReturnType<typeof createSupabaseServerAuthClient>>;
  companyId: string;
  userId: string;
  evaluationId: string;
  body: JsonRecord;
  row: JsonRecord;
}) {
  const { supabase, companyId, userId, evaluationId, body, row } = args;
  const valuation = toRecord(body.valuation);
  const valuationInput = toRecord(body.valuationInput);
  const conditionAnalysis = toRecord(body.conditionAnalysis);
  const modelName = (process.env.AI_MODEL ?? "gemini-3.1-flash-lite")
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/^models\//, "");

  const make = toStringOrNull(row.make);
  const model = toStringOrNull(row.model);
  const contextSnapshot = {
    source: "evaluator_save",
    vehicle: {
      year: row.year,
      make: row.make,
      model: row.model,
      trim: row.trim,
      mileage: row.mileage,
      vin: row.vin,
    },
    auctionSite: row.auction_site,
    currentBid: toNumber(valuationInput.currentBid),
    targetRetail: toNumber(valuationInput.targetResaleUsed),
    riskGrade: row.risk_grade,
  };

  const writes: Promise<unknown>[] = [];

  if (
    toNumber(valuation.safeBid) !== null ||
    toNumber(valuation.maxSmartBid) !== null ||
    toNumber(valuation.stretchBid) !== null
  ) {
    writes.push(
      recordPrediction(supabase, {
        companyId,
        evaluationId,
        predictionType: "bid",
        subjectKey: evaluationSubjectKey("bid", make, model),
        predictedValue: {
          safeBid: toNumber(valuation.safeBid),
          maxSmartBid: toNumber(valuation.maxSmartBid),
          stretchBid: toNumber(valuation.stretchBid),
          expectedGrossProfit: toNumber(valuation.expectedGrossProfit),
          decision: toStringOrNull(valuation.decision),
          riskGrade: toStringOrNull(valuation.riskGrade),
          finalRetailTarget: toNumber(
            body.finalRetailTarget ?? valuationInput.targetResaleUsed,
          ),
        },
        modelProvider: process.env.AI_PROVIDER ?? "google",
        modelName,
        promptVersion: "evaluator-v15-intelligence-1",
        contextSnapshot,
        createdBy: userId,
      }),
    );
  }

  const reconPlanning = toNumber(
    conditionAnalysis.planningEstimate ??
      body.conditionAnalysisPlanningEstimate ??
      body.reconditioningCost,
  );
  const reconLow = toNumber(conditionAnalysis.estimatedCostLow);
  const reconHigh = toNumber(conditionAnalysis.estimatedCostHigh);

  if (reconPlanning !== null || reconLow !== null || reconHigh !== null) {
    writes.push(
      recordPrediction(supabase, {
        companyId,
        evaluationId,
        predictionType: "recon_total",
        subjectKey: evaluationSubjectKey("recon", make, model),
        predictedCostLow: reconLow ?? reconPlanning,
        predictedCostHigh: reconHigh ?? reconPlanning,
        predictedElapsedMinutes:
          toNumber(conditionAnalysis.estimatedReadyDaysHigh) !== null
            ? Math.round(Number(conditionAnalysis.estimatedReadyDaysHigh) * 24 * 60)
            : null,
        predictedValue: {
          planningEstimate: reconPlanning,
          readyDaysLow: toNumber(conditionAnalysis.estimatedReadyDaysLow),
          readyDaysHigh: toNumber(conditionAnalysis.estimatedReadyDaysHigh),
          applied: body.conditionAnalysisApplied === true,
        },
        modelProvider: process.env.AI_PROVIDER ?? "google",
        modelName,
        promptVersion: "condition-analysis-v15-intelligence-1",
        contextSnapshot,
        createdBy: userId,
      }),
    );
  }

  if (writes.length) await Promise.all(writes);
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = toRecord(await request.json());

    const supabase = await createSupabaseServerAuthClient();
    const company = await getCurrentCompanyForUser(supabase, user.id);

    const id = toStringOrNull(body.id);

    const decodedVehicle = toRecord(body.decodedVehicle);
    const manualVehicle = toRecord(body.manualVehicle);
    const valuationInput = toRecord(body.valuationInput);
    const valuation = toRecord(body.valuation);

    const row: JsonRecord = {
      company_id: company.companyId,
      status: toStringOrNull(body.status) ?? "watching",

      vin: toStringOrNull(decodedVehicle.vin ?? body.vin),
      vehicle_title: toStringOrNull(body.vehicleTitle),

      year: toInteger(decodedVehicle.year ?? manualVehicle.year),
      make: toStringOrNull(decodedVehicle.make ?? manualVehicle.make),
      model: toStringOrNull(decodedVehicle.model ?? manualVehicle.model),
      trim: toStringOrNull(decodedVehicle.trim ?? manualVehicle.trim),
      mileage: toInteger(body.targetMileage),

      auction_site: toStringOrNull(body.auctionSite),
      auction_url: toStringOrNull(body.auctionUrl),
      auction_ends_at: body.auctionEndsAt ?? null,

      current_bid: toNumber(valuationInput.currentBid),
      target_resale_used: toNumber(valuationInput.targetResaleUsed),

      safe_bid: toNumber(valuation.safeBid),
      max_smart_bid: toNumber(valuation.maxSmartBid),
      stretch_bid: toNumber(valuation.stretchBid),
      expected_gross_profit: toNumber(valuation.expectedGrossProfit),

      decision: toStringOrNull(valuation.decision),
      risk_grade: toStringOrNull(valuation.riskGrade),

      updated_by: user.id,

      payload: body,
    };

    if (id) {
      const { data, error } = await supabase
        .from("auction_evaluations")
        .update(row)
        .eq("id", id)
        .eq("company_id", company.companyId)
        .select("id, updated_at")
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      try {
        await recordEvaluationPredictions({
          supabase,
          companyId: company.companyId,
          userId: user.id,
          evaluationId: data.id,
          body,
          row,
        });
      } catch (error) {
        console.warn("Evaluation saved but intelligence snapshot failed:", error);
      }

      return NextResponse.json({
        id: data.id,
        savedAt: data.updated_at,
        mode: "updated",
      });
    }

    const { data, error } = await supabase
      .from("auction_evaluations")
      .insert({
        ...row,
        created_by: user.id,
      })
      .select("id, created_at")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    try {
      await recordEvaluationPredictions({
        supabase,
        companyId: company.companyId,
        userId: user.id,
        evaluationId: data.id,
        body,
        row,
      });
    } catch (error) {
      console.warn("Evaluation saved but intelligence snapshot failed:", error);
    }

    return NextResponse.json({
      id: data.id,
      savedAt: data.created_at,
      mode: "created",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to save evaluation.",
      },
      { status: 500 },
    );
  }
}
