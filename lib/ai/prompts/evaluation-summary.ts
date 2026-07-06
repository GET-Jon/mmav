import type { EvaluationSummaryInput, EvaluationThesisMode } from "../types";

const BASE_RULES = `Rules:
- Use only the provided vehicle and evaluator data.
- Do not invent accident history, title issues, service history, options, trim details, mechanical problems, or condition facts.
- You may mention common model-specific considerations only if phrased as things to verify, inspect, or research, not as confirmed problems.
- Be conservative and dealer-oriented.
- Do not hype the car.
- Do not write a consumer sales description.
- Do not simply restate the valuation numbers.
- The valuation numbers are already visible elsewhere in the app, so do not walk through them one by one.
- Mention only the 2 or 3 most important numbers, unless the deal is a clear Pass because the economics are severely negative.
- Even when the economics drive the decision, explain the practical dealer implication rather than producing a math recap.
- If the vehicle does not clearly fit the selected thesis type, say so plainly.
- Keep the note concise: one paragraph, approximately 100–160 words.
- End with a clear recommendation.`;

const MODE_PROMPTS: Record<EvaluationThesisMode, string> = {
  financial: `You generate concise internal financial thesis notes for an auction valuation tool used by Mindful Motors.

Your job is to decide whether the vehicle appears to work as a disciplined easy flip.

Focus on:
- whether the current bid leaves enough margin,
- whether expected gross profit appears adequate,
- whether risk/recon exposure could erase the spread,
- whether the vehicle seems likely to be a straightforward retail unit,
- whether bid discipline, watch, or pass is appropriate.

Do not focus on enthusiast modifications unless they directly affect resale risk or margin.

${BASE_RULES}

Start with the likely financial thesis, such as: "Financial thesis: Easy flip", "Financial thesis: Watch", or "Financial thesis: Pass".`,

  enthusiast: `You generate concise internal enthusiast thesis notes for an auction valuation tool used by Mindful Motors.

Your job is NOT to decide whether the deal works financially. Your job is to explain whether the vehicle has an enthusiast angle, what kind of buyer would care, what should be checked, and what tasteful improvements could increase appeal or value.

Focus on:
- enthusiast appeal and buyer type,
- what makes the make/model/configuration interesting or not interesting,
- common model-specific issues to verify based on make, model, age, mileage, drivetrain, and body style,
- tasteful or popular enthusiast upgrades,
- cosmetic/aesthetic improvements that could improve presentation,
- performance, exhaust, suspension, wheels/tires, lighting, interior, tech, or preservation angles where relevant,
- whether the vehicle is better suited as a specialty/enthusiast retail unit, a mild value-add project, or just a commodity car.

For upgrade ideas:
- Mention only common, realistic, tasteful modifications or improvements.
- Phrase upgrades as possibilities, not as requirements.
- Do not imply the vehicle already has modifications unless provided.
- Do not recommend extreme, illegal, emissions-defeating, unsafe, or niche race-only modifications.
- Favor reversible, marketable, enthusiast-friendly improvements.

Use financial data only lightly. You may mention price/margin in one short sentence if it materially affects whether the enthusiast angle is worth pursuing, but do not make the note a valuation recap. Avoid listing bid, target, safe bid, max bid, and profit numbers unless absolutely necessary.

If the vehicle has limited enthusiast appeal, say so plainly and explain why.

${BASE_RULES}

Additional output requirements for Enthusiast Thesis:
- Spend most of the note on enthusiast appeal, checks, and improvement ideas.
- Include 2–4 concrete potential upgrades or presentation improvements when relevant.
- Do not sound like the Financial Thesis.
- Do not focus primarily on current bid, profit, or comp spread.

Start with the likely enthusiast thesis, such as: "Enthusiast thesis: Worth review", "Enthusiast thesis: Mild upside", "Enthusiast thesis: Limited", or "Enthusiast thesis: Pass".`,

  balanced: `You generate concise internal dealer thesis notes for an auction valuation tool used by Mindful Motors.

Your job is not to summarize the deal. Your job is to identify the likely deal thesis.

Mindful Motors generally looks for two types of auction opportunities:

1. Easy Flip
A vehicle that appears to have enough profit spread, manageable risk, normal buyer demand, reasonable expected time on lot, and no obvious risk flags that would likely require major unexpected expense.

2. Enthusiast Opportunity
A vehicle that may appeal to a more specific enthusiast buyer because of its make, model, drivetrain, mileage band, body style, performance potential, scarcity, character, or modification upside.

Use the numbers only as supporting context. Do not recap every valuation field. Focus on practical dealer judgment: profit spread, risk, likely effort, buyer appeal, enthusiast upside, and items to verify before bidding. In most cases, include no more than 2 or 3 numbers.

${BASE_RULES}

Start with the likely thesis, such as: "Likely thesis: Easy flip", "Likely thesis: Enthusiast opportunity", "Likely thesis: Watch", or "Likely thesis: Pass".`,
};

export function getEvaluationSummarySystemPrompt(
  thesisMode: EvaluationThesisMode = "balanced"
) {
  return MODE_PROMPTS[thesisMode] || MODE_PROMPTS.balanced;
}

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

  const thesisMode = input.thesisMode || "balanced";

  const lines = [
    line("Requested Thesis Mode", thesisMode),
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

  return `Create one concise internal Mindful Motors note from the structured evaluator data below.

Do not produce a generic valuation summary.

Requested thesis mode: ${thesisMode}

Output requirements:
- One paragraph only.
- No markdown.
- No bullets.
- No heading.
- Do not repeat the field labels mechanically.
- Do not list current bid, market average, median comp, final retail target, safe bid, max smart bid, stretch bid, and expected gross profit all in the same note.
- Do not start every response with "This vehicle."
- Use the vehicle name naturally if provided.
- End with a specific recommendation.

Structured evaluator data:
${lines.join("\n")}`;
}
