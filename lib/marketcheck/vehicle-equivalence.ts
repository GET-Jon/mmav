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

function normalize(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compact(value: unknown) {
  return normalize(value).replace(/\s+/g, "");
}

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

function canonicalMake(value: unknown) {
  const make = normalize(value);
  if (make === "mercedes" || make === "mercedes benz" || make === "mercedesbenz") {
    return "mercedes benz";
  }
  return make;
}

function canonicalModelFamily(vehicle: VehicleIdentity) {
  const make = canonicalMake(vehicle.make);
  const model = normalize(vehicle.model);
  const modelCompact = compact(vehicle.model);

  if (make === "bmw") {
    const aliases: Record<string, string> = {
      m2: "2 series",
      m3: "3 series",
      m4: "4 series",
      m5: "5 series",
      m8: "8 series",
    };
    return aliases[modelCompact] || model;
  }

  if (make === "mercedes benz") {
    if (["c43", "c63", "amgc43", "amgc63"].includes(modelCompact)) return "c class";
    if (["e53", "e63", "amge53", "amge63"].includes(modelCompact)) return "e class";
    if (["a35", "a45", "amga35", "amga45"].includes(modelCompact)) return "a class";
    if (["cla35", "cla45", "amgcla35", "amgcla45"].includes(modelCompact)) return "cla class";
  }

  if (make === "audi") {
    const aliases: Record<string, string> = {
      s3: "a3",
      rs3: "a3",
      s4: "a4",
      rs4: "a4",
      s5: "a5",
      rs5: "a5",
      s6: "a6",
      rs6: "a6",
      s7: "a7",
      rs7: "a7",
      s8: "a8",
      sq5: "q5",
      rsq8: "q8",
    };
    return aliases[modelCompact] || model;
  }

  if (make === "ford") {
    if (["f150raptor", "raptor", "f150raptorr"].includes(modelCompact)) return "f 150";
  }

  if (make === "honda" && ["civictyper", "typer"].includes(modelCompact)) {
    return "civic";
  }

  if (make === "cadillac" && ["ct5vblackwing", "ct5blackwing"].includes(modelCompact)) {
    return "ct5";
  }

  if (make === "lexus" && ["rcf"].includes(modelCompact)) {
    return "rc";
  }

  if (make === "volkswagen" && ["golfr", "golfgti", "gti"].includes(modelCompact)) {
    return "golf";
  }

  if (make === "subaru" && ["wrxsti", "sti"].includes(modelCompact)) {
    return "wrx";
  }

  if (make === "hyundai" && ["elantran"].includes(modelCompact)) {
    return "elantra";
  }

  if (make === "jeep" && model.startsWith("wrangler unlimited")) {
    return "wrangler";
  }

  return model;
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
    const variants = ["rsq8", "rs7", "rs6", "rs5", "rs4", "rs3", "sq5", "s8", "s7", "s6", "s5", "s4", "s3"];
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

function canonicalBodyClass(vehicle: VehicleIdentity) {
  const text = normalize([vehicle.bodyType, vehicle.configuration, vehicle.trim].filter(Boolean).join(" "));
  if (!text) return null;
  if (containsAny(text, ["convertible", "cabriolet", "cabrio", "roadster", "spyder"])) return "convertible";
  if (containsAny(text, ["coupe", "2 door coupe"])) return "coupe";
  if (containsAny(text, ["wagon", "estate", "avant", "touring"])) return "wagon";
  if (containsAny(text, ["hatchback", "hatch"])) return "hatchback";
  if (containsAny(text, ["pickup", "truck"])) return "pickup";
  if (containsAny(text, ["sedan", "saloon"])) return "sedan";
  if (containsAny(text, ["suv", "sport utility", "crossover"])) return "suv";
  if (containsAny(text, ["van", "minivan"])) return "van";
  return null;
}

function canonicalCabClass(vehicle: VehicleIdentity) {
  const text = vehicleText(vehicle);
  if (containsAny(text, ["crew cab", "double cab", "supercrew", "crewmax", "mega cab"])) return "crew";
  if (containsAny(text, ["extended cab", "access cab", "supercab", "king cab", "quad cab"])) return "extended";
  if (containsAny(text, ["regular cab", "single cab", "standard cab"])) return "regular";
  return null;
}

function canonicalDrive(value: unknown) {
  const text = normalize(value);
  if (!text) return null;
  if (text.includes("4wd") || text.includes("4x4") || text.includes("four wheel")) return "4wd";
  if (text.includes("awd") || text.includes("all wheel")) return "awd";
  if (text.includes("fwd") || text.includes("front wheel")) return "fwd";
  if (text.includes("rwd") || text.includes("rear wheel")) return "rwd";
  if (text.includes("2wd") || text.includes("4x2") || text.includes("two wheel")) return "2wd";
  return text;
}

function canonicalTransmission(value: unknown) {
  const text = normalize(value);
  if (!text) return null;
  if (text.includes("manual") || text.includes("stick")) return "manual";
  if (text.includes("automatic") || text.includes("auto") || text.includes("dct") || text.includes("cvt")) return "automatic";
  return null;
}

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

export const vehicleTaxonomyRules: VehicleTaxonomyRule[] = [wranglerTjRule];

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
  const targetTrim = normalize(target.trim);
  const candidateTrim = normalize(candidate.trim);

  if (!targetTrim || !candidateTrim) return "supporting" as const;
  if (targetTrim === candidateTrim) return "direct" as const;
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
      if (normalize(target.trim) !== normalize(candidate.trim)) {
        reasons.push("trim differs or is incomplete");
      }
    }
  }

  const targetFuel = normalize(target.fuelType);
  const candidateFuel = normalize(candidate.fuelType);
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

  const targetDrive = canonicalDrive(target.drivetrain);
  const candidateDrive = canonicalDrive(candidate.drivetrain);
  if (targetDrive && candidateDrive && targetDrive !== candidateDrive && tier !== "reject") {
    const targetTraction = targetDrive === "awd" || targetDrive === "4wd";
    const candidateTraction = candidateDrive === "awd" || candidateDrive === "4wd";

    if (targetTraction !== candidateTraction) {
      tier = "supporting";
    } else {
      tier = downgradeTier(tier);
    }
    reasons.push(`drivetrain differs: ${targetDrive} vs ${candidateDrive}`);
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
