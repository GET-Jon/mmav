import { NextResponse } from "next/server";
import { assertCompValuationRegressionCases } from "@/lib/comps-regression";
import { assertVehicleEquivalenceRegressionCases } from "@/lib/marketcheck/vehicle-equivalence-regression";

export async function GET() {
  try {
    const equivalence = assertVehicleEquivalenceRegressionCases();
    const valuation = assertCompValuationRegressionCases();

    return NextResponse.json({
      ok: true,
      equivalence,
      valuation,
      totalPassed: equivalence.passed + valuation.passed,
    });
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
