export type VinDecodeResult = {
  vin: string;
  status: string;
  year: string;
  make: string;
  model: string;
  trim: string;
  bodyClass: string;
  doors?: string;
  engineCylinders: string;
  displacementL: string;
  driveType: string;
  fuelType: string;
  plantCountry: string;
  identityEvidence?: {
    sources: Array<"nhtsa" | "auto_dev">;
    confidence: "high" | "partial" | "conflict";
    ambiguousTrim: boolean;
    possibleTrims: string[];
    conflicts: string[];
    attributes?: Partial<Record<
      "year" | "make" | "model" | "trim" | "engineCylinders" | "displacementL" | "driveType" | "fuelType" | "bodyClass",
      {
        confidence: "corroborated" | "single_source" | "conflict" | "unverified";
        reported: Partial<Record<"nhtsa" | "auto_dev", string>>;
      }
    >>;
    durationMs: number;
    cache: "hit" | "miss";
    providerHealth?: Array<{ provider: "nhtsa" | "auto_dev"; status: "ok" | "partial" | "http_error" | "timeout" | "unavailable" | "not_configured"; httpStatus?: number; durationMs: number }>;
    engineNote?: string;
  };
};
