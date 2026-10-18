import { NextResponse } from "next/server";
import { getMotorMatchCohort } from "@/lib/motor-match/server";
import { solveMotorMatch } from "@/lib/motor-match/solver";
import { resolveVehicleGeneration } from "@/lib/vehicle-generations";

export const dynamic = "force-dynamic";

const s = (value: unknown) => String(value || "").trim();

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const make = s(body.make);
    const model = s(body.model);
    const trim = s(body.trim);
    const zip = /^\d{5}$/.test(s(body.zip)) ? s(body.zip) : "";
    const distance = Math.min(
      Math.max(Number(body.distance) || 500, 25),
      1000,
    );
    const year = Math.round(
      Number(body.year) || new Date().getFullYear(),
    );
    const budget = Math.max(0, Number(body.budget) || 0);
    const mileage = Math.max(0, Number(body.mileage) || 0);

    if (!make || !model || !year || !budget || !mileage) {
      return NextResponse.json(
        { error: "Year, make, model, budget and mileage are required." },
        { status: 400 },
      );
    }

    const identityMatch = resolveVehicleGeneration({
      year,
      make,
      model,
      trim,
    });

    const loaded = await getMotorMatchCohort({
      make,
      model,
      trim,
      zip,
      distance,
      year,
    });

    if (!identityMatch && loaded.cohort.listings.length === 0) {
      return NextResponse.json(
        {
          code: "vehicle_unverified",
          error: "We couldn't verify that vehicle. Check the make, model, and year.",
          vehicle: { year, make, model, trim },
        },
        { status: 422 },
      );
    }

    const solved = solveMotorMatch({
      listings: loaded.cohort.listings,
      budget,
      mileage,
      targetYear: year,
      generationStartYear: loaded.cohort.generationStartYear,
    });

    return NextResponse.json({
      ...solved,
      searchKey: loaded.key,
      providerTotal: loaded.cohort.providerTotal,
      sampleSize: solved.summary.sampleSize,
      rawSampleSize: loaded.cohort.listings.length,
      dataSource: loaded.cohort.source,
      marketScope: "stored generation-level national snapshot",
      generation: {
        name: loaded.cohort.generation,
        startYear: loaded.cohort.generationStartYear,
        endYear: loaded.cohort.generationEndYear,
      },
      trimApplied: loaded.cohort.trimApplied,
      cache: {
        hit: loaded.cacheHit,
        ttlSeconds: Math.max(
          0,
          Math.floor((loaded.cohort.expiresAt - Date.now()) / 1000),
        ),
      },
      apiUsage: {
        callsThisUpdate: 0,
        breakdown: [
          {
            label: "Stored market database",
            purpose:
              "Analyze the saved generation-level market snapshot without a live provider call.",
          },
        ],
      },
    });
  } catch (cause) {
    return NextResponse.json(
      {
        error:
          cause instanceof Error
            ? cause.message
            : "Motor Match market check failed.",
      },
      { status: 502 },
    );
  }
}
