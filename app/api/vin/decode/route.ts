import { NextResponse } from "next/server";
import { recordApiUsageEvent } from "@/lib/observability/api-usage";
import type { VinDecodeResult } from "@/types/vin";
import { dedicatedBmwMModel, isNonRetailTrimLabel } from "@/lib/marketcheck/vehicle-identity";

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

/**
 * NHTSA may report the combustion component of an HEV as primary fuel.
 * Prefer explicit electrification metadata, then a narrowly established
 * model-year fact (US 2025 Camry is hybrid-only).
 */
export function decodedPowertrainFuel(result: Record<string, string>): string {
  const fuel = String(result.FuelTypePrimary || "").trim();
  const electrification = String(result.ElectrificationLevel || "").toLowerCase();
  const secondaryFuel = String(result.FuelTypeSecondary || "").toLowerCase();
  const make = String(result.Make || "").trim().toLowerCase();
  const model = String(result.Model || "").trim().toLowerCase();
  const year = Number(result.ModelYear);
  if (/plug.?in hybrid|phev/.test(electrification)) return "Plug-in Hybrid";
  if (/hybrid|\\bhev\\b/.test(electrification) ||
      (/gasoline|petrol|gas/i.test(fuel) && /electric/.test(secondaryFuel)) ||
      (make === "toyota" && model === "camry" && year === 2025)) {
    return "Hybrid";
  }
  return fuel;
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
      model: dedicatedBmwMModel(normalizeMake(result.Make || ""), result.Model, result.Trim || result.Series) || result.Model || "",
      // NHTSA Series is a generation/family descriptor, not a verified retail
      // grade. Never turn "80 Series" into a Camry trim (or guess LE/SE).
      trim: result.Trim && !isNonRetailTrimLabel(result.Trim)
        ? result.Trim
        : "",
      bodyClass: result.BodyClass || "",
      doors: result.Doors || "",
      engineCylinders: result.EngineCylinders || "",
      displacementL: result.DisplacementL || "",
      driveType: result.DriveType || "",
      fuelType: decodedPowertrainFuel(result),
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
