export type VehicleGenerationRuleSource = "sheet" | "override";

export type VehicleGenerationRule = {
  id: string;
  make: string;
  model: string;
  segment?: string | null;
  bodyStyle?: string | null;
  generation: string;
  startYear: number;
  endYear: number;
  refreshYears: number[];
  recommendedCompGroup?: string | null;
  hardBreakBefore?: number | null;
  hardBreakAfter?: number | null;
  refreshTreatment?: string | null;
  notes?: string | null;
  confidence?: string | null;
  sourceUrl?: string | null;
  source: VehicleGenerationRuleSource;
};

export type VehicleGenerationInput = {
  year?: number | string | null;
  make?: string | null;
  model?: string | null;
  trim?: string | null;
  bodyStyle?: string | null;
  bodyClass?: string | null;
  notes?: string | null;
};

export type VehicleGenerationMatch = VehicleGenerationRule & {
  reason: string;
};
