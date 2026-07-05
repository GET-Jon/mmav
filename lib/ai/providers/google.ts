import { GoogleGenAI } from "@google/genai";
import type { AiTextClient, GenerateTextInput, GenerateTextResult } from "../types";

export class GoogleAiTextClient implements AiTextClient {
  private readonly apiKey: string;
  private readonly model: string;

  constructor({
    apiKey,
    model,
  }: {
    apiKey: string;
    model: string;
  }) {
    this.apiKey = apiKey;
    this.model = model;
  }

  async generateText(input: GenerateTextInput): Promise<GenerateTextResult> {
    const ai = new GoogleGenAI({ apiKey: this.apiKey });

    const response = await ai.models.generateContent({
      model: this.model,
      contents: input.prompt,
      config: {
        systemInstruction: input.system,
        temperature: input.temperature ?? 0.2,
        maxOutputTokens: input.maxOutputTokens ?? 220,
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
  }
}
