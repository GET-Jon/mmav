export type ModelTaxonomyFallback = {
  id: string;
  make: string;
  requestedModels: string[];
  fallbackModel: string;
  fallbackLabel: string;
  mustInclude: string[];
  rejectIfIncludes: string[];
  notes: string;
};

export const modelTaxonomyFallbacks: ModelTaxonomyFallback[] = [
  {
    id: "bmw-m3",
    make: "BMW",
    requestedModels: ["M3"],
    fallbackModel: "3 Series",
    fallbackLabel: "BMW 3 Series candidate pool, filtered to true M3 listings",
    mustInclude: ["m3"],
    rejectIfIncludes: ["m sport", "m-package", "m package", "m performance", "m340i"],
    notes:
      "Used only when a direct BMW M3 MarketCheck search returns zero. Rejects M Sport and M340i-style false positives.",
  },
  {
    id: "bmw-m4",
    make: "BMW",
    requestedModels: ["M4"],
    fallbackModel: "4 Series",
    fallbackLabel: "BMW 4 Series candidate pool, filtered to true M4 listings",
    mustInclude: ["m4"],
    rejectIfIncludes: ["m sport", "m-package", "m package", "m performance", "m440i"],
    notes:
      "Used only when a direct BMW M4 MarketCheck search returns zero. 4 Series is a retrieval pool only, not an equivalent comp.",
  },
  {
    id: "bmw-m5",
    make: "BMW",
    requestedModels: ["M5"],
    fallbackModel: "5 Series",
    fallbackLabel: "BMW 5 Series candidate pool, filtered to true M5 listings",
    mustInclude: ["m5"],
    rejectIfIncludes: ["m sport", "m-package", "m package", "m performance", "m550i"],
    notes:
      "Used only when a direct BMW M5 MarketCheck search returns zero. Rejects M Sport and M550i false positives.",
  },
  {
    id: "bmw-m8",
    make: "BMW",
    requestedModels: ["M8"],
    fallbackModel: "8 Series",
    fallbackLabel: "BMW 8 Series candidate pool, filtered to true M8 listings",
    mustInclude: ["m8"],
    rejectIfIncludes: ["m sport", "m-package", "m package", "m performance", "m850i"],
    notes:
      "Used only when a direct BMW M8 MarketCheck search returns zero. Rejects M850i and M Sport false positives.",
  },
  {
    id: "mercedes-c63",
    make: "Mercedes-Benz",
    requestedModels: ["C63", "C 63", "AMG C63", "AMG C 63"],
    fallbackModel: "C-Class",
    fallbackLabel: "Mercedes-Benz C-Class candidate pool, filtered to true AMG C63 listings",
    mustInclude: ["c63", "c 63", "amg c63", "amg c 63"],
    rejectIfIncludes: ["amg line", "c300", "c 300", "c43", "c 43"],
    notes:
      "Used only when a direct C63 search returns zero. Rejects AMG Line, C300, and C43 false positives.",
  },
  {
    id: "mercedes-e63",
    make: "Mercedes-Benz",
    requestedModels: ["E63", "E 63", "AMG E63", "AMG E 63"],
    fallbackModel: "E-Class",
    fallbackLabel: "Mercedes-Benz E-Class candidate pool, filtered to true AMG E63 listings",
    mustInclude: ["e63", "e 63", "amg e63", "amg e 63"],
    rejectIfIncludes: ["amg line", "e350", "e 350", "e450", "e 450", "e53", "e 53"],
    notes:
      "Used only when a direct E63 search returns zero. Rejects AMG Line and lower AMG/non-AMG variants.",
  },
  {
    id: "audi-s4",
    make: "Audi",
    requestedModels: ["S4"],
    fallbackModel: "A4",
    fallbackLabel: "Audi A4 candidate pool, filtered to true S4 listings",
    mustInclude: ["s4"],
    rejectIfIncludes: ["s line", "s-line", "a4"],
    notes:
      "Used only when a direct S4 search returns zero. Rejects S line cosmetic-package cars.",
  },
  {
    id: "audi-rs5",
    make: "Audi",
    requestedModels: ["RS5", "RS 5"],
    fallbackModel: "A5",
    fallbackLabel: "Audi A5 candidate pool, filtered to true RS5 listings",
    mustInclude: ["rs5", "rs 5"],
    rejectIfIncludes: ["s line", "s-line", "a5", "s5"],
    notes:
      "Used only when a direct RS5 search returns zero. Rejects A5/S5 and S line false positives.",
  },
  {
    id: "lexus-rcf",
    make: "Lexus",
    requestedModels: ["RC F", "RCF"],
    fallbackModel: "RC",
    fallbackLabel: "Lexus RC candidate pool, filtered to true RC F listings",
    mustInclude: ["rc f", "rcf"],
    rejectIfIncludes: ["f sport", "rc 350", "rc350"],
    notes:
      "Used only when a direct RC F search returns zero. Rejects F Sport cars.",
  },
  {
    id: "cadillac-ct5v-blackwing",
    make: "Cadillac",
    requestedModels: ["CT5-V Blackwing", "CT5V Blackwing"],
    fallbackModel: "CT5",
    fallbackLabel: "Cadillac CT5 candidate pool, filtered to true CT5-V Blackwing listings",
    mustInclude: ["blackwing"],
    rejectIfIncludes: ["v-sport", "v sport", "sport trim"],
    notes:
      "Used only when a direct CT5-V Blackwing search returns zero. Rejects regular CT5-V and V-Sport ambiguity unless Blackwing is present.",
  },
  {
    id: "ford-raptor",
    make: "Ford",
    requestedModels: ["F-150 Raptor", "F150 Raptor", "Raptor"],
    fallbackModel: "F-150",
    fallbackLabel: "Ford F-150 candidate pool, filtered to true Raptor listings",
    mustInclude: ["raptor"],
    rejectIfIncludes: ["fx4", "sport package"],
    notes:
      "Used only when a direct Raptor search returns zero. Rejects ordinary F-150 trims and appearance packages.",
  },
  {
    id: "honda-civic-type-r",
    make: "Honda",
    requestedModels: ["Civic Type R", "Type R"],
    fallbackModel: "Civic",
    fallbackLabel: "Honda Civic candidate pool, filtered to true Type R listings",
    mustInclude: ["type r"],
    rejectIfIncludes: ["sport", "si"],
    notes:
      "Used only when a direct Civic Type R search returns zero. Rejects Civic Sport and Si false positives.",
  },
];

export function normalizeText(value: string | null | undefined) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function findModelTaxonomyFallback({
  make,
  model,
}: {
  make: string;
  model: string;
}) {
  const normalizedMake = normalizeText(make);
  const normalizedModel = normalizeText(model);

  return modelTaxonomyFallbacks.find((fallback) => {
    if (normalizeText(fallback.make) !== normalizedMake) {
      return false;
    }

    return fallback.requestedModels.some(
      (requestedModel) => normalizeText(requestedModel) === normalizedModel
    );
  });
}
