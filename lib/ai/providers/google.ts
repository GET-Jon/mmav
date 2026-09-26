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

    const retryDelaysMs = [650, 1500];
    let lastError: unknown = null;
    const startedAt = Date.now();
    let attempts = 0;

    for (let attempt = 0; attempt <= retryDelaysMs.length; attempt += 1) {
      attempts = attempt + 1;
      try {
        const response = await ai.models.generateContent({
          model: this.model,
          contents: input.prompt,
          config: {
            systemInstruction: input.system,
            temperature: input.temperature ?? 0.2,
            maxOutputTokens: input.maxOutputTokens ?? 500,
            responseMimeType: input.responseMimeType,
            thinkingConfig: {
              thinkingBudget: 0,
            },
          },
        });

        const text = response.text?.trim();
        const usageMetadata = response.usageMetadata as
          | {
              promptTokenCount?: number;
              candidatesTokenCount?: number;
              totalTokenCount?: number;
              cachedContentTokenCount?: number;
              thoughtsTokenCount?: number;
            }
          | undefined;

        if (!text) {
          throw new Error("AI provider returned an empty summary.");
        }

        await recordApiUsageEvent({
          provider: "google_ai",
          endpoint: "generateContent",
          apiCallsMade: attempts,
          cacheHit: false,
          status: 200,
          stopReason: "AI generation completed.",
          metadata: {
            feature: input.usageFeature || "generate_text",
            model: this.model,
            durationMs: Date.now() - startedAt,
            attempts,
            inputTokens: Number(usageMetadata?.promptTokenCount || 0),
            outputTokens: Number(usageMetadata?.candidatesTokenCount || 0),
            totalTokens: Number(usageMetadata?.totalTokenCount || 0),
            cachedTokens: Number(usageMetadata?.cachedContentTokenCount || 0),
            thoughtsTokens: Number(usageMetadata?.thoughtsTokenCount || 0),
          },
        });

        return {
          text,
          provider: "google",
          model: this.model,
        };
      } catch (error) {
        lastError = error;

        if (!isTransientAiProviderError(error)) {
          await recordApiUsageEvent({
            provider: "google_ai",
            endpoint: "generateContent",
            apiCallsMade: attempts,
            cacheHit: false,
            status: getAiProviderErrorStatus(error) || 500,
            stopReason: error instanceof Error ? error.message : "AI request failed.",
            metadata: {
              feature: input.usageFeature || "generate_text",
              model: this.model,
              durationMs: Date.now() - startedAt,
              attempts,
              failed: true,
            },
          });
          throw error;
        }

        const isLastAttempt = attempt >= retryDelaysMs.length;

        console.warn("[AI] Temporary provider error", {
          model: this.model,
          attempt: attempt + 1,
          maxAttempts: retryDelaysMs.length + 1,
          providerStatus: getAiProviderErrorStatus(error),
          willRetry: !isLastAttempt,
        });

        if (isLastAttempt) {
          break;
        }

        await new Promise((resolve) =>
          setTimeout(resolve, retryDelaysMs[attempt]),
        );
      }
    }

    await recordApiUsageEvent({
      provider: "google_ai",
      endpoint: "generateContent",
      apiCallsMade: attempts,
      cacheHit: false,
      status: getAiProviderErrorStatus(lastError) || 503,
      stopReason: "AI service remained temporarily unavailable after retries.",
      metadata: {
        feature: input.usageFeature || "generate_text",
        model: this.model,
        durationMs: Date.now() - startedAt,
        attempts,
        failed: true,
        retried: attempts > 1,
      },
    });

    throw new AiTemporarilyUnavailableError(
      "The AI service is temporarily busy.",
      {
        cause: lastError,
        causeStatus: getAiProviderErrorStatus(lastError),
      },
    );
  }
}
