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

function containsAny(text: string, values: string[]) {
  return values.some((value) => text.includes(normalize(value)));
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

const wranglerTjRule: VehicleTaxonomyRule = {
  id: "jeep-wrangler-tj-lj",
  make: "Jeep",
  model: "Wrangler",
  yearStart: 1997,
  yearEnd: 2006,
  generation: "TJ/LJ",
  families: [
    {
      id: "lj-unlimited",
      labels: ["unlimited", "lj"],
    },
    {
      id: "tj-rubicon",
      labels: ["rubicon"],
    },
    {
      id: "tj-sahara",
      labels: ["sahara"],
    },
    {
      id: "tj-sport",
      labels: ["sport"],
    },
    {
      id: "tj-se",
      labels: ["se"],
    },
  ],
  classify(vehicle) {
    const text = vehicleText(vehicle);

    // In 2004-2006 the Wrangler Unlimited is the long-wheelbase LJ and is a
    // materially different economic product from a standard-wheelbase TJ.
    if (containsAny(text, ["unlimited", "lj"])) {
      return "lj-unlimited";
    }

    if (containsAny(text, ["rubicon"])) {
      return "tj-rubicon";
    }

    if (containsAny(text, ["sahara"])) {
      return "tj-sahara";
    }

    if (containsAny(text, ["sport"])) {
      return "tj-sport";
    }

    if (containsAny(text, ["se"])) {
      return "tj-se";
    }

    return null;
  },
  compare(targetFamily, candidateFamily) {
    if (!targetFamily || !candidateFamily) {
      return "supporting";
    }

    if (targetFamily === candidateFamily) {
      return "direct";
    }

    const targetIsLj = targetFamily === "lj-unlimited";
    const candidateIsLj = candidateFamily === "lj-unlimited";

    // Never let LJ/Unlimited establish the primary valuation of a standard TJ,
    // or vice versa. It can remain visible as supporting market evidence.
    if (targetIsLj !== candidateIsLj) {
      return "supporting";
    }

    // Standard-wheelbase TJ trims are adjacent enough to be near comps, but
    // remain distinct so trim premiums can be handled explicitly later.
    return "near";
  },
  notes:
    "Separates Wrangler Unlimited/LJ from standard-wheelbase TJ variants before mileage normalization.",
};

export const vehicleTaxonomyRules: VehicleTaxonomyRule[] = [wranglerTjRule];

export function findVehicleTaxonomyRule(vehicle: VehicleIdentity) {
  const make = normalize(vehicle.make);
  const model = normalize(vehicle.model);

  return (
    vehicleTaxonomyRules.find(
      (rule) =>
        normalize(rule.make) === make &&
        normalize(rule.model) === model &&
        vehicle.year >= rule.yearStart &&
        vehicle.year <= rule.yearEnd,
    ) || null
  );
}

function genericTrimTier(target: VehicleIdentity, candidate: VehicleIdentity) {
  const targetTrim = normalize(target.trim);
  const candidateTrim = normalize(candidate.trim);

  if (!targetTrim || !candidateTrim) {
    return "supporting" as const;
  }

  if (targetTrim === candidateTrim) {
    return "direct" as const;
  }

  return "near" as const;
}

function tierProperties(tier: VehicleEquivalenceTier) {
  switch (tier) {
    case "direct":
      return { scoreModifier: 0, autoIncludeEligible: true };
    case "near":
      return { scoreModifier: -10, autoIncludeEligible: true };
    case "supporting":
      return { scoreModifier: -30, autoIncludeEligible: false };
    case "reject":
      return { scoreModifier: -100, autoIncludeEligible: false };
  }
}

export function evaluateVehicleEquivalence({
  target,
  candidate,
}: {
  target: VehicleIdentity;
  candidate: VehicleIdentity;
}): VehicleEquivalenceResult {
  const reasons: string[] = [];

  if (normalize(target.make) !== normalize(candidate.make)) {
    return {
      tier: "reject",
      ...tierProperties("reject"),
      reasons: ["make mismatch"],
    };
  }

  if (normalize(target.model) !== normalize(candidate.model)) {
    return {
      tier: "reject",
      ...tierProperties("reject"),
      reasons: ["model mismatch"],
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
    tier = genericTrimTier(target, candidate);

    if (normalize(target.trim) !== normalize(candidate.trim)) {
      reasons.push("trim differs or is incomplete");
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

  const targetDrive = normalize(target.drivetrain);
  const candidateDrive = normalize(candidate.drivetrain);

  if (targetDrive && candidateDrive && targetDrive !== candidateDrive) {
    if (tier === "direct") {
      tier = "near";
    } else if (tier === "near") {
      tier = "supporting";
    }
    reasons.push("drivetrain differs");
  }

  const properties = tierProperties(tier);

  return {
    tier,
    ...properties,
    reasons: reasons.length ? reasons : ["vehicle identity aligned"],
    targetClassification,
    candidateClassification,
  };
}
