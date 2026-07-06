import { buildEvaluationSummaryPrompt, getEvaluationSummarySystemPrompt } from "./prompts/evaluation-summary";
import { GoogleAiTextClient } from "./providers/google";
import type { AiProvider, AiTextClient, EvaluationSummaryInput } from "./types";

function getAiClient(): AiTextClient {
  const provider = (process.env.AI_PROVIDER ?? "google").toLowerCase() as AiProvider;
  const model = process.env.AI_MODEL ?? "gemini-2.5-flash";

  if (provider === "google") {
    const apiKey =
      process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_API_KEY ||
      process.env.GOOGLE_AI_API_KEY;

    if (!apiKey) {
      throw new Error("Missing Gemini API key. Set GEMINI_API_KEY or GOOGLE_API_KEY.");
    }

    return new GoogleAiTextClient({ apiKey, model });
  }

  if (provider === "openai") {
    throw new Error("OpenAI provider is not implemented yet.");
  }

  throw new Error(`Unsupported AI_PROVIDER: ${provider}`);
}

export async function generateEvaluationSummary(input: EvaluationSummaryInput) {
  const client = getAiClient();

  const result = await client.generateText({
    system: getEvaluationSummarySystemPrompt(input.thesisMode || "balanced"),
    prompt: buildEvaluationSummaryPrompt(input),
    temperature: 0.2,
    maxOutputTokens: 500,
  });

  return result.text;
}

export type { EvaluationSummaryInput };
