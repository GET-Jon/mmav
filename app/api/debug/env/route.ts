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
  return NextResponse.json({
    aiProvider: process.env.AI_PROVIDER || null,
    aiModel: process.env.AI_MODEL || null,
    hasGoogleAiKey: Boolean(process.env.GOOGLE_AI_API_KEY),
    googleAiKeyPreview: mask(process.env.GOOGLE_AI_API_KEY),
    hasGoogleApiKeyFallback: Boolean(process.env.GOOGLE_API_KEY),
    nodeEnv: process.env.NODE_ENV || null,
    netlify: Boolean(process.env.NETLIFY),
    context: process.env.CONTEXT || null,
    branch: process.env.BRANCH || null,
    deployUrl: process.env.DEPLOY_URL || null,
  });
}
