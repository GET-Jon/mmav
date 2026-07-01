export type MarketCheckApiControls = {
  liveLookupEnabled: boolean;
  maxApiCallsPerSearch: number;
  minUsableCompsToStop: number;
  minInitialRegions: number;
};

export const MARKETCHECK_API_CONTROLS_STORAGE_KEY =
  "mmav_marketcheck_api_controls";

export const defaultMarketCheckApiControls: MarketCheckApiControls = {
  liveLookupEnabled: false,
  maxApiCallsPerSearch: 1,
  minUsableCompsToStop: 10,
  minInitialRegions: 1,
};

export function normalizeMarketCheckApiControls(
  value: Partial<MarketCheckApiControls> | null | undefined
): MarketCheckApiControls {
  return {
    liveLookupEnabled: Boolean(value?.liveLookupEnabled),
    maxApiCallsPerSearch: Math.max(
      1,
      Math.min(10, Number(value?.maxApiCallsPerSearch || 1))
    ),
    minUsableCompsToStop: Math.max(
      1,
      Math.min(50, Number(value?.minUsableCompsToStop || 10))
    ),
    minInitialRegions: Math.max(
      1,
      Math.min(10, Number(value?.minInitialRegions || 1))
    ),
  };
}
