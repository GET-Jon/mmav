import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

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

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const supabase = createSupabaseAdminClient();

    const id = toStringOrNull(body.id);

    const decodedVehicle = body.decodedVehicle || {};
    const valuationInput = body.valuationInput || {};
    const valuation = body.valuation || {};

    const row = {
      status: body.status || "watching",

      vin: toStringOrNull(decodedVehicle.vin),
      vehicle_title: toStringOrNull(body.vehicleTitle),

      year: toInteger(decodedVehicle.year),
      make: toStringOrNull(decodedVehicle.make),
      model: toStringOrNull(decodedVehicle.model),
      trim: toStringOrNull(decodedVehicle.trim),
      mileage: toInteger(body.targetMileage),

      auction_site: toStringOrNull(body.auctionSite),
      auction_url: toStringOrNull(body.auctionUrl),
      auction_ends_at: body.auctionEndsAt || null,

      current_bid: toNumber(valuationInput.currentBid),
      target_resale_used: toNumber(valuationInput.targetResaleUsed),

      safe_bid: toNumber(valuation.safeBid),
      max_smart_bid: toNumber(valuation.maxSmartBid),
      stretch_bid: toNumber(valuation.stretchBid),
      expected_gross_profit: toNumber(valuation.expectedGrossProfit),

      decision: toStringOrNull(valuation.decision),
      risk_grade: toStringOrNull(valuation.riskGrade),

      payload: body,
    };

    if (id) {
      const { data, error } = await supabase
        .from("auction_evaluations")
        .update(row)
        .eq("id", id)
        .select("id, updated_at")
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({
        id: data.id,
        savedAt: data.updated_at,
        mode: "updated",
      });
    }

    const { data, error } = await supabase
      .from("auction_evaluations")
      .insert(row)
      .select("id, created_at")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
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
      { status: 500 }
    );
  }
}
