import { NextResponse } from "next/server";

export const runtime = "nodejs";

function mask(value: string | undefined) {
  if (!value) {
    return null;
  }

  return {
    length: value.length,
    startsWith: value.slice(0, 6),
    endsWith: value.slice(-4),
  };
}

export async function GET() {
  const selectedGeminiKey =
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.GOOGLE_AI_API_KEY;

  return NextResponse.json({
    aiProvider: process.env.AI_PROVIDER || null,
    aiModel: process.env.AI_MODEL || null,

    hasGeminiApiKey: Boolean(process.env.GEMINI_API_KEY),
    geminiApiKeyPreview: mask(process.env.GEMINI_API_KEY),

    hasGoogleApiKey: Boolean(process.env.GOOGLE_API_KEY),
    googleApiKeyPreview: mask(process.env.GOOGLE_API_KEY),

    hasGoogleAiApiKey: Boolean(process.env.GOOGLE_AI_API_KEY),
    googleAiApiKeyPreview: mask(process.env.GOOGLE_AI_API_KEY),

    selectedGeminiKeyPreview: mask(selectedGeminiKey),

    nodeEnv: process.env.NODE_ENV || null,
    netlify: Boolean(process.env.NETLIFY),
    context: process.env.CONTEXT || null,
    branch: process.env.BRANCH || null,
    deployUrl: process.env.DEPLOY_URL || null,
  });
}
