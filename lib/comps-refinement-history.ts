import type { MarketComp } from "@/types/comps";

export type RefinementSnapshot = {
  comps: MarketComp[];
  selected: number;
  primaryIds: string[];
  retail: number | null;
  confidence: "Low" | "Medium" | "High";
  regions: string[];
};

export type RefinementEvent = {
  id: string;
  at: string;
  action: "search" | "selection";
  status: "improved" | "partial" | "unchanged" | "failed";
  newRegions: string[];
  newUnique: number;
  newRelated: number;
  primaryDelta: number;
  beforeSelected: number;
  afterSelected: number;
  beforeRetail: number | null;
  afterRetail: number | null;
  beforeConfidence: string;
  afterConfidence: string;
  error?: string;
};

function vehicleKey(comp: MarketComp) {
  const vin = String(comp.marketCheckDetails?.vin || "").trim().toUpperCase();
  if (/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) return "vin:" + vin;
  // Without a VIN, provider IDs cannot prove two different listings are the same vehicle.
  return "id:" + comp.id;
}

export function buildRefinementEvent(
  before: RefinementSnapshot,
  after: RefinementSnapshot,
  action: RefinementEvent["action"],
  error?: string,
): RefinementEvent {
  const existing = new Set(before.comps.map(vehicleKey));
  const newlyFound = after.comps.filter(comp => !existing.has(vehicleKey(comp)));
  const unique = new Map(newlyFound.map(comp => [vehicleKey(comp), comp]));
  const additions = [...unique.values()];
  const related = additions.filter(comp =>
    comp.equivalenceTier !== "reject" && comp.equivalenceTier !== "supporting" &&
    comp.qualityScore >= 0,
  );
  const newRegions = after.regions.filter(region => !before.regions.includes(region));
  const primaryDelta = after.primaryIds.length - before.primaryIds.length;
  const confidenceRank = { Low: 0, Medium: 1, High: 2 };
  const priceChanged = before.retail !== after.retail;
  const evidenceImproved = primaryDelta > 0 ||
    confidenceRank[after.confidence] > confidenceRank[before.confidence];
  const changed = additions.length > 0 || before.selected !== after.selected ||
    primaryDelta !== 0 || priceChanged || newRegions.length > 0;
  return {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    action,
    status: error ? "failed" : evidenceImproved ? "improved" : changed ? "partial" : "unchanged",
    newRegions,
    newUnique: additions.length,
    newRelated: related.length,
    primaryDelta,
    beforeSelected: before.selected,
    afterSelected: after.selected,
    beforeRetail: before.retail,
    afterRetail: after.retail,
    beforeConfidence: before.confidence,
    afterConfidence: after.confidence,
    ...(error ? { error } : {}),
  };
}
