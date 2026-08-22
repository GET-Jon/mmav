import { GoogleAiTextClient } from "./providers/google";
import {
  buildPreliminaryWorkPlanPrompt,
  getPreliminaryWorkPlanSystemPrompt,
} from "./prompts/work-plan";
import type {
  PreliminaryWorkPlan,
  PreliminaryWorkPlanInput,
  PreliminaryWorkPlanItem,
} from "./work-plan-types";

const classifications = ["required", "recommended", "optional", "upgrade", "investigate"] as const;
const decisions = ["approved", "declined", "investigate", "monitor"] as const;
const priorities = ["1", "2", "3"] as const;
const costSources = ["known_quote", "historical_actual", "catalog_parts_cost", "comparable_vehicle", "ai_estimate", "unknown"] as const;

function getGoogleClient() {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) throw new Error("Missing Gemini API key. Set GEMINI_API_KEY or GOOGLE_API_KEY.");

  return new GoogleAiTextClient({
    apiKey,
    model: (process.env.AI_MODEL ?? "gemini-3.1-flash-lite")
      .trim()
      .replace(/^["']|["']$/g, "")
      .replace(/^models\//, ""),
  });
}

function parseJsonResponse(text: string): unknown {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  try {
    return JSON.parse(cleaned);
  } catch {
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    if (firstBrace === -1 || lastBrace <= firstBrace) throw new Error("AI response did not contain a JSON object.");
    return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
  }
}

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function nullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(String(value).replace(/[$,]/g, ""));
  return Number.isFinite(parsed) ? Math.max(0, parsed) : null;
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && allowed.includes(value as T) ? (value as T) : fallback;
}

function normalizeItem(
  value: unknown,
  allowedFindingIds: Set<string>,
  allowedUpgradeIds: Set<string>,
): PreliminaryWorkPlanItem | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const title = stringValue(item.title);
  if (!title) return null;

  const low = nullableNumber(item.estimatedCostLow);
  const highInput = nullableNumber(item.estimatedCostHigh);
  const high = highInput === null ? low : low === null ? highInput : Math.max(low, highInput);
  const planningInput = nullableNumber(item.planningAmount);
  const planningAmount = planningInput ?? high ?? low ?? 0;
  const rawSource = enumValue(item.costSource, costSources, "unknown");
  const costSource = ["known_quote", "historical_actual", "catalog_parts_cost", "comparable_vehicle"].includes(rawSource)
    ? "unknown"
    : rawSource;

  let classification = enumValue(item.classification, classifications, "investigate");
  let decision = enumValue(item.decision, decisions, "investigate");
  let managerInvestigationRequired = item.managerInvestigationRequired === true;

  if (costSource === "unknown") {
    classification = classification === "upgrade" ? "upgrade" : "investigate";
    decision = "investigate";
    managerInvestigationRequired = true;
  }

  const findingIds = Array.isArray(item.findingIds)
    ? Array.from(new Set(item.findingIds.filter((id): id is string => typeof id === "string" && allowedFindingIds.has(id))))
    : [];
  const rawUpgradeId = typeof item.upgradeId === "string" ? item.upgradeId : null;
  const upgradeId = rawUpgradeId && allowedUpgradeIds.has(rawUpgradeId) ? rawUpgradeId : null;

  const confidenceRaw = nullableNumber(item.confidence);
  const confidence = confidenceRaw === null ? null : Math.min(1, confidenceRaw);

  const labor = nullableNumber(item.estimatedLaborHours);
  const elapsedInput = nullableNumber(item.estimatedElapsedHours);
  const legacy = nullableNumber(item.estimatedDurationHours);
  const elapsed = elapsedInput === null
    ? (legacy === null ? labor : Math.max(labor ?? 0, legacy))
    : Math.max(labor ?? 0, elapsedInput);

  return {
    title,
    description: stringValue(item.description) || null,
    category: stringValue(item.category, "other"),
    classification,
    decision,
    priority: enumValue(item.priority, priorities, "2"),
    rationale: stringValue(item.rationale, "Included from the supplied vehicle evidence for review."),
    estimatedCostLow: low,
    estimatedCostHigh: high,
    planningAmount,
    estimatedDurationHours: elapsed,
    estimatedLaborHours: labor,
    estimatedElapsedHours: elapsed,
    confidence,
    assumptions: Array.isArray(item.assumptions)
      ? item.assumptions.filter((entry): entry is string => typeof entry === "string").map((entry) => entry.trim()).filter(Boolean).slice(0, 10)
      : [],
    managerInvestigationRequired,
    costSource,
    costSourceDetail: stringValue(item.costSourceDetail) || null,
    findingIds,
    upgradeId,
  };
}

export async function generatePreliminaryWorkPlan(input: PreliminaryWorkPlanInput): Promise<PreliminaryWorkPlan> {
  const client = getGoogleClient();
  const result = await client.generateText({
    system: getPreliminaryWorkPlanSystemPrompt(),
    prompt: buildPreliminaryWorkPlanPrompt(input),
    temperature: 0.1,
    maxOutputTokens: 5000,
    responseMimeType: "application/json",
  });

  const parsed = parseJsonResponse(result.text);
  if (!parsed || typeof parsed !== "object") throw new Error("AI preliminary Work Plan was not an object.");
  const object = parsed as Record<string, unknown>;
  const findingIds = new Set(input.findings.map((finding) => finding.id));
  const upgradeIds = new Set(input.upgrades.map((upgrade) => upgrade.id));
  const items = Array.isArray(object.items)
    ? object.items.slice(0, 30).map((item) => normalizeItem(item, findingIds, upgradeIds)).filter((item): item is PreliminaryWorkPlanItem => Boolean(item))
    : [];

  if (items.length === 0 && (input.findings.length > 0 || input.upgrades.length > 0)) {
    throw new Error("AI did not return any usable Preliminary Work Plan items.");
  }

  return {
    summary: stringValue(object.summary, items.length ? "Preliminary Work Plan generated from Intake and Mechanical evidence." : "No work was proposed from the supplied evidence."),
    assumptions: Array.isArray(object.assumptions)
      ? object.assumptions.filter((entry): entry is string => typeof entry === "string").map((entry) => entry.trim()).filter(Boolean).slice(0, 20)
      : [],
    items,
  };
}
