import { GoogleGenAI } from "@google/genai";
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

    for (let attempt = 0; attempt <= retryDelaysMs.length; attempt += 1) {
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

        if (!text) {
          throw new Error("AI provider returned an empty summary.");
        }

        return {
          text,
          provider: "google",
          model: this.model,
        };
      } catch (error) {
        lastError = error;

        if (!isTransientAiProviderError(error)) {
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

    throw new AiTemporarilyUnavailableError(
      "The AI service is temporarily busy.",
      {
        cause: lastError,
        causeStatus: getAiProviderErrorStatus(lastError),
      },
    );
  }
}
