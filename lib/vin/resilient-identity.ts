import type { VinDecodeResult } from "@/types/vin";
import {
  dedicatedBmwMModel,
  decodedPowertrainFuel,
  isNonRetailTrimLabel,
  normalizeVehicleText,
  canonicalModelFamily,
} from "@/lib/marketcheck/vehicle-identity";

export type DecodeSource = "nhtsa" | "auto_dev";
export type DecodeConfidence = "high" | "partial" | "conflict";
export type VehicleIdentityEvidence = {
  sources: DecodeSource[];
  confidence: DecodeConfidence;
  ambiguousTrim: boolean;
  possibleTrims: string[];
  conflicts: string[];
  durationMs: number;
  cache: "hit" | "miss";
};

export type ResilientVinDecode = VinDecodeResult & { identityEvidence: VehicleIdentityEvidence };

type NhtsaBody = { Results?: Array<Record<string, string>> };
type AutoDevBody = {
  vin?: string; vinValid?: boolean; make?: string; model?: string;
  vehicle?: { year?: number | string; make?: string; model?: string };
  trim?: string | null; trims?: string[]; style?: string | null;
  styles?: Array<{ trim?: string | null }>;
  ambiguous?: boolean; yearAmbiguous?: boolean;
  engine?: string | null; drive?: string | null; body?: string | null;
  doors?: number | string; fuel?: string | null;
};
export type ProviderOutcome = {
  provider: DecodeSource;
  httpStatus: number;
  durationMs: number;
  body: NhtsaBody | AutoDevBody | null;
  error?: string;
};
export type VinDecodeResultInternal = { decoded: ResilientVinDecode | null; outcomes: ProviderOutcome[] };
export type ProviderFetcher = (
  provider: DecodeSource, vin: string, timeoutMs: number
) => Promise<ProviderOutcome>;

const VIN_REGEX = /^[A-HJ-NPR-Z0-9]{17}$/;
export function isValidVinFormat(vin: string) { return VIN_REGEX.test(vin); }

export function normalizeMake(make: string) {
  const clean = make.trim();
  const upper = clean.toUpperCase();
  if (upper === "MERCEDES-BENZ") return "Mercedes-Benz";
  if (upper === "LAND ROVER") return "Land Rover";
  if (["BMW", "GMC", "MINI", "RAM"].includes(upper)) return upper === "RAM" ? "Ram" : upper;
  return clean ? clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase() : "";
}

function text(value: unknown) { return String(value ?? "").trim(); }
function nameKey(value: unknown) { return normalizeVehicleText(value); }
function same(a: unknown, b: unknown) { return nameKey(a) === nameKey(b); }
function engineDisplacement(engine: unknown): string {
  const match = text(engine).match(/\b(\d\.\d)\s?l\b/i);
  return match?.[1] || "";
}
function engineCylinders(engine: unknown): string {
  const str = text(engine);
  const v = str.match(/\bV\s?([468])\b/i) || str.match(/\bI\s?([346])\b/i);
  return v?.[1] || (/\bfour.cylinder\b/i.test(str) ? "4" : "");
}
function normalizedFuel(value: unknown) {
  const fuel = nameKey(value);
  if (/plug.?in hybrid|phev/.test(fuel)) return "Plug-in Hybrid";
  if (/\bhybrid\b|\bhev\b/.test(fuel)) return "Hybrid";
  if (/electric|bev/.test(fuel)) return "Electric";
  if (/gas|petrol/.test(fuel)) return "Gasoline";
  if (/diesel/.test(fuel)) return "Diesel";
  return text(value);
}
function comparableFuel(value: unknown) { return nameKey(normalizedFuel(value)); }
function choose(a: string, b: string) { return a || b; }

function nhtsaDecode(vin: string, data: NhtsaBody): VinDecodeResult | null {
  const row = data.Results?.[0];
  if (!row || !row.ModelYear || !row.Make || !row.Model) return null;
  if (row.ErrorCode && !row.ErrorCode.split(",").map(s => s.trim()).includes("0")) {
    // vPIC may issue warnings with a correct decoded identity; retain valid core fields.
    // Invalid VIN is ruled out by the upstream validation when both providers agree.
  }
  const make = normalizeMake(row.Make);
  return {
    vin,
    status: row.ErrorCode && row.ErrorCode !== "0" ? "Partial or check: " + (row.ErrorText || row.ErrorCode) : "Decoded",
    year: text(row.ModelYear),
    make,
    model: dedicatedBmwMModel(make,row.Model,row.Trim || row.Series) || text(row.Model),
    trim: row.Trim && !isNonRetailTrimLabel(row.Trim) ? text(row.Trim) : "",
    bodyClass: text(row.BodyClass),
    doors: text(row.Doors),
    engineCylinders: text(row.EngineCylinders),
    displacementL: text(row.DisplacementL),
    driveType: text(row.DriveType),
    fuelType: decodedPowertrainFuel(row),
    plantCountry: text(row.PlantCountry),
  };
}

function autoDevDecode(vin: string, data: AutoDevBody): VinDecodeResult | null {
  if (data.vinValid === false || data.yearAmbiguous === true) return null;
  const make = normalizeMake(text(data.make || data.vehicle?.make));
  const model = text(data.model || data.vehicle?.model);
  const year = text(data.vehicle?.year);
  if (!year || !make || !model || !/^\d{4}$/.test(year)) return null;
  const possibleTrims = new Set([
    ...(Array.isArray(data.trims) ? data.trims : []),
    ...(Array.isArray(data.styles) ? data.styles.map(s => s?.trim).filter(Boolean) : []),
  ].map(s => text(s)).filter(Boolean));
  // Ambiguous=true does not mean no common trim: the endpoint only asserts
  // a trim if its sources settled the grade. Never force a candidate into it.
  const retailTrim = data.ambiguous && possibleTrims.size > 1 ? "" : text(data.trim);
  return {
    vin, status: data.ambiguous ? "Decoded with unresolved configuration" : "Decoded",
    year, make,
    model: dedicatedBmwMModel(make,model,retailTrim) || model,
    trim: !isNonRetailTrimLabel(retailTrim) ? retailTrim : "",
    bodyClass: text(data.body),
    doors: text(data.doors),
    engineCylinders: engineCylinders(data.engine),
    displacementL: engineDisplacement(data.engine),
    driveType: text(data.drive),
    fuelType: normalizedFuel(data.fuel),
    plantCountry: "",
  };
}

