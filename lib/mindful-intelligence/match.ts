import { mindfulIntelligenceEntries } from "./entries";

import type {
  MindfulIntelligenceEntry,
  MindfulIntelligenceMatch,
  MindfulIntelligenceMatchLevel,
  MindfulIntelligenceMatchOptions,
  MindfulIntelligenceVehicleInput,
} from "./types";

function normalize(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function parseYear(value: MindfulIntelligenceVehicleInput["year"]) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value);
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);

    if (Number.isFinite(parsed)) {
      return Math.round(parsed);
    }
  }

  return null;
}

function normalizedValues(values?: string[]) {
  return (values ?? []).map(normalize).filter(Boolean);
}

function matchesAny(
  actualValue: unknown,
  expectedValues?: string[],
) {
  const actual = normalize(actualValue);
  const expected = normalizedValues(expectedValues);

  if (!expected.length) {
    return false;
  }

  if (!actual) {
    return false;
  }

  return expected.some(
    (candidate) =>
      actual === candidate ||
      actual.includes(candidate) ||
      candidate.includes(actual),
  );
}

function fullVehicleText(vehicle: MindfulIntelligenceVehicleInput) {
  return normalize(
    [
      vehicle.year,
      vehicle.make,
      vehicle.model,
      vehicle.trim,
      vehicle.generation,
      vehicle.chassisCode,
      vehicle.engine,
      vehicle.transmission,
      vehicle.drivetrain,
      vehicle.bodyStyle,
      vehicle.fuelType,
      vehicle.notes,
    ]
      .filter(Boolean)
      .join(" "),
  );
}

function textMatchesAny(text: string, values?: string[]) {
  const expected = normalizedValues(values);

  if (!expected.length || !text) {
    return false;
  }

  return expected.some((candidate) => text.includes(candidate));
}

function makeMatches(
  entry: MindfulIntelligenceEntry,
  vehicle: MindfulIntelligenceVehicleInput,
) {
  const makes = entry.identity.makes ?? [];

  if (!makes.length) {
    return true;
  }

  return matchesAny(vehicle.make, makes);
}

function yearMatches(
  entry: MindfulIntelligenceEntry,
  vehicle: MindfulIntelligenceVehicleInput,
) {
  const year = parseYear(vehicle.year);
  const { yearStart, yearEnd } = entry.identity;

  if (yearStart == null && yearEnd == null) {
    return true;
  }

  if (year == null) {
    return false;
  }

  if (typeof yearStart === "number" && year < yearStart) {
    return false;
  }

  if (typeof yearEnd === "number" && year > yearEnd) {
    return false;
  }

  return true;
}

type MatchSignals = {
  make: boolean;
  year: boolean;
  model: boolean;
  trim: boolean;
  generation: boolean;
  chassis: boolean;
  engine: boolean;
  transmission: boolean;
  drivetrain: boolean;
  bodyStyle: boolean;
  fuelType: boolean;
  keyword: boolean;
};

function getMatchSignals(
  entry: MindfulIntelligenceEntry,
  vehicle: MindfulIntelligenceVehicleInput,
): MatchSignals {
  const text = fullVehicleText(vehicle);

  return {
    make: makeMatches(entry, vehicle),
    year: yearMatches(entry, vehicle),
    model:
      matchesAny(vehicle.model, entry.identity.models) ||
      textMatchesAny(text, entry.identity.models),
    trim:
      matchesAny(vehicle.trim, entry.identity.trims) ||
      textMatchesAny(text, entry.identity.trims),
    generation:
      matchesAny(vehicle.generation, entry.identity.generations) ||
      textMatchesAny(text, entry.identity.generations),
    chassis:
      matchesAny(vehicle.chassisCode, entry.identity.chassisCodes) ||
      textMatchesAny(text, entry.identity.chassisCodes),
    engine:
      matchesAny(vehicle.engine, entry.identity.engines) ||
      textMatchesAny(text, entry.identity.engines),
    transmission:
      matchesAny(vehicle.transmission, entry.identity.transmissions) ||
      textMatchesAny(text, entry.identity.transmissions),
    drivetrain:
      matchesAny(vehicle.drivetrain, entry.identity.drivetrains) ||
      textMatchesAny(text, entry.identity.drivetrains),
    bodyStyle:
      matchesAny(vehicle.bodyStyle, entry.identity.bodyStyles) ||
      textMatchesAny(text, entry.identity.bodyStyles),
    fuelType:
      matchesAny(vehicle.fuelType, entry.identity.fuelTypes) ||
      textMatchesAny(text, entry.identity.fuelTypes),
    keyword: textMatchesAny(text, entry.identity.keywords),
  };
}

function entryHasSpecificIdentity(entry: MindfulIntelligenceEntry) {
  return Boolean(
    entry.identity.models?.length ||
      entry.identity.generations?.length ||
      entry.identity.chassisCodes?.length ||
      entry.identity.engines?.length ||
      entry.identity.trims?.length ||
      entry.identity.keywords?.length,
  );
}

