import {
  buildConditionAnalysisPrompt,
  getConditionAnalysisSystemPrompt,
} from "./prompts/condition-analysis";
import { GoogleAiTextClient } from "./providers/google";
import type {
  ConditionAnalysis,
  ConditionAnalysisInput,
  ConditionAnalysisIssue,
  ConditionConfidence,
  ConditionIssueCategory,
  ConditionIssueCertainty,
  ConditionIssueSeverity,
  ConditionOverallRisk,
} from "./condition-analysis-types";

const ISSUE_CATEGORIES: ConditionIssueCategory[] = [
  "mechanical",
  "cosmetic",
  "wear",
  "history",
  "structural",
  "title",
  "transportation",
  "inspection",
  "other",
];

const ISSUE_SEVERITIES: ConditionIssueSeverity[] = [
  "minor",
  "moderate",
  "severe",
];

const ISSUE_CERTAINTIES: ConditionIssueCertainty[] = [
  "confirmed",
  "suspected",
  "inspection_required",
];

const CONFIDENCE_LEVELS: ConditionConfidence[] = ["low", "medium", "high"];

const OVERALL_RISK_LEVELS: ConditionOverallRisk[] = [
  "low",
  "moderate",
  "elevated",
  "high",
];

function getGoogleClient() {
  const apiKey =
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.GOOGLE_AI_API_KEY;

  if (!apiKey) {
    throw new Error(
      "Missing Gemini API key. Set GEMINI_API_KEY or GOOGLE_API_KEY.",
    );
  }

  return new GoogleAiTextClient({
    apiKey,
    model: (process.env.AI_MODEL ?? "gemini-3.1-flash-lite")
      .trim()
      .replace(/^["']|["']$/g, "")
      .replace(/^models\//, ""),
  });
}

function cleanString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function cleanNumber(value: unknown, fallback = 0) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.replace(/[$,]/g, ""))
        : Number.NaN;

  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : fallback;
}

function cleanBoolean(value: unknown, fallback = true) {
  return typeof value === "boolean" ? value : fallback;
}

function cleanStringArray(value: unknown, limit = 20) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, limit);
}

function cleanEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  return typeof value === "string" && allowed.includes(value as T)
    ? (value as T)
    : fallback;
}

function parseJsonResponse(text: string): unknown {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");

  try {
    return JSON.parse(cleaned);
  } catch {
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");

    if (firstBrace === -1 || lastBrace <= firstBrace) {
      throw new Error("AI response did not contain a JSON object.");
    }

    return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
  }
}

function normalizeIssue(
  value: unknown,
  index: number,
): ConditionAnalysisIssue | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const issue = value as Record<string, unknown>;
  const description = cleanString(issue.description);

  if (!description) {
    return null;
  }

  const estimatedCostLow = cleanNumber(issue.estimatedCostLow);
  const estimatedCostHigh = Math.max(
    estimatedCostLow,
    cleanNumber(issue.estimatedCostHigh, estimatedCostLow),
  );

  const rawPlanningEstimate = cleanNumber(
    issue.planningEstimate,
    Math.round((estimatedCostLow + estimatedCostHigh) / 2),
  );

  const planningEstimate = Math.min(
    estimatedCostHigh,
    Math.max(estimatedCostLow, rawPlanningEstimate),
  );

  return {
    id: cleanString(issue.id, `issue-${index + 1}`),
    description,
    category: cleanEnum(issue.category, ISSUE_CATEGORIES, "other"),
    severity: cleanEnum(issue.severity, ISSUE_SEVERITIES, "moderate"),
    certainty: cleanEnum(
      issue.certainty,
      ISSUE_CERTAINTIES,
      "inspection_required",
    ),
    estimatedCostLow,
    estimatedCostHigh,
    planningEstimate,
    estimatedDurationDays: cleanNumber(issue.estimatedDurationDays),
    includeInValuation: cleanBoolean(issue.includeInValuation),
    assumptions: cleanStringArray(issue.assumptions, 10),
    confidence: cleanEnum(issue.confidence, CONFIDENCE_LEVELS, "low"),
    sourceText: cleanString(issue.sourceText, description),
  };
}

function normalizeAnalysis(value: unknown): ConditionAnalysis {
  if (!value || typeof value !== "object") {
    throw new Error("AI condition analysis was not an object.");
  }

  const analysis = value as Record<string, unknown>;

  const issues = Array.isArray(analysis.issues)
    ? analysis.issues
        .slice(0, 15)
        .map(normalizeIssue)
        .filter((issue): issue is ConditionAnalysisIssue => Boolean(issue))
    : [];

  const includedIssues = issues.filter((issue) => issue.includeInValuation);

  const calculatedLow = includedIssues.reduce(
    (sum, issue) => sum + issue.estimatedCostLow,
    0,
  );

  const calculatedHigh = includedIssues.reduce(
    (sum, issue) => sum + issue.estimatedCostHigh,
    0,
  );

  const calculatedPlanning = includedIssues.reduce(
    (sum, issue) => sum + issue.planningEstimate,
    0,
  );

  const readyDaysLow = cleanNumber(analysis.estimatedReadyDaysLow);
  const readyDaysHigh = Math.max(
    readyDaysLow,
    cleanNumber(analysis.estimatedReadyDaysHigh, readyDaysLow),
  );

  return {
    summary: cleanString(
      analysis.summary,
      issues.length
        ? "Condition issues were identified and require review."
        : "No specific condition issues were identified from the supplied text.",
    ),
    overallRisk: cleanEnum(
      analysis.overallRisk,
      OVERALL_RISK_LEVELS,
      issues.length ? "moderate" : "low",
    ),
    estimatedCostLow: calculatedLow,
    estimatedCostHigh: calculatedHigh,
    planningEstimate: calculatedPlanning,
    estimatedReadyDaysLow: readyDaysLow,
    estimatedReadyDaysHigh: readyDaysHigh,
    issues,
    recommendedInspections: cleanStringArray(
      analysis.recommendedInspections,
      20,
    ),
    missingInformation: cleanStringArray(analysis.missingInformation, 20),
    warnings: cleanStringArray(analysis.warnings, 20),
  };
}

export async function generateConditionAnalysis(
  input: ConditionAnalysisInput,
): Promise<ConditionAnalysis> {
  const client = getGoogleClient();

  const result = await client.generateText({
    system: getConditionAnalysisSystemPrompt(),
    prompt: buildConditionAnalysisPrompt(input),
    temperature: 0.1,
    maxOutputTokens: 4000,
    responseMimeType: "application/json",
  });

  const parsed = parseJsonResponse(result.text);
  return normalizeAnalysis(parsed);
}
