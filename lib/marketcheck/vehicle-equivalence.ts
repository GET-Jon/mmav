import {
  canonicalBodyClass,
  canonicalDrivetrain,
  canonicalFuelType,
  canonicalModelFamily,
  canonicalTractionClass,
  canonicalTransmission,
  canonicalVehicleMake,
  canonicalVehicleVariant,
  compactVehicleText,
  normalizeVehicleText,
} from "./vehicle-identity";

export type VehicleEquivalenceTier =
  | "direct"
  | "near"
  | "supporting"
  | "reject";

export type VehicleIdentity = {
  year: number;
  make: string;
  model: string;
  trim?: string | null;
  generation?: string | null;
  configuration?: string | null;
  bodyType?: string | null;
  drivetrain?: string | null;
  fuelType?: string | null;
  engine?: string | null;
  transmission?: string | null;
  doors?: number | null;
  cylinders?: number | null;
};

export type VehicleEquivalenceResult = {
  tier: VehicleEquivalenceTier;
  scoreModifier: number;
  autoIncludeEligible: boolean;
  reasons: string[];
  targetClassification?: string | null;
  candidateClassification?: string | null;
  needsClassificationReview?: boolean;
};

type VariantFamily = {
  id: string;
  labels: string[];
};

type VehicleTaxonomyRule = {
  id: string;
  make: string;
  model: string;
  yearStart: number;
  yearEnd: number;
  generation: string;
  families: VariantFamily[];
  classify: (vehicle: VehicleIdentity) => string | null;
  compare: (
    targetFamily: string | null,
    candidateFamily: string | null,
  ) => VehicleEquivalenceTier;
  notes: string;
};

const normalize = normalizeVehicleText;
const compact = compactVehicleText;
const canonicalMake = canonicalVehicleMake;

function phraseMatches(text: string, phrase: string) {
  const normalizedText = ` ${normalize(text)} `;
  const normalizedPhrase = normalize(phrase);
  return Boolean(normalizedPhrase) && normalizedText.includes(` ${normalizedPhrase} `);
}

function containsAny(text: string, values: string[]) {
  return values.some((value) => phraseMatches(text, value));
}

function vehicleText(vehicle: VehicleIdentity) {
  return normalize(
    [
      vehicle.model,
      vehicle.trim,
      vehicle.configuration,
      vehicle.bodyType,
      vehicle.engine,
      vehicle.transmission,
    ]
      .filter(Boolean)
      .join(" "),
  );
}

