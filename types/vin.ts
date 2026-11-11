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
  /** Optional observations; blank is unknown, not an absent feature. */
  transmission?: string;
  engineModel?: string;
  enginePowerHp?: string;
  identityEvidence?: { source: "nhtsa-vpic"; fields: Record<string, string> };
};
