import type { EvaluationSummaryInput, EvaluationThesisMode } from "../types";

const BASE_RULES = `Rules:
- Use only the provided vehicle, evaluator, and Lot Logic Intelligence data.
- Do not invent accident history, title issues, service history, options, trim details, mechanical problems, or condition facts.
- You may mention common model-specific considerations only if phrased as things to verify, inspect, or research, not as confirmed problems.
- Company intelligence may materially influence fit, recon assumptions, risk, and operating advantage when relevant, but historical patterns cannot by themselves establish a defect on this vehicle.
- Give more weight to manager-validated company policy and repeated company outcomes than to sparse or low-confidence learned evidence.
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

Your job is to help a dealer decide whether to bid, pass, or continue watching. Do not simply recap the evaluator. Turn the numbers into a practical deal thesis.

Prioritize:
- whether this is a clear Easy Flip, disciplined Watch, or Pass,
- whether the suggested bid creates enough spread after costs, risk reserve, recon, and target profit,
- whether the market support is strong enough to trust the retail target,
- what specific risk or recon item could change the decision,
- what bid discipline matters most.

Use the current evaluator data as the source of truth. Mention only the most important numbers. In most cases, use no more than 2 or 3 numbers.

Use this structure:
Financial thesis: [Easy flip / Watch / Pass]
- Why it works or does not work.
- Bid discipline: where the user should stay firm.
- Market support: whether comps support the target.
- Risk variable: the main thing to verify before bidding.

Keep it compact, direct, and dealer-oriented. Do not write generic buying advice.`,
  enthusiast: `You generate concise internal enthusiast thesis notes for an auction valuation tool used by Mindful Motors.

Your job is to explain whether the vehicle has a real enthusiast or specialty-retail angle, not just whether the math works. The note should help decide whether the car belongs in Mindful-style inventory.

Prioritize:
- whether the vehicle has a clear enthusiast buyer,
- why the make/model/spec/body style/drivetrain/mileage band matters,
- whether it is a commodity unit or something worth curating,
- model-specific checks that could affect desirability or resale,
- tasteful, reversible, marketable improvements that could increase appeal,
- whether the enthusiast angle is strong enough to justify extra effort.

Use financial data lightly. Mention margin or bid discipline only if it changes whether the enthusiast opportunity is worth pursuing.

Use this structure:
Enthusiast thesis: [Worth review / Mild upside / Limited / Pass]
- Buyer appeal: who would care and why.
- Fit: whether this feels appropriate for Mindful-style inventory.
- Checks: what must be verified before bidding.
- Upside: tasteful improvements or positioning.

If the vehicle has limited enthusiast appeal, say so plainly. Do not force an enthusiast case.`,
  balanced: `You generate concise internal deal thesis notes for an auction valuation tool used by Mindful Motors.

Your job is to combine financial judgment and enthusiast judgment into one practical recommendation.

Do not summarize every field. Identify the likely deal thesis:
- Easy Flip: clean enough, low drama, realistic retail target, acceptable spread.
- Enthusiast Build: interesting enough to justify extra review, curation, or tasteful improvements.
- Watch: possible deal, but bid or risk needs discipline.
- Pass: insufficient spread, weak market support, poor fit, or too much uncertainty.

Prioritize:
- final recommendation,
- why the car fits or does not fit Mindful-style inventory,
- market support and confidence,
- bid discipline,
- recon/risk variables,
- what would change the decision.

Use no more than 2 or 3 numbers unless the math is central to the recommendation.

Use this structure:
Deal thesis: [Easy Flip / Enthusiast Build / Watch / Pass]
- Fit: why this car does or does not belong.
- Money: whether the spread supports the bid.
- Risk: what could break the thesis.
- Decision trigger: what would make it a bid, watch, or pass.

Keep it compact and dealer-oriented.`,
};

