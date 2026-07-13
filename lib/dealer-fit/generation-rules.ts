import type { DealerFitVehicleInput } from "./types";

export type DealerFitGenerationRule = {
  id: string;
  make: string;
  models: string[];
  yearStart: number;
  yearEnd: number;
  generation: string;
  points: number;
  reason: string;
  caution?: string;
  categoryHint?: "Easy Flip" | "Enthusiast Build" | "Specialty Retail" | "Commodity" | "Avoid";
  trimKeywords?: string[];
};

export type DealerFitGenerationMatch = {
  id: string;
  generation: string;
  points: number;
  reason: string;
  caution?: string;
  categoryHint?: DealerFitGenerationRule["categoryHint"];
};

function normalize(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function parseYear(value: DealerFitVehicleInput["year"]) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function includesAny(haystack: string, needles: string[]) {
  return needles.some((needle) => haystack.includes(normalize(needle)));
}

export const mindfulGenerationRules: DealerFitGenerationRule[] = [
  {
    id: "bmw-e46-m3",
    make: "BMW",
    models: ["m3"],
    yearStart: 2001,
    yearEnd: 2006,
    generation: "E46 M3",
    points: 18,
    reason: "Excellent Mindful fit: analog BMW M car with broad enthusiast demand and a clear buyer story.",
    caution: "Verify subframe, rod bearings, VANOS history, title, paintwork, and manual/SMG buyer impact.",
    categoryHint: "Enthusiast Build",
  },
  {
    id: "bmw-e9x-m3",
    make: "BMW",
    models: ["m3"],
    yearStart: 2008,
    yearEnd: 2013,
    generation: "E9X M3",
    points: 14,
    reason: "Strong enthusiast fit: V8 M3 generation with real buyer pull when history and spec are right.",
    caution: "Verify rod bearings, throttle actuators, service records, DCT/manual preference, and oil analysis if available.",
    categoryHint: "Enthusiast Build",
  },
  {
    id: "bmw-f80-m3",
    make: "BMW",
    models: ["m3"],
    yearStart: 2015,
    yearEnd: 2018,
    generation: "F80 M3",
    points: 12,
    reason: "Modern BMW M fit with strong market depth, but spec and modification history matter.",
    caution: "Check crank hub history, tune/mod evidence, tires, brakes, service records, and accident history.",
    categoryHint: "Specialty Retail",
  },
  {
    id: "bmw-g80-m3",
    make: "BMW",
    models: ["m3"],
    yearStart: 2021,
    yearEnd: 2026,
    generation: "G80 M3",
    points: 10,
    reason: "Current-generation M car fits the brand, but capital discipline and spec sensitivity matter.",
    caution: "Confirm options, drivetrain, color, warranty status, and whether the bid leaves enough room versus current retail supply.",
    categoryHint: "Specialty Retail",
  },
  {
    id: "bmw-e39-m5",
    make: "BMW",
    models: ["m5"],
    yearStart: 2000,
    yearEnd: 2003,
    generation: "E39 M5",
    points: 20,
    reason: "Excellent Mindful fit: landmark analog BMW M sedan with strong enthusiast credibility.",
    caution: "Verify timing chain guides, VANOS behavior, clutch, cooling system, pixels/electronics, rust, and modification quality.",
    categoryHint: "Enthusiast Build",
  },
  {
    id: "bmw-e60-m5",
    make: "BMW",
    models: ["m5"],
    yearStart: 2006,
    yearEnd: 2010,
    generation: "E60 M5",
    points: 6,
    reason: "Interesting enthusiast car, but the V10 risk profile makes it highly selective inventory.",
    caution: "Require exceptional records and spread; verify rod bearings, throttle actuators, SMG/clutch, VANOS, and fault history.",
    categoryHint: "Specialty Retail",
  },
  {
    id: "bmw-z3",
    make: "BMW",
    models: ["z3"],
    yearStart: 1996,
    yearEnd: 2002,
    generation: "E36/7 Z3",
    points: 10,
    reason: "Approachable analog BMW roadster with a simple specialty-retail story, especially in good spec.",
    caution: "Automatic transmission, base engines, tired interiors, and deferred maintenance can limit upside.",
    categoryHint: "Specialty Retail",
  },
  {
    id: "bmw-e39-5-series",
    make: "BMW",
    models: ["5 series", "525i", "528i", "530i", "540i"],
    yearStart: 1997,
    yearEnd: 2003,
    generation: "E39 5 Series",
    points: 12,
    reason: "Strong Mindful fit when clean: analog BMW sedan/wagon platform with known enthusiast appeal.",
    caution: "Verify cooling system, suspension, oil leaks, pixels, rust, interior condition, and service depth.",
    categoryHint: "Specialty Retail",
  },
  {
    id: "mercedes-w126-sec",
    make: "Mercedes-Benz",
    models: ["560 sec", "sec", "s-class"],
    yearStart: 1986,
    yearEnd: 1991,
    generation: "W126 SEC",
    points: 16,
    reason: "Excellent specialty-retail fit: pillarless flagship Mercedes coupe with a strong design and collector story.",
    caution: "Verify timing chain guides, hydraulics/suspension if applicable, climate control, rust, interior wood/leather, and records.",
    categoryHint: "Specialty Retail",
  },
  {
    id: "mercedes-w463-g-class",
    make: "Mercedes-Benz",
    models: ["g-class", "g 550", "g550", "g500", "g 500"],
    yearStart: 2002,
    yearEnd: 2018,
    generation: "W463 G-Class",
    points: 14,
    reason: "Strong specialty fit: iconic, durable, high-demand shape with clear buyer recognition.",
    caution: "High capital exposure; verify rust, driveline, suspension, electronics, service history, and accident/paintwork.",
    categoryHint: "Specialty Retail",
  },
  {
    id: "mercedes-x166-gls",
    make: "Mercedes-Benz",
    models: ["gls450", "gls 450", "gls550", "gls 550", "gls"],
    yearStart: 2017,
    yearEnd: 2019,
    generation: "X166 GLS",
    points: -4,
    reason: "Large luxury SUV is useful inventory only when bought very well; it is less curated than enthusiast stock.",
    caution: "Verify air suspension, electronics, service history, tires/brakes, and whether the spread compensates for family-SUV depreciation.",
    categoryHint: "Commodity",
  },
  {
    id: "mercedes-x247-glb",
    make: "Mercedes-Benz",
    models: ["glb250", "glb 250", "glb"],
    yearStart: 2020,
    yearEnd: 2026,
    generation: "X247 GLB",
    points: -10,
    reason: "GLB is more commodity compact-luxury utility than Mindful specialty inventory unless the buy is unusually strong.",
    caution: "Treat it as a price-driven deal, not a brand-fit deal.",
    categoryHint: "Commodity",
  },
  {
    id: "porsche-981",
    make: "Porsche",
    models: ["boxster", "cayman"],
    yearStart: 2013,
    yearEnd: 2016,
    generation: "981 Boxster/Cayman",
    points: 17,
    reason: "Excellent Porsche fit: naturally aspirated mid-engine platform with strong enthusiast demand.",
    caution: "Verify over-revs if manual, PDK service behavior, options, tires/brakes, paintwork, and maintenance records.",
    categoryHint: "Enthusiast Build",
  },
  {
    id: "porsche-718",
    make: "Porsche",
    models: ["718", "boxster", "cayman"],
    yearStart: 2017,
    yearEnd: 2026,
    generation: "718 Boxster/Cayman",
    points: 12,
    reason: "Strong Porsche specialty fit, especially with the right trim, options, and transmission.",
    caution: "Four-cylinder cars can be price/spec sensitive; verify options, warranty, service, and buyer appetite.",
    categoryHint: "Specialty Retail",
  },
  {
    id: "porsche-macan-95b",
    make: "Porsche",
    models: ["macan"],
    yearStart: 2015,
    yearEnd: 2026,
    generation: "95B Macan",
    points: 6,
    reason: "Macan can work as premium specialty inventory, but it needs clean history, right spec, and enough spread.",
    caution: "Verify transfer case, timing cover/oil leaks on applicable engines, PDK behavior, tires/brakes, and options.",
    categoryHint: "Specialty Retail",
  },
  {
    id: "porsche-955-957-cayenne",
    make: "Porsche",
    models: ["cayenne"],
    yearStart: 2003,
    yearEnd: 2010,
    generation: "955/957 Cayenne",
    points: 8,
    reason: "Older Cayenne can fit as enthusiast utility inventory when spec and maintenance make the story.",
    caution: "Verify cooling pipes, cardan shaft, air suspension, transfer case, bore scoring risk on V8s, and deferred maintenance.",
    categoryHint: "Enthusiast Build",
  },
  {
    id: "cadillac-xlr",
    make: "Cadillac",
    models: ["xlr"],
    yearStart: 2004,
    yearEnd: 2009,
    generation: "Cadillac XLR",
    points: 12,
    reason: "Interesting specialty-retail fit: Corvette-adjacent luxury roadster with rarity and curb appeal.",
    caution: "Verify hardtop operation, module/electronics health, parts availability, Northstar service history, and buyer depth.",
    categoryHint: "Specialty Retail",
  },
  {
    id: "alfa-giulia-952",
    make: "Alfa Romeo",
    models: ["giulia"],
    yearStart: 2017,
    yearEnd: 2026,
    generation: "952 Giulia",
    points: 8,
    reason: "Selective enthusiast fit: compelling driver appeal, especially in performance trims, but narrower buyer pool.",
    caution: "Verify warning lights, battery/electrical behavior, service records, tires/brakes, and whether it is Quadrifoglio or base-market inventory.",
    categoryHint: "Specialty Retail",
  },
  {
    id: "land-rover-series-iia",
    make: "Land Rover",
    models: ["88", "series iia", "series"],
    yearStart: 1961,
    yearEnd: 1971,
    generation: "Series IIA",
    points: 14,
    reason: "Strong specialty fit when honest and usable: simple, character-rich vintage utility with a clear story.",
    caution: "Verify chassis rust, bulkhead condition, drivetrain originality, leaks, wiring, title, and realistic drivability.",
    categoryHint: "Specialty Retail",
  }
];

export function findDealerFitGenerationMatch(
  vehicle: DealerFitVehicleInput
): DealerFitGenerationMatch | null {
  const year = parseYear(vehicle.year);

  if (!year) {
    return null;
  }

  const make = normalize(vehicle.make);
  const model = normalize(vehicle.model);
  const trim = normalize(vehicle.trim);
  const fullText = normalize(
    [vehicle.make, vehicle.model, vehicle.trim, vehicle.bodyClass, vehicle.notes]
      .filter(Boolean)
      .join(" ")
  );

  const match = mindfulGenerationRules.find((rule) => {
    const makeMatches = make === normalize(rule.make) || make.includes(normalize(rule.make));

    if (!makeMatches) {
      return false;
    }

    if (year < rule.yearStart || year > rule.yearEnd) {
      return false;
    }

    const modelMatches =
      includesAny(model, rule.models) || includesAny(fullText, rule.models);

    if (!modelMatches) {
      return false;
    }

    if (rule.trimKeywords?.length) {
      return includesAny(trim, rule.trimKeywords) || includesAny(fullText, rule.trimKeywords);
    }

    return true;
  });

  if (!match) {
    return null;
  }

  return {
    id: match.id,
    generation: match.generation,
    points: match.points,
    reason: match.reason,
    caution: match.caution,
    categoryHint: match.categoryHint,
  };
}