function qualifiesForMatch(
  entry: MindfulIntelligenceEntry,
  signals: MatchSignals,
) {
  if (!signals.make || !signals.year) {
    return false;
  }

  if (!entryHasSpecificIdentity(entry)) {
    return true;
  }

  switch (entry.scope) {
    case "exact_vehicle":
      return (
        signals.model &&
        (signals.trim ||
          signals.engine ||
          signals.generation ||
          signals.chassis)
      );

    case "generation":
      return (
        signals.model &&
        (signals.generation ||
          signals.chassis ||
          signals.engine ||
          signals.year)
      );

    case "powertrain":
      return signals.model && (signals.engine || signals.fuelType);

    case "model":
      return signals.model;

    case "modified_platform":
      return signals.model && signals.keyword;

    case "brand":
      return entry.identity.models?.length
        ? signals.model
        : signals.make;

    default:
      return false;
  }
}

function determineMatchLevel(
  entry: MindfulIntelligenceEntry,
  signals: MatchSignals,
): MindfulIntelligenceMatchLevel {
  if (
    entry.scope === "exact_vehicle" &&
    signals.model &&
    (signals.trim || signals.engine)
  ) {
    return "exact";
  }

  if (entry.scope === "modified_platform") {
    return "modified_platform";
  }

  if (
    entry.scope === "powertrain" ||
    (signals.engine && signals.model)
  ) {
    return "powertrain";
  }

  if (
    entry.scope === "generation" ||
    signals.generation ||
    signals.chassis
  ) {
    return "generation";
  }

  if (entry.scope === "model" || signals.model) {
    return "model";
  }

  return "brand";
}

function calculateMatchScore(
  entry: MindfulIntelligenceEntry,
  signals: MatchSignals,
  level: MindfulIntelligenceMatchLevel,
) {
  const levelScore: Record<MindfulIntelligenceMatchLevel, number> = {
    exact: 100,
    generation: 85,
    powertrain: 90,
    model: 70,
    brand: 45,
    modified_platform: 88,
  };

  let score = levelScore[level];

  if (signals.year) score += 4;
  if (signals.trim) score += 4;
  if (signals.generation) score += 8;
  if (signals.chassis) score += 8;
  if (signals.engine) score += 8;
  if (signals.transmission) score += 3;
  if (signals.drivetrain) score += 2;
  if (signals.bodyStyle) score += 2;
  if (signals.fuelType) score += 3;
  if (signals.keyword) score += 5;

  if (entry.confidence === "high") {
    score += 3;
  } else if (entry.confidence === "low") {
    score -= 3;
  }

  return Math.max(0, Math.min(120, score));
}

function toMatch(
  entry: MindfulIntelligenceEntry,
  matchLevel: MindfulIntelligenceMatchLevel,
  matchScore: number,
): MindfulIntelligenceMatch {
  return {
    entryId: entry.id,
    title: entry.title,

    matchLevel,
    matchScore,

    confidence: entry.confidence,
    verdict: entry.verdict,

    rationale: entry.rationale,

    opportunityTypes: entry.opportunityTypes,

    strengths: entry.strengths,
    limitations: entry.limitations,

    desirableSpecs: entry.desirableSpecs,
    avoidSpecs: entry.avoidSpecs,

    knownIssues: entry.knownIssues,
    verificationItems: entry.verificationItems,

    buyerProfile: entry.buyerProfile,
    mileageNotes: entry.mileageNotes,
    pricingNotes: entry.pricingNotes,
    modificationNotes: entry.modificationNotes,
    exitNotes: entry.exitNotes,

    source: entry.source,
  };
}

export function findMindfulIntelligenceMatches(
  vehicle: MindfulIntelligenceVehicleInput,
  options: MindfulIntelligenceMatchOptions = {},
): MindfulIntelligenceMatch[] {
  const {
    includeDrafts = false,
    includeArchived = false,
    limit = 5,
  } = options;

  if (!normalize(vehicle.make)) {
    return [];
  }

  return mindfulIntelligenceEntries
    .filter((entry) => {
      if (entry.status === "approved") {
        return true;
      }

      if (entry.status === "draft") {
        return includeDrafts;
      }

      return includeArchived;
    })
    .map((entry) => {
      const signals = getMatchSignals(entry, vehicle);

      if (!qualifiesForMatch(entry, signals)) {
        return null;
      }

      const matchLevel = determineMatchLevel(entry, signals);
      const matchScore = calculateMatchScore(
        entry,
        signals,
        matchLevel,
      );

      return toMatch(entry, matchLevel, matchScore);
    })
    .filter(
      (match): match is MindfulIntelligenceMatch =>
        match !== null,
    )
    .sort((left, right) => {
      if (right.matchScore !== left.matchScore) {
        return right.matchScore - left.matchScore;
      }

      return left.title.localeCompare(right.title);
    })
    .slice(0, Math.max(1, limit));
}

export function findPrimaryMindfulIntelligenceMatch(
  vehicle: MindfulIntelligenceVehicleInput,
  options: MindfulIntelligenceMatchOptions = {},
): MindfulIntelligenceMatch | null {
  return (
    findMindfulIntelligenceMatches(vehicle, {
      ...options,
      limit: 1,
    })[0] ?? null
  );
}