function detectSpecialVariant(vehicle: VehicleIdentity) {
  const make = canonicalMake(vehicle.make);
  const modelFamily = canonicalModelFamily(vehicle);
  const text = vehicleText(vehicle);

  if (make === "bmw") {
    const variants = ["m850i", "m550i", "m440i", "m340i", "m240i", "m8", "m5", "m4", "m3", "m2"];
    for (const variant of variants) {
      if (phraseMatches(text, variant) || compact(vehicle.model) === variant) return variant;
    }
  }

  if (make === "mercedes benz") {
    const variants = ["c63 s", "c63", "c43", "e63 s", "e63", "e53", "a45", "a35", "cla45", "cla35"];
    for (const variant of variants) {
      if (phraseMatches(text, variant) || phraseMatches(text, `amg ${variant}`) || compact(vehicle.model).includes(compact(variant))) {
        return `amg-${compact(variant)}`;
      }
    }
  }

  if (make === "audi") {
    const modelVariant = compact(vehicle.model);
    const variants = ["ttrs", "tts", "rsq8", "rs7", "rs6", "rs5", "rs4", "rs3", "sq5", "s8", "s7", "s6", "s5", "s4", "s3"];
    for (const variant of variants) {
      if (modelVariant === variant || phraseMatches(text, variant)) return variant;
    }
  }

  if (make === "ford" && modelFamily === "f 150") {
    if (containsAny(text, ["raptor r"])) return "raptor-r";
    if (containsAny(text, ["raptor"])) return "raptor";
    if (containsAny(text, ["tremor"])) return "tremor";
    if (containsAny(text, ["lightning"])) return "lightning";
  }

  if (make === "ford" && modelFamily === "bronco") {
    if (containsAny(text, ["raptor"])) return "bronco-raptor";
  }

  if (make === "honda" && modelFamily === "civic") {
    if (containsAny(text, ["type r"]) || compact(vehicle.model) === "typer") return "type-r";
    if (containsAny(text, ["si"])) return "si";
  }

  if (make === "porsche" && modelFamily === "911") {
    const variants: Array<[string, string[]]> = [
      ["gt2-rs", ["gt2 rs"]],
      ["gt3-rs", ["gt3 rs"]],
      ["gt3", ["gt3"]],
      ["turbo-s", ["turbo s"]],
      ["turbo", ["turbo"]],
      ["gts", ["gts"]],
      ["targa-4s", ["targa 4s"]],
      ["targa", ["targa"]],
      ["carrera-4s", ["carrera 4s"]],
      ["carrera-s", ["carrera s"]],
      ["carrera-4", ["carrera 4"]],
      ["carrera", ["carrera"]],
    ];
    for (const [id, labels] of variants) {
      if (containsAny(text, labels)) return id;
    }
  }

  if (make === "chevrolet" && modelFamily === "corvette") {
    if (containsAny(text, ["zr1"])) return "zr1";
    if (containsAny(text, ["z06"])) return "z06";
    if (containsAny(text, ["grand sport"])) return "grand-sport";
    if (containsAny(text, ["stingray"])) return "stingray";
  }

  if (make === "ford" && modelFamily === "mustang") {
    if (containsAny(text, ["shelby gt500", "gt500"])) return "gt500";
    if (containsAny(text, ["shelby gt350", "gt350"])) return "gt350";
    if (containsAny(text, ["dark horse"])) return "dark-horse";
    if (containsAny(text, ["mach 1"])) return "mach-1";
    if (containsAny(text, ["ecoboost"])) return "ecoboost";
    if (containsAny(text, ["gt"])) return "gt";
  }

  if (make === "chevrolet" && modelFamily === "camaro") {
    if (containsAny(text, ["zl1"])) return "zl1";
    if (containsAny(text, ["2ss", "1ss", "ss"])) return "ss";
  }

  if (make === "dodge" && ["challenger", "charger"].includes(modelFamily)) {
    if (containsAny(text, ["demon"])) return "demon";
    if (containsAny(text, ["hellcat"])) return "hellcat";
    if (containsAny(text, ["scat pack"])) return "scat-pack";
    if (containsAny(text, ["srt 392"])) return "srt-392";
    if (containsAny(text, ["r t"])) return "rt";
    if (containsAny(text, ["sxt"])) return "sxt";
  }

  if (make === "toyota" && ["tacoma", "4runner"].includes(modelFamily)) {
    if (containsAny(text, ["trailhunter"])) return "trailhunter";
    if (containsAny(text, ["trd pro"])) return "trd-pro";
  }

  if (make === "cadillac") {
    if (containsAny(text, ["blackwing"])) return "blackwing";
  }

  if (make === "volkswagen" && modelFamily === "golf") {
    if (containsAny(text, ["golf r"]) || compact(vehicle.model) === "golfr") return "golf-r";
    if (containsAny(text, ["gti"]) || compact(vehicle.model) === "gti") return "gti";
  }

  if (make === "subaru" && modelFamily === "wrx") {
    if (containsAny(text, ["sti"]) || compact(vehicle.model).includes("sti")) return "sti";
  }

  if (make === "hyundai" && modelFamily === "elantra") {
    if (containsAny(text, ["n line"])) return "n-line";
    if (phraseMatches(text, "n") || compact(vehicle.model) === "elantran") return "n";
  }

  return null;
}

function canonicalCabClass(vehicle: VehicleIdentity) {
  const text = vehicleText(vehicle);
  if (containsAny(text, ["crew cab", "double cab", "supercrew", "crewmax", "mega cab"])) return "crew";
  if (containsAny(text, ["extended cab", "access cab", "supercab", "king cab", "quad cab"])) return "extended";
  if (containsAny(text, ["regular cab", "single cab", "standard cab"])) return "regular";
  return null;
}

