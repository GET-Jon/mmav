import { GoogleAiTextClient } from "./providers/google";

export type WorkPlanEstimateRefinementInput = {
  vehicle: {
    year: number;
    make: string;
    model: string;
    trim: string | null;
    mileage: number | null;
  };
  item: {
    title: string;
    description: string | null;
    category: string;
    classification: string;
    decision: string;
    estimatedLaborHours: number | null;
    currentEstimateLow: number | null;
    currentEstimateHigh: number | null;
    currentPlanningAmount: number;
    currentCostSource: string;
    currentCostDetail: string | null;
  };
  partner: {
    name: string | null;
  };
  findings: Array<{
    title: string;
    description: string | null;
    mechanicalValidationStatus: string | null;
    mechanicalValidationNotes: string | null;
    mechanicalRecommendedAction: string | null;
    mechanicalCanPerform: boolean | null;
    mechanicalLaborHours: number | null;
    mechanicalProposedLaborPrice: number | null;
    estimatedCostLow: number | null;
    estimatedCostHigh: number | null;
  }>;
  parts: Array<{
    description: string;
    quantity: number;
    origin: string;
    aiEstimatedUnitPriceLow: number | null;
    aiEstimatedUnitPriceHigh: number | null;
    partnerOfferUnitPrice: number | null;
    fulfillmentMethod: string | null;
    requirementStatus: string;
  }>;
};

export type WorkPlanEstimateRefinement = {
  estimatedCostLow: number;
  estimatedCostHigh: number;
  planningAmount: number;
  confidence: number;
  basis: string;
};

function getClient() {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) throw new Error("Missing Gemini API key. Set GEMINI_API_KEY or GOOGLE_API_KEY.");
  const model = (process.env.AI_MODEL ?? "gemini-3.1-flash-lite")
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/^models\//, "");
  return new GoogleAiTextClient({ apiKey, model });
}

function stripFence(value: string) {
  return value.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

function nonNegative(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(String(value ?? "").replace(/[$,]/g, ""));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export async function refineWorkPlanEstimate(input: WorkPlanEstimateRefinementInput): Promise<WorkPlanEstimateRefinement> {
  const client = getClient();
  const result = await client.generateText({
    system: `You are the pricing analyst inside Lot Logic, a used-vehicle reconditioning platform.
Your task is to refine ONLY the planning estimate for one already-defined Work Plan item. Never alter scope, partner assignment, owner decision, or parts decisions.

Pricing rules:
- Use the exact vehicle, mileage, item scope, mechanical findings, mechanic labor evidence, partner context, and parts evidence supplied.
- Estimate the NEXT AUTHORIZED STEP only. For an investigate/diagnostic item, price the diagnostic or quote-gathering step itself, never the unknown downstream repair.
- mechanicalProposedLaborPrice is first-party labor evidence. It is not automatically a full job quote.
- Partner part prices are stronger evidence than AI part estimates. AI part ranges are planning baselines only.
- Exclude parts marked not_required. Treat in_stock parts as zero new cash outlay unless the supplied evidence indicates otherwise.
- Do not use $0 as the low end for a paid third-party service unless supplied evidence explicitly indicates the service may be free.
- Prefer a narrow, defensible range. For a defined paid service, target high <= 1.5 * low whenever the evidence reasonably permits it.
- If uncertainty genuinely requires a wider range, keep it as narrow as responsibly possible and explain the specific uncertainty in basis.
- Do not fabricate a formal quote, OEM price, local shop rate, or verified market price. You may make a clearly labeled AI planning estimate from common automotive service economics and the supplied scope.
- planningAmount should be the expected/midpoint planning value, not automatically the high end.
- Return confidence from 0 to 1 based on how specifically the supplied evidence supports the estimate.
- basis must be concise and name the main pricing evidence/assumptions.
- Return JSON only.`,
    prompt: `Refine the planning estimate for this exact Work Plan item.\n\n${JSON.stringify(input, null, 2)}\n\nReturn exactly:\n{"estimatedCostLow":125,"estimatedCostHigh":175,"planningAmount":150,"confidence":0.75,"basis":"AI planning estimate based on ..."}`,
    temperature: 0.05,
    maxOutputTokens: 900,
    responseMimeType: "application/json",
  });

  const parsed = JSON.parse(stripFence(result.text)) as Record<string, unknown>;
  const low = nonNegative(parsed.estimatedCostLow);
  const highRaw = nonNegative(parsed.estimatedCostHigh);
  const planningRaw = nonNegative(parsed.planningAmount);
  const confidenceRaw = nonNegative(parsed.confidence);
  const basis = String(parsed.basis || "").trim();
  if (low === null || highRaw === null || planningRaw === null || !basis) {
    throw new Error("Lot Logic could not produce a defensible refined estimate for this item.");
  }
  const high = Math.max(low, highRaw);
  if (high > 0 && low === 0) {
    throw new Error("The refined estimate still had an unsupported $0 low end. More pricing evidence is needed.");
  }
  const planningAmount = Math.min(high, Math.max(low, planningRaw));
  const confidence = Math.min(1, Math.max(0, confidenceRaw ?? 0.5));

  return { estimatedCostLow: low, estimatedCostHigh: high, planningAmount, confidence, basis };
}
