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

    const solved = solveMotorMatch(loaded.cohort.listings, 30000, 60000);

    return NextResponse.json({
      ok: true,
      dataSource: loaded.cohort.source,
      sampleSize: loaded.cohort.listings.length,
      providerCalls: loaded.calls,
      result: {
        state: solved.state,
        depth: solved.depth,
        matchCount: solved.matchCount,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Smoke test failed." },
      { status: 500 },
    );
  }
}
