import type { ConditionAnalysisInput } from "../condition-analysis-types";

export function getConditionAnalysisSystemPrompt() {
  return `You are an internal vehicle-condition and reconditioning analyst for Mindful Motor Co.

Your job is to interpret auction announcements, seller disclosures, condition-report notes, inspection notes, and other vehicle-condition text.

Important rules:
- Use only the supplied vehicle data, issue text, and Lot Logic Intelligence context.
- Do not invent defects, history, warning lights, service history, or missing options.
- Company intelligence can affect estimates, inspection priorities, and risk assumptions when relevant, but it cannot by itself confirm a defect on this vehicle.
- Learned related-issue patterns should normally become an inspection recommendation or explicit assumption unless the current vehicle evidence confirms the related issue.
- Give more weight to manager-validated or repeated company evidence; treat sparse or low-confidence evidence as advisory.
- Distinguish confirmed issues from suspected issues and inspection recommendations.
- Do not treat an inspection recommendation as a confirmed repair.
- Use conservative dealer-oriented estimates in US dollars.
- Return cost ranges when exact pricing is not defensible.
- Account for vehicle year, make, model, trim, mileage, and location only when provided.
- Do not assign a repair cost merely because previous paintwork or unusual paint-meter readings are mentioned. Those may justify an inspection or resale-risk warning instead.
- Avoid double-counting overlapping repairs.
- Individual issue estimates must represent incremental cost.
- The planning estimate should generally fall between the low and high estimates.
- If information is ambiguous, lower confidence and explain the assumption.
- Every issue must preserve a short source excerpt or close paraphrase from the supplied issue text.
- Return valid JSON only.
- Do not use markdown or code fences.`;
}

export function buildConditionAnalysisPrompt(input: ConditionAnalysisInput) {
  const vehicle = input.vehicle;
  const intelligence = Array.isArray(input.lotLogicIntelligenceContext)
    ? input.lotLogicIntelligenceContext.filter(Boolean).slice(0, 30)
    : [];

  return `Analyze the following pre-purchase vehicle-condition information and return one JSON object.

Vehicle:
Year: ${vehicle.year || "Unknown"}
Make: ${vehicle.make || "Unknown"}
Model: ${vehicle.model || "Unknown"}
Trim: ${vehicle.trim || "Unknown"}
Mileage: ${
    typeof vehicle.mileage === "number"
      ? vehicle.mileage.toLocaleString("en-US")
      : "Unknown"
  }
VIN: ${vehicle.vin || "Unknown"}
Location: ${vehicle.location || "Unknown"}
Auction or seller source: ${input.auctionSite || "Unknown"}
Source type: ${input.sourceType || "Unknown"}

Raw condition information:
${input.rawIssueText}

Lot Logic Intelligence context:
${intelligence.length ? intelligence.map((line) => `- ${line}`).join("\n") : "No relevant company-specific evidence is available yet."}

Return exactly this JSON structure:

{
  "summary": "Concise dealer-oriented condition interpretation",
  "overallRisk": "low | moderate | elevated | high",
  "estimatedCostLow": 0,
  "estimatedCostHigh": 0,
  "planningEstimate": 0,
  "estimatedReadyDaysLow": 0,
  "estimatedReadyDaysHigh": 0,
  "issues": [
    {
      "id": "issue-1",
      "description": "Clear normalized issue description",
      "category": "mechanical | cosmetic | wear | history | structural | title | transportation | inspection | other",
      "severity": "minor | moderate | severe",
      "certainty": "confirmed | suspected | inspection_required",
      "estimatedCostLow": 0,
      "estimatedCostHigh": 0,
      "planningEstimate": 0,
      "estimatedDurationDays": 0,
      "includeInValuation": true,
      "assumptions": ["Visible assumption"],
      "confidence": "low | medium | high",
      "sourceText": "Short source excerpt or close paraphrase"
    }
  ],
  "recommendedInspections": ["Inspection recommendation"],
  "missingInformation": ["Missing fact that materially affects cost or risk"],
  "warnings": ["Important uncertainty or non-cost risk"]
}

Calculation rules:
- estimatedCostLow, estimatedCostHigh, and planningEstimate at the top level must reflect the sum of issues where includeInValuation is true.
- Inspection-only issues should normally use zero cost unless a specific diagnostic expense is appropriate.
- Previous paintwork, paint-meter readings, and unverified accident concerns should generally be treated as history or inspection risk rather than automatic repair cost.
- estimatedReadyDaysLow and estimatedReadyDaysHigh should reflect realistic elapsed readiness time, not the sum of every labor-hour estimate.
- If company evidence materially changes an estimate or inspection priority, expose that basis in assumptions or warnings.
- Return no more than 15 issues.
- Return JSON only.`;
}