export function reconcileVinResults(vin: string, outcomes: ProviderOutcome[], durationMs: number): ResilientVinDecode | null {
  const nhtsaOutcome = outcomes.find(o => o.provider === "nhtsa" && o.httpStatus === 200);
  const autoOutcome = outcomes.find(o => o.provider === "auto_dev" && o.httpStatus === 200);
  const nhtsa = nhtsaOutcome ? nhtsaDecode(vin,nhtsaOutcome.body as NhtsaBody) : null;
  const autoData = autoOutcome?.body as AutoDevBody | undefined;
  const auto = autoData ? autoDevDecode(vin,autoData) : null;
  if (!nhtsa && !auto) return null;

  const sources: DecodeSource[] = [...(nhtsa ? ["nhtsa" as const] : []),...(auto ? ["auto_dev" as const] : [])];
  const conflicts: string[] = [];
  const ambiguousTrim = Boolean(autoData?.ambiguous) || (Array.isArray(autoData?.trims) && autoData.trims.length > 1);
  const possibleTrims = [...new Set([...(Array.isArray(autoData?.trims) ? autoData.trims : []), ...(Array.isArray(autoData?.styles) ? autoData.styles.map(s => s?.trim).filter((s): s is string => typeof s === "string") : [])].map(text).filter(Boolean))];

  const primary = nhtsa || auto!;
  const secondary = nhtsa && auto ? auto : null;
  // Never claim a decoded identity where providers disagree on basic identity.
  for (const key of ["year","make","model"] as const) {
    if (secondary && primary[key] && secondary[key] && !same(primary[key],secondary[key])) {
      if (key === "model") {
        const family = (model:string) => canonicalModelFamily({year:Number(primary.year),make:primary.make,model,trim:"",drivetrain:"",fuelType:"",bodyType:""});
        if (family(primary.model) === family(secondary.model)) continue;
      }
      conflicts.push(key);
    }
  }
  const criticalConflict = conflicts.length > 0;
  const both = Boolean(nhtsa && auto);
  let trim = choose(primary.trim,secondary?.trim || "");
  if (nhtsa?.trim && auto?.trim && !same(nhtsa.trim,auto.trim)) { conflicts.push("trim"); trim = ""; }
  if (ambiguousTrim && !auto?.trim && !nhtsa?.trim) trim = "";
  // Reject vehicle identity altogether on year/make/model conflict: no safe comparator.
  if (criticalConflict) return null;

  let fuelType = choose(primary.fuelType,secondary?.fuelType || "");
  if (nhtsa?.fuelType && auto?.fuelType && comparableFuel(nhtsa.fuelType) !== comparableFuel(auto.fuelType)) {
    // Gasoline describes the combustion component of a hybrid in some feeds.
    const fuels = [comparableFuel(nhtsa.fuelType),comparableFuel(auto.fuelType)];
    if (fuels.includes("hybrid") && fuels.includes("gasoline")) {
      fuelType = "Hybrid";
    } else { conflicts.push("fuelType"); fuelType = ""; }
  }
  const reconcileField = (field: "engineCylinders" | "displacementL" | "driveType") => {
    const a = text(primary[field]);
    const b = text(secondary?.[field]);
    if (a && b && !same(a,b)) {
      if (field === "driveType") {
        const compact = (s:string) => nameKey(s).replace(/[^a-z0-9]/g,"");
        const AWD = new Set(["awd","4wd","4x4","allwheeldrive","fourwheeldrive"]);
        if (AWD.has(compact(a)) && AWD.has(compact(b))) return "AWD";
      }
      conflicts.push(field);
      return "";
    }
    return a || b;
  };
  const engineCylinders = reconcileField("engineCylinders");
  const displacementL = reconcileField("displacementL");
  const driveType = reconcileField("driveType");
  const confidence: DecodeConfidence = conflicts.length ? "conflict" : (both && trim && !ambiguousTrim ? "high" : "partial");
  const decoded: ResilientVinDecode = {
    ...primary,
    trim, engineCylinders, displacementL, driveType, fuelType,
    bodyClass: choose(primary.bodyClass,secondary?.bodyClass || ""),
    doors: choose(primary.doors || "",secondary?.doors || ""),
    status: conflicts.length ? "Decoded with conflicting attributes" :
      (both ? (ambiguousTrim ? "Decoded with unresolved trim" : "Decoded by two sources") :
      "Decoded from " + (sources[0] === "nhtsa" ? "NHTSA" : "Auto.dev")),
    identityEvidence: { sources,confidence,ambiguousTrim,possibleTrims,conflicts,durationMs,cache:"miss" },
  };
  return decoded;
}

export async function decodeProviders(vin: string, fetchProvider: ProviderFetcher): Promise<VinDecodeResultInternal> {
  const start=Date.now();
  const results = await Promise.all([
    fetchProvider("nhtsa",vin,1800),
    fetchProvider("auto_dev",vin,1800),
  ]);
  return { decoded:reconcileVinResults(vin,results,Date.now()-start),outcomes:results };
}
