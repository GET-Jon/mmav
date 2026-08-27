import type { InventoryVehicleView } from "@/lib/mindful-inventory/types";
import type { InventoryWorkOrderView } from "@/lib/mindful-inventory/active-work";

export type PartSearchConfidence = "high" | "medium" | "verify";
export type RecommendedPartNeed = "likely_required" | "possible" | "consumable";

export type RecommendedPartSuggestion = {
  name: string;
  need: RecommendedPartNeed;
  searchQuery: string;
};

export type PartSearchSuggestion = {
  workOrderId: string;
  workOrderTitle: string;
  partName: string;
  fitmentLabel: string;
  searchQuery: string;
  alternateQueries: string[];
  recommendedParts: RecommendedPartSuggestion[];
  aiNormalized?: boolean;
  confidence: PartSearchConfidence;
  confidenceLabel: string;
  sources: Array<{
    key: "turn14" | "amazon" | "ebay";
    label: string;
    url: string;
    note: string;
  }>;
};

function cleanPartName(title: string) {
  const cleaned = title
    .replace(/^\s*(replace|install|repair|fix|upgrade|add|source|order|inspect|check|diagnose)\s+/i, "")
    .replace(/^\s*(front|rear)\s+(left|right)\s+/i, (match) => match.trim() + " ")
    .trim();
  return cleaned || title.trim();
}

function findNestedString(value: unknown, wantedKeys: string[], depth = 0): string | null {
  if (!value || typeof value !== "object" || depth > 7) return null;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (wantedKeys.includes(key.toLowerCase()) && typeof child === "string" && child.trim()) {
      return child.trim();
    }
  }
  for (const child of Object.values(value as Record<string, unknown>)) {
    const found = findNestedString(child, wantedKeys, depth + 1);
    if (found) return found;
  }
  return null;
}

function fitmentExtras(vehicle: InventoryVehicleView) {
  const chassis = findNestedString(vehicle.sourceSnapshot, ["chassis", "chassiscode", "modelcode", "platform", "generation"]);
  const body = findNestedString(vehicle.sourceSnapshot, ["bodyclass", "bodystyle", "body"]);
  const engine = findNestedString(vehicle.sourceSnapshot, ["enginecode", "engine", "enginename"]);
  const drive = findNestedString(vehicle.sourceSnapshot, ["drivetype", "drivetrain"]);

  const extras = [chassis, body, engine, drive]
    .filter((item): item is string => Boolean(item))
    .filter((item, index, array) => array.findIndex((other) => other.toLowerCase() === item.toLowerCase()) === index)
    .slice(0, 2);
  return extras;
}

function confidenceForWork(work: InventoryWorkOrderView): { confidence: PartSearchConfidence; label: string } {
  const text = `${work.category} ${work.title}`.toLowerCase();
  if (/oil filter|air filter|cabin filter|spark plug|ignition coil|brake pad|brake rotor|wiper/.test(text)) {
    return { confidence: "high", label: "Focused search · verify fitment" };
  }
  if (/spoiler|diffuser|splitter|grille|trim|body|interior|wheel|tire|light|headlight|taillight/.test(text)) {
    return { confidence: "verify", label: "Style / fitment varies · verify before ordering" };
  }
  return { confidence: "medium", label: "Good starting search · verify fitment" };
}

export function buildPartSearchSources(searchQuery: string): PartSearchSuggestion["sources"] {
  const encoded = encodeURIComponent(searchQuery);
  return [
    {
      key: "turn14",
      label: "Turn 14 Portal",
      url: "https://www.turn14.com/",
      note: "Turn 14 keeps its live product catalog inside the dealer portal. Open the portal, then paste the generated search phrase.",
    },
    {
      key: "amazon",
      label: "Amazon",
      url: `https://www.amazon.com/s?k=${encoded}`,
      note: "Search Amazon with vehicle fitment context.",
    },
    {
      key: "ebay",
      label: "eBay",
      url: `https://www.ebay.com/sch/i.html?_nkw=${encoded}`,
      note: "Search eBay with vehicle fitment context.",
    },
  ];
}

export function buildPartSearchSuggestion(
  vehicle: InventoryVehicleView,
  work: InventoryWorkOrderView,
): PartSearchSuggestion {
  const partName = cleanPartName(work.title);
  const extras = fitmentExtras(vehicle);
  const vehicleTokens = [vehicle.year, vehicle.make, vehicle.model, vehicle.trim, ...extras]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  const searchQuery = `${vehicleTokens} ${partName}`.replace(/\s+/g, " ").trim();
  const confidence = confidenceForWork(work);

  return {
    workOrderId: work.id,
    workOrderTitle: work.title,
    partName,
    fitmentLabel: vehicleTokens,
    searchQuery,
    alternateQueries: [],
    recommendedParts: [],
    aiNormalized: false,
    confidence: confidence.confidence,
    confidenceLabel: confidence.label,
    sources: buildPartSearchSources(searchQuery),
  };
}
