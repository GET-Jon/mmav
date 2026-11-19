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
    durationMs: number;
    cache: "hit" | "miss";
  };
};
