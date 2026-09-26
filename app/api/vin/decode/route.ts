import { NextResponse } from "next/server";
import { recordApiUsageEvent } from "@/lib/observability/api-usage";
import type { VinDecodeResult } from "@/types/vin";

type NhtsaDecodeResponse = {
  Results?: Array<Record<string, string>>;
};

function normalizeMake(make: string) {
  const clean = make.trim();
  const upper = clean.toUpperCase();

  if (upper === "MERCEDES-BENZ") return "Mercedes-Benz";
  if (upper === "LAND ROVER") return "Land Rover";
  if (upper === "BMW") return "BMW";
  if (upper === "GMC") return "GMC";

  return clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase();
}

function getStatus(result: Record<string, string>) {
  const errorCode = String(result.ErrorCode || "").trim();
  const errorText = String(result.ErrorText || "").trim();

  if (!errorCode || errorCode === "0") {
    return "Decoded";
  }

  if (errorText) {
    return `Partial or check: ${errorText}`;
  }

  return `Partial or check: code ${errorCode}`;
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  try {
    const body = await request.json();
    const vin = String(body.vin || "").trim().toUpperCase();

    if (!vin || vin.length < 11) {
      return NextResponse.json(
        {
          error: "VIN is missing or too short.",
        },
        {
          status: 400,
        }
      );
    }

    const response = await fetch(
      `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${encodeURIComponent(
        vin
      )}?format=json`,
      {
        cache: "no-store",
      }
    );

    if (!response.ok) {
      await recordApiUsageEvent({
        provider: "nhtsa_vpic",
        endpoint: "/api/vehicles/DecodeVinValues",
        apiCallsMade: 1,
        status: response.status,
        stopReason: `NHTSA request failed with status ${response.status}.`,
        metadata: { durationMs: Date.now() - startedAt, vinSuffix: vin.slice(-6) },
      });
      return NextResponse.json(
        {
          error: `NHTSA request failed with status ${response.status}.`,
        },
        {
          status: 502,
        }
      );
    }

    const payload = (await response.json()) as NhtsaDecodeResponse;
    const result = payload.Results?.[0];

    if (!result) {
      return NextResponse.json(
        {
          error: "No VIN decode result returned.",
        },
        {
          status: 404,
        }
      );
    }

    const decoded: VinDecodeResult = {
      vin,
      status: getStatus(result),
      year: result.ModelYear || "",
      make: normalizeMake(result.Make || ""),
      model: result.Model || "",
      trim: result.Trim || result.Series || "",
      bodyClass: result.BodyClass || "",
      engineCylinders: result.EngineCylinders || "",
      displacementL: result.DisplacementL || "",
      driveType: result.DriveType || "",
      fuelType: result.FuelTypePrimary || "",
      plantCountry: result.PlantCountry || "",
    };

    await recordApiUsageEvent({
      provider: "nhtsa_vpic",
      endpoint: "/api/vehicles/DecodeVinValues",
      vehicleYear: Number(decoded.year) || null,
      vehicleMake: decoded.make || null,
      vehicleModel: decoded.model || null,
      apiCallsMade: 1,
      status: 200,
      stopReason: decoded.status,
      metadata: { durationMs: Date.now() - startedAt, vinSuffix: vin.slice(-6) },
    });

    return NextResponse.json(decoded);
  } catch (error) {
    await recordApiUsageEvent({
      provider: "nhtsa_vpic",
      endpoint: "/api/vehicles/DecodeVinValues",
      apiCallsMade: 1,
      status: 500,
      stopReason: error instanceof Error ? error.message : "VIN decode failed.",
      metadata: { durationMs: Date.now() - startedAt, failed: true },
    });
    return NextResponse.json(
      {
        error: "VIN decode failed.",
      },
      {
        status: 500,
      }
    );
  }
}
