/** Keep decoder observations without claiming that every returned trim is VIN-unique. */
export function preserveNhtsaEvidence(result: Record<string, string>) {
  const keys = ["ModelYear", "Make", "Model", "Trim", "Trim2", "Series", "Series2", "BodyClass", "BodyCabType", "Doors",
    "DriveType", "FuelTypePrimary", "FuelTypeSecondary", "ElectrificationLevel", "EngineModel", "EngineCylinders",
    "DisplacementL", "EngineHP", "EngineHP_to", "Turbo", "TransmissionStyle", "TransmissionSpeeds", "BedLengthIN",
    "WheelBaseShort", "WheelBaseLong", "DestinationMarket", "ErrorCode", "ErrorText", "AdditionalErrorText", "PossibleValues"];
  return {
    source: "nhtsa-vpic" as const,
    fields: Object.fromEntries(keys.filter(key => typeof result[key] === "string").map(key => [key, result[key]])),
  };
}