const rav4Xa50Rule: VehicleTaxonomyRule = {
  id: "toyota-rav4-xa50-powertrain",
  make: "Toyota",
  model: "RAV4",
  yearStart: 2019,
  yearEnd: 2026,
  generation: "XA50",
  families: [
    { id: "prime", labels: ["prime", "plug-in hybrid", "phev"] },
    { id: "hybrid", labels: ["hybrid", "hev"] },
    { id: "gasoline", labels: ["gasoline", "gas"] },
  ],
  classify(vehicle) {
    const text = vehicleText(vehicle);
    const fuel = canonicalFuelType(vehicle.fuelType);

    let powertrain: "prime" | "hybrid" | "gasoline" | "unknown" = "unknown";
    if (
      containsAny(text, ["prime", "plug in hybrid", "phev"]) ||
      fuel === "plug-in hybrid"
    ) {
      powertrain = "prime";
    } else if (containsAny(text, ["hybrid"]) || fuel === "hybrid") {
      powertrain = "hybrid";
    } else if (fuel === "gasoline") {
      powertrain = "gasoline";
    }

    const trim = normalize(vehicle.trim)
      .replace(/\b(?:awd|4wd|fwd|rwd|4x4)\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    return `${powertrain}|${trim || "unknown"}`;
  },
  compare(targetFamily, candidateFamily) {
    if (!targetFamily || !candidateFamily) return "supporting";

    const [targetPowertrain, targetTrim = "unknown"] = targetFamily.split("|");
    const [candidatePowertrain, candidateTrim = "unknown"] =
      candidateFamily.split("|");

    if (
      targetPowertrain === "unknown" ||
      candidatePowertrain === "unknown"
    ) {
      return "supporting";
    }

    // Prime/PHEV, ordinary Hybrid, and gasoline RAV4s are materially
    // different valuation populations even when MarketCheck calls all of
    // them simply "RAV4".
    if (targetPowertrain !== candidatePowertrain) {
      return "reject";
    }

    if (targetTrim === "unknown" || candidateTrim === "unknown") {
      return "supporting";
    }

    if (targetTrim === candidateTrim) {
      return "direct";
    }

    return "near";
  },
  notes:
    "Treats RAV4 as the model family and uses powertrain plus trim to distinguish Prime/PHEV, Hybrid, and gasoline listings when provider model naming collapses them.",
};

const broncoU725Rule: VehicleTaxonomyRule = {
  id: "ford-bronco-u725-trim-body",
  make: "Ford",
  model: "Bronco",
  yearStart: 2021,
  yearEnd: 2026,
  generation: "U725 / 6th gen",
  families: [
    { id: "base", labels: ["base"] },
    { id: "big-bend", labels: ["big bend"] },
    { id: "black-diamond", labels: ["black diamond"] },
    { id: "outer-banks", labels: ["outer banks"] },
    { id: "badlands", labels: ["badlands"] },
    { id: "wildtrak", labels: ["wildtrak"] },
    { id: "everglades", labels: ["everglades"] },
    { id: "heritage", labels: ["heritage"] },
    { id: "heritage-limited", labels: ["heritage limited"] },
    { id: "raptor", labels: ["raptor"] },
  ],
  classify(vehicle) {
    const text = vehicleText(vehicle);
    const broncoTrimLabels: Array<[string, string]> = [
      ["heritage-limited", "heritage limited"],
      ["black-diamond", "black diamond"],
      ["outer-banks", "outer banks"],
      ["big-bend", "big bend"],
      ["wildtrak", "wildtrak"],
      ["everglades", "everglades"],
      ["badlands", "badlands"],
      ["heritage", "heritage"],
      ["raptor", "raptor"],
      ["base", "base"],
    ];
    const trimMatches = broncoTrimLabels.filter(([, label]) =>
      phraseMatches(text, label),
    );

    // NHTSA/vPIC can return a Series field containing several possible Bronco
    // trims (for example "Base, Big Bend, Black Diamond, Outer Banks"). That is
    // not a real compound trim. Keep it unresolved until stronger evidence
    // identifies the target variant.
    const filteredTrimMatches = trimMatches.filter(
      ([, label], _index, allMatches) =>
        !allMatches.some(
          ([, otherLabel]) =>
            otherLabel !== label &&
            otherLabel.length > label.length &&
            otherLabel.includes(label),
        ),
    );
    const uniqueTrimIds = Array.from(
      new Set(filteredTrimMatches.map(([id]) => id)),
    );
    const trim = uniqueTrimIds.length === 1 ? uniqueTrimIds[0] : "unknown";

    const modelText = normalize([vehicle.model, vehicle.configuration].filter(Boolean).join(" "));
    const doors =
      vehicle.doors === 2 || /\b2\s*door\b/.test(modelText)
        ? "2-door"
        : vehicle.doors === 4 || /\b4\s*door\b/.test(modelText)
          ? "4-door"
          : "unknown-door";

    return `${trim}|${doors}`;
  },
  compare(targetFamily, candidateFamily) {
    if (!targetFamily || !candidateFamily) return "supporting";

    const [targetTrim = "unknown", targetDoors = "unknown-door"] =
      targetFamily.split("|");
    const [candidateTrim = "unknown", candidateDoors = "unknown-door"] =
      candidateFamily.split("|");

    if (targetTrim === "unknown" || candidateTrim === "unknown") {
      return "supporting";
    }

    // Bronco Raptor occupies a materially different performance/value market.
    if ((targetTrim === "raptor") !== (candidateTrim === "raptor")) {
      return "reject";
    }

    // Different ordinary Bronco trims are useful context, but they should not
    // be auto-treated as equal-value comps without a trim-value adjustment.
    if (targetTrim !== candidateTrim) {
      return "supporting";
    }

    if (
      targetDoors !== "unknown-door" &&
      candidateDoors !== "unknown-door" &&
      targetDoors !== candidateDoors
    ) {
      return "supporting";
    }

    return "direct";
  },
  notes:
    "Normalizes Bronco/Bronco 4-Door/Bronco 2-Door as one model family while preserving trim, door-count, and Raptor valuation differences.",
};

const wranglerTjRule: VehicleTaxonomyRule = {
  id: "jeep-wrangler-tj-lj",
  make: "Jeep",
  model: "Wrangler",
  yearStart: 1997,
  yearEnd: 2006,
  generation: "TJ/LJ",
  families: [
    { id: "lj-unlimited", labels: ["unlimited", "lj"] },
    { id: "tj-rubicon", labels: ["rubicon"] },
    { id: "tj-sahara", labels: ["sahara"] },
    { id: "tj-sport", labels: ["sport"] },
    { id: "tj-se", labels: ["se"] },
  ],
  classify(vehicle) {
    const text = vehicleText(vehicle);
    if (containsAny(text, ["unlimited", "lj"])) return "lj-unlimited";
    if (containsAny(text, ["rubicon"])) return "tj-rubicon";
    if (containsAny(text, ["sahara"])) return "tj-sahara";
    if (containsAny(text, ["sport"])) return "tj-sport";
    if (containsAny(text, ["se"])) return "tj-se";
    return null;
  },
  compare(targetFamily, candidateFamily) {
    if (!targetFamily || !candidateFamily) return "supporting";
    if (targetFamily === candidateFamily) return "direct";

    const targetIsLj = targetFamily === "lj-unlimited";
    const candidateIsLj = candidateFamily === "lj-unlimited";
    if (targetIsLj !== candidateIsLj) return "supporting";

    const targetRubicon = targetFamily === "tj-rubicon";
    const candidateRubicon = candidateFamily === "tj-rubicon";
    if (targetRubicon !== candidateRubicon) return "supporting";

    return "near";
  },
  notes:
    "Separates Wrangler Unlimited/LJ and Rubicon from ordinary standard-wheelbase TJ variants before mileage normalization.",
};

export const vehicleTaxonomyRules: VehicleTaxonomyRule[] = [
  broncoU725Rule,
  wranglerTjRule,
  rav4Xa50Rule,
];

export function findVehicleTaxonomyRule(vehicle: VehicleIdentity) {
  const make = canonicalMake(vehicle.make);
  const model = canonicalModelFamily(vehicle);

  return (
    vehicleTaxonomyRules.find(
      (rule) =>
        canonicalMake(rule.make) === make &&
        normalize(rule.model) === model &&
        vehicle.year >= rule.yearStart &&
        vehicle.year <= rule.yearEnd,
    ) || null
  );
}

function genericTrimTier(target: VehicleIdentity, candidate: VehicleIdentity) {
  const targetVariant = canonicalVehicleVariant(target);
  const candidateVariant = canonicalVehicleVariant(candidate);

  if (!targetVariant || !candidateVariant) return "supporting" as const;
  if (targetVariant === candidateVariant) return "direct" as const;

  // Distinct trim strings remain Near even when one contains the other.
  // Containment is unsafe for automotive derivatives: XL vs XLT, Premium vs
  // Premium Plus, and similar names can represent materially different trims.
  return "near" as const;
}

function tierProperties(tier: VehicleEquivalenceTier) {
  switch (tier) {
    case "direct":
      return { scoreModifier: 0, autoIncludeEligible: true };
    case "near":
      return { scoreModifier: -8, autoIncludeEligible: true };
    case "supporting":
      return { scoreModifier: -35, autoIncludeEligible: false };
    case "reject":
      return { scoreModifier: -100, autoIncludeEligible: false };
  }
}

function downgradeTier(
  tier: VehicleEquivalenceTier,
  severity: "one" | "two" = "one",
): VehicleEquivalenceTier {
  if (tier === "reject") return tier;
  const order: VehicleEquivalenceTier[] = ["direct", "near", "supporting", "reject"];
  const index = order.indexOf(tier);
  return order[Math.min(order.length - 1, index + (severity === "two" ? 2 : 1))];
}

export function evaluateVehicleEquivalence({
  target,
  candidate,
}: {
  target: VehicleIdentity;
  candidate: VehicleIdentity;
}): VehicleEquivalenceResult {
  const reasons: string[] = [];

  if (canonicalMake(target.make) !== canonicalMake(candidate.make)) {
    return {
      tier: "reject",
      ...tierProperties("reject"),
      reasons: ["make mismatch"],
    };
  }

  const targetModelFamily = canonicalModelFamily(target);
  const candidateModelFamily = canonicalModelFamily(candidate);

  if (targetModelFamily !== candidateModelFamily) {
    return {
      tier: "reject",
      ...tierProperties("reject"),
      reasons: ["model family mismatch"],
    };
  }

  const targetRule = findVehicleTaxonomyRule(target);
  const candidateRule = findVehicleTaxonomyRule(candidate);

  if (targetRule && !candidateRule) {
    return {
      tier: "reject",
      ...tierProperties("reject"),
      reasons: ["generation mismatch"],
    };
  }

  if (targetRule && candidateRule && targetRule.id !== candidateRule.id) {
    return {
      tier: "reject",
      ...tierProperties("reject"),
      reasons: ["generation mismatch"],
    };
  }

  let tier: VehicleEquivalenceTier;
  let targetClassification: string | null = null;
  let candidateClassification: string | null = null;

  if (targetRule && candidateRule) {
    targetClassification = targetRule.classify(target);
    candidateClassification = candidateRule.classify(candidate);
    tier = targetRule.compare(targetClassification, candidateClassification);

    if (targetClassification !== candidateClassification) {
      reasons.push(
        `variant differs: ${targetClassification || "unknown"} vs ${candidateClassification || "unknown"}`,
      );
    }
  } else {
    const targetSpecial = detectSpecialVariant(target);
    const candidateSpecial = detectSpecialVariant(candidate);
    targetClassification = targetSpecial || normalize(target.trim) || null;
    candidateClassification = candidateSpecial || normalize(candidate.trim) || null;

    if (targetSpecial || candidateSpecial) {
      if (targetSpecial && candidateSpecial && targetSpecial === candidateSpecial) {
        tier = "direct";
      } else {
        tier = "supporting";
        reasons.push(
          `material variant differs: ${targetSpecial || "standard"} vs ${candidateSpecial || "standard"}`,
        );
      }
    } else {
      tier = genericTrimTier(target, candidate);
      const targetVariant = canonicalVehicleVariant(target);
      const candidateVariant = canonicalVehicleVariant(candidate);
      if (targetVariant !== candidateVariant) {
        reasons.push(
          `variant differs or is incomplete: ${targetVariant || "unknown"} vs ${candidateVariant || "unknown"}`,
        );
      }
    }
  }

  const targetFuel = canonicalFuelType(target.fuelType);
  const candidateFuel = canonicalFuelType(candidate.fuelType);
  if (targetFuel && candidateFuel && targetFuel !== candidateFuel) {
    return {
      tier: "reject",
      ...tierProperties("reject"),
      reasons: [...reasons, "fuel mismatch"],
      targetClassification,
      candidateClassification,
    };
  }

  const targetBody = canonicalBodyClass(target);
  const candidateBody = canonicalBodyClass(candidate);
  if (targetBody && candidateBody && targetBody !== candidateBody) {
    const fundamentallyDifferent =
      (targetBody === "pickup" && candidateBody !== "pickup") ||
      (candidateBody === "pickup" && targetBody !== "pickup");
    tier = fundamentallyDifferent ? "reject" : "supporting";
    reasons.push(`body configuration differs: ${targetBody} vs ${candidateBody}`);
  }

  const targetCab = canonicalCabClass(target);
  const candidateCab = canonicalCabClass(candidate);
  if (targetCab && candidateCab && targetCab !== candidateCab && tier !== "reject") {
    tier = "supporting";
    reasons.push(`cab configuration differs: ${targetCab} vs ${candidateCab}`);
  }

  const targetDrive = canonicalDrivetrain(target.drivetrain);
  const candidateDrive = canonicalDrivetrain(candidate.drivetrain);
  if (targetDrive && candidateDrive && targetDrive !== candidateDrive && tier !== "reject") {
    const targetTraction = canonicalTractionClass(target.drivetrain);
    const candidateTraction = canonicalTractionClass(candidate.drivetrain);

    if (targetTraction !== candidateTraction) {
      tier = "supporting";
      reasons.push(`drivetrain differs: ${targetDrive} vs ${candidateDrive}`);
    } else if (targetTraction === "two-wheel") {
      // FWD vs RWD can materially affect desirability/value. AWD vs 4WD is
      // frequently only a source-taxonomy naming difference (quattro/xDrive,
      // etc.), so equivalent all-wheel traction does not incur a penalty.
      tier = downgradeTier(tier);
      reasons.push(`drivetrain differs: ${targetDrive} vs ${candidateDrive}`);
    }
  }

  if (
    target.cylinders &&
    candidate.cylinders &&
    target.cylinders !== candidate.cylinders &&
    tier !== "reject"
  ) {
    tier = "supporting";
    reasons.push(`engine family differs: ${target.cylinders} vs ${candidate.cylinders} cylinders`);
  }

  const targetTransmission = canonicalTransmission(target.transmission);
  const candidateTransmission = canonicalTransmission(candidate.transmission);
  if (
    targetTransmission &&
    candidateTransmission &&
    targetTransmission !== candidateTransmission &&
    tier === "direct"
  ) {
    tier = "near";
    reasons.push(`transmission differs: ${targetTransmission} vs ${candidateTransmission}`);
  }

  const needsClassificationReview =
    tier === "supporting" &&
    (!normalize(target.trim) ||
      !normalize(candidate.trim) ||
      String(targetClassification || "").includes("unknown") ||
      String(candidateClassification || "").includes("unknown") ||
      reasons.some((reason) => reason.includes("incomplete")));

  const properties = tierProperties(tier);

  return {
    tier,
    ...properties,
    reasons: reasons.length ? reasons : ["vehicle identity aligned"],
    targetClassification,
    candidateClassification,
    needsClassificationReview,
  };
}
