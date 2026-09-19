import type { VehicleIdentity } from "./vehicle-equivalence";

/**
 * Source-independent vehicle identity normalization.
 *
 * VIN decoders, auction feeds, and MarketCheck often describe the same vehicle
 * with different model strings (for example "A5" vs "A5 Sportback"). These
 * helpers collapse naming differences into a canonical model family while
 * leaving material configuration/performance differences available to the
 * equivalence engine.
 */

export function normalizeVehicleText(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function compactVehicleText(value: unknown) {
  return normalizeVehicleText(value).replace(/\s+/g, "");
}

export function canonicalVehicleMake(value: unknown) {
  const make = normalizeVehicleText(value);

  if (
    make === "mercedes" ||
    make === "mercedes benz" ||
    make === "mercedesbenz"
  ) {
    return "mercedes benz";
  }

  if (make === "vw") return "volkswagen";

  return make;
}

function startsWithAny(value: string, prefixes: string[]) {
  return prefixes.some((prefix) => value.startsWith(prefix));
}

function canonicalAudiFamily(modelCompact: string) {
  const families: Array<[string, string[]]> = [
    ["tt", ["ttrs", "tts", "tt"]],
    ["a3", ["rs3", "s3", "a3"]],
    ["a4", ["rs4", "s4", "a4"]],
    ["a5", ["rs5", "s5", "a5"]],
    ["a6", ["rs6", "s6", "a6"]],
    ["a7", ["rs7", "s7", "a7"]],
    ["a8", ["s8", "a8"]],
    ["q5", ["sq5", "q5"]],
    ["q8", ["rsq8", "sq8", "q8"]],
  ];

  for (const [family, prefixes] of families) {
    if (startsWithAny(modelCompact, prefixes)) return family;
  }

  return null;
}

function canonicalBmwFamily(model: string, modelCompact: string) {
  const normalized = normalizeVehicleText(model);

  for (const series of ["2", "3", "4", "5", "7", "8"]) {
    if (normalized === `${series} series`) return `${series} series`;
  }

  const families: Array<[string, string[]]> = [
    ["2 series", ["m2", "228i", "230i", "m235i", "m240i"]],
    ["3 series", ["m3", "320i", "328i", "330i", "335i", "340i", "m340i"]],
    ["4 series", ["m4", "428i", "430i", "435i", "440i", "m440i"]],
    ["5 series", ["m5", "528i", "530i", "535i", "540i", "550i", "m550i"]],
    ["7 series", ["740i", "745e", "750i", "760i", "m760i"]],
    ["8 series", ["m8", "840i", "850i", "m850i"]],
  ];

  for (const [family, prefixes] of families) {
    if (startsWithAny(modelCompact, prefixes)) return family;
  }

  return null;
}

function canonicalMercedesFamily(model: string, modelCompact: string) {
  const normalized = normalizeVehicleText(model);
  const namedClasses = [
    "a class",
    "c class",
    "e class",
    "s class",
    "cla class",
    "glc",
    "gle",
    "gls",
  ];

  if (namedClasses.includes(normalized)) return normalized;

  const families: Array<[string, string[]]> = [
    ["a class", ["amga35", "amga45", "a35", "a45"]],
    ["c class", ["amgc43", "amgc63", "c250", "c300", "c350", "c400", "c43", "c450", "c63"]],
    ["e class", ["amge53", "amge63", "e300", "e350", "e400", "e450", "e53", "e550", "e63"]],
    ["s class", ["s450", "s500", "s550", "s560", "s580"]],
    ["cla class", ["amgcla35", "amgcla45", "cla35", "cla45"]],
    ["glc", ["glc300", "glc350", "glc43", "glc63"]],
    ["gle", ["gle350", "gle400", "gle450", "gle53", "gle580", "gle63"]],
    ["gls", ["gls450", "gls550", "gls580", "gls63"]],
  ];

  for (const [family, prefixes] of families) {
    if (startsWithAny(modelCompact, prefixes)) return family;
  }

  return null;
}

export function canonicalModelFamily(vehicle: VehicleIdentity) {
  const make = canonicalVehicleMake(vehicle.make);
  const model = normalizeVehicleText(vehicle.model);
  const modelCompact = compactVehicleText(vehicle.model);

  if (!model) return "";

  if (make === "audi") {
    return canonicalAudiFamily(modelCompact) || model;
  }

  if (make === "bmw") {
    return canonicalBmwFamily(model, modelCompact) || model;
  }

  if (make === "mercedes benz") {
    return canonicalMercedesFamily(model, modelCompact) || model;
  }

  if (make === "ford") {
    if (
      startsWithAny(modelCompact, [
        "f150raptorr",
        "f150raptor",
        "f150",
        "raptor",
      ])
    ) {
      return "f 150";
    }
  }

  if (make === "honda" && startsWithAny(modelCompact, ["civictyper", "civic"])) {
    return "civic";
  }

  if (
    make === "cadillac" &&
    startsWithAny(modelCompact, ["ct5vblackwing", "ct5blackwing", "ct5"])
  ) {
    return "ct5";
  }

  if (make === "lexus" && startsWithAny(modelCompact, ["rcf", "rc"])) {
    return "rc";
  }

  if (
    make === "volkswagen" &&
    startsWithAny(modelCompact, ["golfr", "golfgti", "gti", "golf"])
  ) {
    return "golf";
  }

  if (make === "subaru" && startsWithAny(modelCompact, ["wrxsti", "wrx", "sti"])) {
    return "wrx";
  }

  if (
    make === "hyundai" &&
    startsWithAny(modelCompact, ["elantran", "elantra"])
  ) {
    return "elantra";
  }

  if (make === "jeep" && model.startsWith("wrangler unlimited")) {
    return "wrangler";
  }

  if (make === "porsche") {
    if (modelCompact.startsWith("911")) return "911";
    if (modelCompact.startsWith("718cayman")) return "cayman";
    if (modelCompact.startsWith("718boxster")) return "boxster";
  }

  return model;
}

function classifyBodyText(value: unknown) {
  const text = normalizeVehicleText(value);
  if (!text) return null;

  if (
    ["convertible", "cabriolet", "cabrio", "roadster", "spyder"].some((term) =>
      text.includes(term),
    )
  ) {
    return "convertible";
  }

  if (text.includes("wagon") || text.includes("estate") || text.includes("avant") || text.includes("touring")) {
    return "wagon";
  }

  if (
    text.includes("hatchback") ||
    text.includes("hatch") ||
    text.includes("sportback") ||
    text.includes("liftback") ||
    text.includes("gran coupe")
  ) {
    return "hatchback";
  }

  if (text.includes("coupe")) return "coupe";
  if (text.includes("pickup") || text.includes("truck")) return "pickup";
  if (text.includes("sedan") || text.includes("saloon")) return "sedan";
  if (text.includes("suv") || text.includes("sport utility") || text.includes("crossover")) return "suv";
  if (text.includes("van") || text.includes("minivan")) return "van";

  return null;
}

export function canonicalBodyClass(vehicle: VehicleIdentity) {
  // Trust an explicit body field first. Only infer from model/configuration when
  // a source omitted a useful body classification.
  const explicitBody = classifyBodyText(vehicle.bodyType);
  if (explicitBody) return explicitBody;

  return classifyBodyText(
    [vehicle.configuration, vehicle.model, vehicle.trim]
      .filter(Boolean)
      .join(" "),
  );
}

export function canonicalDrivetrain(value: unknown) {
  const text = normalizeVehicleText(value);
  if (!text) return null;

  if (text.includes("4wd") || text.includes("4x4") || text.includes("four wheel")) {
    return "4wd";
  }
  if (text.includes("awd") || text.includes("all wheel")) return "awd";
  if (text.includes("fwd") || text.includes("front wheel")) return "fwd";
  if (text.includes("rwd") || text.includes("rear wheel")) return "rwd";
  if (text.includes("2wd") || text.includes("4x2") || text.includes("two wheel")) {
    return "2wd";
  }

  return text;
}

export function canonicalTractionClass(value: unknown) {
  const drive = canonicalDrivetrain(value);
  if (!drive) return null;
  if (drive === "awd" || drive === "4wd") return "all-wheel";
  if (drive === "fwd" || drive === "rwd" || drive === "2wd") return "two-wheel";
  return drive;
}

export function canonicalFuelType(value: unknown) {
  const text = normalizeVehicleText(value);
  if (!text) return "";

  if (text.includes("plug in hybrid") || text.includes("phev")) {
    return "plug-in hybrid";
  }
  if (text.includes("electric") || text === "ev" || text.includes("battery")) {
    return "electric";
  }
  if (text.includes("hybrid") || text.includes("hev")) return "hybrid";
  if (text.includes("diesel") || text.includes("tdi")) return "diesel";
  if (
    text.includes("gasoline") ||
    text === "gas" ||
    text.includes("petrol") ||
    text.includes("unleaded") ||
    text.includes("regular fuel") ||
    text.includes("premium fuel") ||
    text === "regular" ||
    text === "premium"
  ) {
    return "gasoline";
  }

  return text;
}

export function canonicalTransmission(value: unknown) {
  const text = normalizeVehicleText(value);
  if (!text) return null;
  if (text.includes("manual") || text.includes("stick")) return "manual";
  if (
    text.includes("automatic") ||
    text.includes("auto") ||
    text.includes("dct") ||
    text.includes("cvt")
  ) {
    return "automatic";
  }
  return null;
}

export function canonicalIdentitySnapshot(vehicle: VehicleIdentity) {
  return {
    make: canonicalVehicleMake(vehicle.make),
    modelFamily: canonicalModelFamily(vehicle),
    bodyClass: canonicalBodyClass(vehicle),
    drivetrain: canonicalDrivetrain(vehicle.drivetrain),
    tractionClass: canonicalTractionClass(vehicle.drivetrain),
    fuelType: canonicalFuelType(vehicle.fuelType),
    transmission: canonicalTransmission(vehicle.transmission),
  };
}
