import { NextResponse } from "next/server";
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

    return NextResponse.json(decoded);
  } catch (error) {
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
