import { NextResponse } from "next/server";
import { getMotorMatchCohort, solveMotorMatch } from "@/lib/motor-match/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const loaded = await getMotorMatchCohort({
      make: "BMW",
      model: "3 Series",
      trim: "",
      zip: "29401",
      distance: 500,
      year: 2021,
    });

    const solved = solveMotorMatch(
      loaded.cohort.listings,
      15000,
      60000,
      2021,
      loaded.cohort.generationStartYear,
    );

    return NextResponse.json({
      ok: true,
      remoteConfigured: Boolean(
        process.env.MOTOR_MATCH_PROD_DB_URL &&
        process.env.MOTOR_MATCH_PROD_DB_ANON_KEY &&
        process.env.MOTOR_MATCH_PROD_DB_TEST_TOKEN
      ),
      dataSource: loaded.cohort.source,
      sampleSize: loaded.cohort.listings.length,
      generation: loaded.cohort.generation,
      generationYears: [loaded.cohort.generationStartYear, loaded.cohort.generationEndYear],
      providerCalls: loaded.calls,
      result: {
        state: solved.state,
        depth: solved.depth,
        matchCount: solved.matchCount,
        priceNeeded: solved.market.priceNeeded,
        mileageNeeded: solved.market.mileageNeeded,
        yearNeeded: solved.market.yearNeeded,
        confidence: solved.confidence,
        annualYearAdjustment: solved.model.annualYearAdjustment,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Smoke test failed." },
      { status: 500 },
    );
  }
}
