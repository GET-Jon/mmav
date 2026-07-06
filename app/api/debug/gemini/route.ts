import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

export const runtime = "nodejs";

export async function GET() {
  try {
    const apiKey = process.env.GOOGLE_AI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: "Missing GOOGLE_AI_API_KEY" },
        { status: 500 }
      );
    }

    const ai = new GoogleGenAI({ apiKey });

    const response = await ai.models.generateContent({
      model: process.env.AI_MODEL || "gemini-2.5-flash",
      contents: "Reply with exactly: ok",
      config: {
        temperature: 0,
        maxOutputTokens: 20,
        thinkingConfig: {
          thinkingBudget: 0,
        },
      },
    });

    return NextResponse.json({
      ok: true,
      text: response.text,
      model: process.env.AI_MODEL || "gemini-2.5-flash",
      keyPreview: {
        length: apiKey.length,
        startsWith: apiKey.slice(0, 6),
        endsWith: apiKey.slice(-4),
      },
    });
  } catch (error) {
    console.error("Gemini debug call failed:", error);

    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
        status:
          typeof error === "object" &&
          error !== null &&
          "status" in error
            ? (error as { status?: unknown }).status
            : null,
      },
      { status: 500 }
    );
  }
}
