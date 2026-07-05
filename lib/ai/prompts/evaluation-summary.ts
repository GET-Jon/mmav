import type { EvaluationSummaryInput } from "../types";

export const EVALUATION_SUMMARY_SYSTEM_PROMPT = `You generate concise internal used-car appraisal notes for a dealer auction valuation tool.

Rules:
- Use only the data provided.
- Do not invent condition issues, history, options, title status, damage, service history, or market facts.
- If data is missing, omit it or state that it is not available.
- Be conservative and appraisal-oriented.
- Mention comp confidence when available.
- Mention current bid versus target/safe bid when available.
- Mention projected gross profit when available.
- Mention risk grade and decision when available.
- Keep output to one concise paragraph, 80–140 words.
- End with a clear recommendation.`;

function formatCurrency(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatNumber(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(value);
}

function line(label: string, value?: string | number | null) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  return `${label}: ${value}`;
}

export function buildEvaluationSummaryPrompt(input: EvaluationSummaryInput) {
  const selectedConditionRules = Array.isArray(input.selectedConditionRules)
    ? input.selectedConditionRules.filter(Boolean)
    : [];

  const lines = [
    line("Vehicle", input.vehicleTitle),
    line("VIN", input.vin),
    line("Mileage", formatNumber(input.mileage)),
    line("Auction site", input.auctionSite),
    line("Current bid", formatCurrency(input.currentBid)),
    line("Market Comp Avg", formatCurrency(input.marketCompAverage)),
    line("Median Adjusted Comp", formatCurrency(input.medianAdjusted)),
    line("Final Retail Target", formatCurrency(input.finalRetailTarget)),
    line("Safe Bid", formatCurrency(input.safeBid)),
    line("Max Smart Bid", formatCurrency(input.maxSmartBid)),
    line("Stretch Bid", formatCurrency(input.stretchBid)),
    line("Expected Gross Profit", formatCurrency(input.expectedGrossProfit)),
    line("Risk Grade", input.riskGrade),
    line("Decision", input.decision),
    line("Comp Confidence", input.compConfidence),
    line("Included Comp Count", input.includedCompCount),
    line("Total Comp Count", input.totalCompCount),
    selectedConditionRules.length
      ? line("Selected Risk / Condition Rules", selectedConditionRules.join("; "))
      : null,
    line("Existing Notes", input.notes),
  ].filter(Boolean);

  return `Create one concise internal dealer/appraisal note from this structured evaluator data.

Do not add facts beyond the data below.

${lines.join("\n")}`;
}
