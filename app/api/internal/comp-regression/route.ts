import { NextResponse } from "next/server";
import { assertVehicleEquivalenceRegressionCases } from "@/lib/marketcheck/vehicle-equivalence-regression";

export async function GET() {
  try {
    const result = assertVehicleEquivalenceRegressionCases();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown regression failure",
      },
      { status: 500 },
    );
  }
}
