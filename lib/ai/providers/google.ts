import { GoogleGenAI } from "@google/genai";
import { recordApiUsageEvent } from "@/lib/observability/api-usage";
import {
  AiTemporarilyUnavailableError,
  getAiProviderErrorStatus,
  isTransientAiProviderError,
} from "../errors";
import type {
  AiTextClient,
  GenerateTextInput,
  GenerateTextResult,
} from "../types";

export class GoogleAiTextClient implements AiTextClient {
  private readonly apiKey: string;
  private readonly model: string;

  constructor({ apiKey, model }: { apiKey: string; model: string }) {
    this.apiKey = apiKey;
    this.model = model;
  }

  async generateText(input: GenerateTextInput): Promise<GenerateTextResult> {
    console.info("[AI] Generating with model:", JSON.stringify(this.model));

    const ai = new GoogleGenAI({ apiKey: this.apiKey });

    // Keep fallback limited to condition recon, rather than silently changing
    // model behavior for verdict summaries and other AI features.
    const fallbackModel = input.usageFeature === "condition_analysis"
      ? (process.env.AI_RECON_FALLBACK_MODEL || "gemini-3.5-flash-lite")
          .trim().replace(/^["']|["']$/g, "").replace(/^models\//, "")
      : "";
    const models = fallbackModel && fallbackModel !== this.model
      ? [this.model, fallbackModel]
      : [this.model];
    const retryDelaysMs = [650, 1500];
    const startedAt = Date.now();
    let attempts = 0;
    let lastError: unknown = null;

    for (const [modelIndex, model] of models.entries()) {
      // Retry only transient provider errors. On a fallback model, one retry
      // limits latency and the chance of an extended request storm.
      const delays = modelIndex === 0 ? retryDelaysMs : [650];
      for (let attempt = 0; attempt <= delays.length; attempt += 1) {
        attempts += 1;
        try {
          const response = await ai.models.generateContent({
            model,
            contents: input.prompt,
            config: {
              systemInstruction: input.system,
              temperature: input.temperature ?? 0.2,
              maxOutputTokens: input.maxOutputTokens ?? 500,
              responseMimeType: input.responseMimeType,
              thinkingConfig: { thinkingBudget: 0 },
            },
          });
          const text = response.text?.trim();
          if (!text) throw new Error("AI provider returned an empty summary.");

          const usageMetadata = response.usageMetadata;
          await recordApiUsageEvent({
            provider: "google_ai",
            endpoint: "generateContent",
            apiCallsMade: attempts,
            cacheHit: false,
            status: 200,
            stopReason: modelIndex ? "AI generation completed using fallback model." : "AI generation completed.",
            metadata: {
              feature: input.usageFeature || "generate_text",
              model,
              primaryModel: this.model,
              usedFallback: modelIndex > 0,
              durationMs: Date.now() - startedAt,
              attempts,
              inputTokens: Number(usageMetadata?.promptTokenCount || 0),
              outputTokens: Number(usageMetadata?.candidatesTokenCount || 0),
              totalTokens: Number(usageMetadata?.totalTokenCount || 0),
              cachedTokens: Number(usageMetadata?.cachedContentTokenCount || 0),
              thoughtsTokens: Number(usageMetadata?.thoughtsTokenCount || 0),
            },
          });
          return { text, provider: "google", model };
        } catch (error) {
          lastError = error;
          const transient = isTransientAiProviderError(error);
          const lastAttempt = attempt === delays.length;
          console.warn("[AI] Provider request failed", {
            model, attempt: attempt + 1, providerStatus: getAiProviderErrorStatus(error),
            transient, willRetry: transient && !lastAttempt,
            willFallback: transient && lastAttempt && modelIndex + 1 < models.length,
          });
          if (!transient) {
            // A malformed request or invalid key is not provider congestion,
            // and changing models would only obscure the underlying problem.
            await recordApiUsageEvent({
              provider: "google_ai", endpoint: "generateContent",
              apiCallsMade: attempts, cacheHit: false,
              status: getAiProviderErrorStatus(error) || 500,
              stopReason: "Non-retryable AI provider error.",
              metadata: { feature: input.usageFeature || "generate_text",
                model, durationMs: Date.now() - startedAt, attempts, failed: true },
            });
            throw error;
          }
          if (lastAttempt) break;
          await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
        }
      }
    }

    await recordApiUsageEvent({
      provider: "google_ai", endpoint: "generateContent",
      apiCallsMade: attempts, cacheHit: false,
      status: getAiProviderErrorStatus(lastError) || 503,
      stopReason: "Primary and fallback AI models unavailable after bounded retries.",
      metadata: {
        feature: input.usageFeature || "generate_text",
        model: this.model, fallbackModel: models[1] || null,
        durationMs: Date.now() - startedAt,
        attempts, failed: true, retried: attempts > 1,
      },
    });

    throw new AiTemporarilyUnavailableError("The AI service is temporarily busy.", {
      cause: lastError,
      causeStatus: getAiProviderErrorStatus(lastError),
    });
  }
}