export function getEvaluationSummarySystemPrompt(
  thesisMode: EvaluationThesisMode = "balanced"
) {
  const modePrompt =
    MODE_PROMPTS[thesisMode] || MODE_PROMPTS.balanced;

  return `${modePrompt}\n\n${BASE_RULES}`;
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

  const dealerFitReasons = Array.isArray(input.dealerFitReasons)
    ? input.dealerFitReasons.filter(Boolean)
    : [];

  const dealerFitCautions = Array.isArray(input.dealerFitCautions)
    ? input.dealerFitCautions.filter(Boolean)
    : [];

  const mindfulOpportunityTypes = Array.isArray(
    input.mindfulIntelligenceOpportunityTypes,
  )
    ? input.mindfulIntelligenceOpportunityTypes.filter(Boolean)
    : [];

  const mindfulStrengths = Array.isArray(
    input.mindfulIntelligenceStrengths,
  )
    ? input.mindfulIntelligenceStrengths.filter(Boolean)
    : [];

  const mindfulLimitations = Array.isArray(
    input.mindfulIntelligenceLimitations,
  )
    ? input.mindfulIntelligenceLimitations.filter(Boolean)
    : [];

  const mindfulKnownIssues = Array.isArray(
    input.mindfulIntelligenceKnownIssues,
  )
    ? input.mindfulIntelligenceKnownIssues.filter(Boolean)
    : [];

  const mindfulVerificationItems = Array.isArray(
    input.mindfulIntelligenceVerificationItems,
  )
    ? input.mindfulIntelligenceVerificationItems.filter(Boolean)
    : [];

  const lotLogicContext = Array.isArray(input.lotLogicIntelligenceContext)
    ? input.lotLogicIntelligenceContext.filter(Boolean).slice(0, 30)
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
    line("Dealer Fit Score", input.dealerFitScore),
    line("Dealer Fit Label", input.dealerFitLabel),
    line("Dealer Fit Category", input.dealerFitCategory),
    line("Dealer Fit Generation", input.dealerFitGeneration),
    dealerFitReasons.length ? line("Dealer Fit Reasons", dealerFitReasons.join("; ")) : null,
    dealerFitCautions.length ? line("Dealer Fit Cautions", dealerFitCautions.join("; ")) : null,
    line("Mindful Intelligence Match", input.mindfulIntelligenceMatched ? "Yes" : "No"),
    line("Mindful Intelligence Profile", input.mindfulIntelligenceTitle),
    line("Mindful Intelligence Match Level", input.mindfulIntelligenceMatchLevel),
    line("Mindful Intelligence Confidence", input.mindfulIntelligenceConfidence),
    line("Mindful Intelligence Verdict", input.mindfulIntelligenceVerdict),
    line("Mindful Intelligence Rationale", input.mindfulIntelligenceRationale),
    mindfulOpportunityTypes.length ? line("Mindful Intelligence Opportunity Types", mindfulOpportunityTypes.join("; ")) : null,
    mindfulStrengths.length ? line("Mindful Intelligence Strengths", mindfulStrengths.join("; ")) : null,
    mindfulLimitations.length ? line("Mindful Intelligence Limitations", mindfulLimitations.join("; ")) : null,
    mindfulKnownIssues.length ? line("Mindful Intelligence Known Issues", mindfulKnownIssues.join("; ")) : null,
    mindfulVerificationItems.length ? line("Mindful Intelligence Verification Items", mindfulVerificationItems.join("; ")) : null,
    line("Mindful Intelligence Source Section", input.mindfulIntelligenceSourceSection),
    selectedConditionRules.length ? line("Selected Risk / Condition Rules", selectedConditionRules.join("; ")) : null,
    line("Existing Notes", input.notes),
  ].filter(Boolean);

  return `Create one concise internal Mindful Motors note from the structured evaluator data below.

Do not produce a generic valuation summary.

Requested thesis mode: ${thesisMode}

Lot Logic Intelligence instructions:
- The company evidence block below contains explicit policies and learned operational patterns for this specific company.
- Use it when it is relevant to the current vehicle, economics, or recon exposure.
- Do not treat a historical issue relationship as a confirmed defect on this vehicle.
- Prefer manager-validated policy and strong repeated evidence over weak or sparse patterns.
- If company-specific evidence conflicts with a generic operating assumption, prefer the stronger company evidence and explain the practical implication.

Company evidence:
${lotLogicContext.length ? lotLogicContext.map((entry) => `- ${entry}`).join("\n") : "No relevant company-specific evidence is available yet."}

Mindful Intelligence instructions:
- Mindful Intelligence is company-authored internal knowledge and should materially inform the fit analysis when a match is provided.
- Treat the internal verdict, rationale, preferred opportunity types, limitations, and verification items as Mindful Motor Co.'s proprietary perspective.
- Do not describe a known issue as a confirmed defect on this specific vehicle.
- Phrase model concerns as checks, exposures, or conditions that must be verified.
- If the company knowledge conflicts with a generic enthusiast assumption, prioritize the company-authored perspective.
- Clearly connect the internal vehicle knowledge to the current economics and market evidence.
- Do not merely repeat the internal rationale verbatim.

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
