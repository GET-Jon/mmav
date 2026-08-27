import { GoogleAiTextClient } from "./providers/google";

export type AiPartSearchInput = {
  workOrderId: string;
  workOrderTitle: string;
  partName: string;
  fitmentLabel: string;
};

export type AiPartSearchResult = {
  workOrderId: string;
  partName: string;
  searchQuery: string;
  alternateQueries: string[];
};

function getClient() {
  const apiKey =
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.GOOGLE_AI_API_KEY;

  if (!apiKey) {
    throw new Error("Missing Gemini API key. Set GEMINI_API_KEY or GOOGLE_API_KEY.");
  }

  const model = (process.env.AI_MODEL ?? "gemini-3.1-flash-lite")
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/^models\//, "");

  return new GoogleAiTextClient({ apiKey, model });
}

function stripFence(value: string) {
  return value
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

export async function normalizePartSearchesWithAi(
  items: AiPartSearchInput[],
): Promise<AiPartSearchResult[]> {
  if (!items.length) return [];

  const client = getClient();
  const result = await client.generateText({
    system: `You create concise automotive parts-shopping search phrases for dealership staff.
Turn database/work-order language into phrases a normal person would actually type into Amazon, eBay, or a distributor catalog.

Rules:
- Keep year, make, model, and useful chassis/generation when known.
- Keep trim only when it can affect fitment.
- Keep engine/drivetrain only when relevant to the requested part.
- Remove VIN-decoder/body-class jargon such as "Sport Utility Vehicle [SUV]/Multipurpose Vehicle [MPV]".
- Remove broad workflow/category wording such as cosmetic, mechanical, repair, reconditioning, inspection, or body unless it describes the actual part.
- Infer the likely component need from the work-order wording, but DO NOT invent OEM part numbers or claim verified fitment.
- The primary search should usually be 4-10 useful terms, not a sentence.
- If the work order is ambiguous, provide up to 2 alternate searches that explore plausible component needs.
- If no physical part is reasonably implied, use a practical materials/supplies search or preserve the most useful work phrase without making up a component.
- Return JSON only.`,
    prompt: `Normalize these part-sourcing searches. Preserve each workOrderId exactly.

${JSON.stringify(items, null, 2)}

Return this exact shape:
{"items":[{"workOrderId":"...","partName":"short likely part/material name","searchQuery":"natural primary search","alternateQueries":["optional alternate 1","optional alternate 2"]}]}`,
    temperature: 0.15,
    maxOutputTokens: 1400,
    responseMimeType: "application/json",
  });

  const parsed = JSON.parse(stripFence(result.text)) as { items?: unknown };
  if (!Array.isArray(parsed.items)) throw new Error("AI part search returned an invalid response.");

  const allowedIds = new Set(items.map((item) => item.workOrderId));
  const normalized: AiPartSearchResult[] = [];

  for (const raw of parsed.items) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const workOrderId = String(row.workOrderId || "").trim();
    const partName = String(row.partName || "").trim();
    const searchQuery = String(row.searchQuery || "").trim();
    const alternateQueries = Array.isArray(row.alternateQueries)
      ? row.alternateQueries
          .map((value) => String(value || "").trim())
          .filter(Boolean)
          .filter((value) => value.toLowerCase() !== searchQuery.toLowerCase())
          .slice(0, 2)
      : [];

    if (!allowedIds.has(workOrderId) || !partName || !searchQuery) continue;
    normalized.push({ workOrderId, partName, searchQuery, alternateQueries });
  }

  return normalized;
}
