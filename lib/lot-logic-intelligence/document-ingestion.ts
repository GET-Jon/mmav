import { GoogleGenAI } from "@google/genai";

import {
  AiTemporarilyUnavailableError,
  getAiProviderErrorStatus,
  isTransientAiProviderError,
} from "@/lib/ai/errors";
import { normalizeIntelligenceKey } from "@/lib/lot-logic-intelligence/service";

const VALID_ASSERTION_TYPES = new Set([
  "capability",
  "preference",
  "policy",
  "cost_pattern",
  "duration_pattern",
  "partner_pattern",
  "vehicle_pattern",
  "process_pattern",
  "issue_pattern",
  "other",
]);

const TEXT_MIME_TYPES = new Set([
  "text/plain",
  "text/markdown",
  "text/csv",
  "text/rtf",
  "text/html",
  "text/xml",
  "application/json",
  "application/rtf",
]);

export type ExtractedDealershipAssertion = {
  assertionType: string;
  subjectType: string;
  subjectKey: string;
  predicate: string;
  value: string;
  evidence: string;
};

export type DealershipDocumentExtraction = {
  summary: string;
  assertions: ExtractedDealershipAssertion[];
  extractedText: string;
  model: string;
};

function cleanModelName() {
  return (process.env.AI_MODEL ?? "gemini-3.1-flash-lite")
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/^models\//, "");
}

function getApiKey() {
  return (
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.GOOGLE_AI_API_KEY ||
    ""
  );
}

function stripCodeFence(value: string) {
  return value
    .trim()
    .replace(/^\`\`\`(?:json)?\s*/i, "")
    .replace(/\s*\`\`\`$/, "")
    .trim();
}

function sanitizeAssertion(value: unknown): ExtractedDealershipAssertion | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const row = value as Record<string, unknown>;
  const assertionType = String(row.assertionType || "other").trim().toLowerCase();
  const subjectType = String(row.subjectType || "company").trim().toLowerCase();
  const subjectKeyRaw = String(row.subjectKey || "company").trim();
  const predicate = String(row.predicate || "").trim().slice(0, 240);
  const assertionValue = String(row.value || "").trim().slice(0, 4000);
  const evidence = String(row.evidence || "").trim().slice(0, 1000);

  if (!predicate || !assertionValue) return null;

  return {
    assertionType: VALID_ASSERTION_TYPES.has(assertionType)
      ? assertionType
      : "other",
    subjectType: subjectType || "company",
    subjectKey: normalizeIntelligenceKey(subjectKeyRaw || "company") || "company",
    predicate,
    value: assertionValue,
    evidence,
  };
}

function textFromBytes(bytes: Uint8Array) {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes).trim();
}

function buildPrompt(title: string, text?: string) {
  return [
    "You are extracting explicit dealership knowledge for Lot Logic.",
    "Treat the uploaded document as the sole source of truth.",
    "Do not add general automotive knowledge, infer unstated preferences, or reconcile contradictions.",
    "Extract only statements the document actually supports about the dealership, its buying preferences, customers, operating capabilities, policies, risk tolerance, recon capabilities, inventory strategy, price/mileage/age preferences, brands/models, sourcing, hold-time expectations, or other facts that should influence vehicle-acquisition recommendations.",
    "",
    "Return JSON only with this shape:",
    JSON.stringify({
      summary: "2-5 sentence factual summary of the document",
      assertions: [
        {
          assertionType:
            "preference | capability | policy | cost_pattern | duration_pattern | vehicle_pattern | process_pattern | other",
          subjectType:
            "company | make | model | vehicle_family | customer | inventory | recon | process | other",
          subjectKey:
            "company, a make/model name, or a concise subject identifier",
          predicate: "short description of what is true",
          value: "the explicit dealership fact or preference",
          evidence: "short supporting excerpt or close paraphrase from the document",
        },
      ],
    }),
    "",
    "Rules:",
    "- Prefer a small set of high-value, non-duplicative assertions over dozens of tiny fragments.",
    "- Preserve meaningful qualifiers, thresholds, exceptions, prices, mileage bands, and time horizons.",
    "- Performance/enthusiast preferences should not be generalized to unrelated vehicles.",
    "- If the document is ambiguous, omit the assertion rather than guessing.",
    "- Maximum 30 assertions.",
    "",
    `Document title: ${title}`,
    text ? `\nDocument text:\n${text.slice(0, 80_000)}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

async function generateExtraction({
  title,
  mimeType,
  bytes,
  inlineText,
}: {
  title: string;
  mimeType: string;
  bytes: Uint8Array;
  inlineText?: string;
}) {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("AI document extraction is not configured.");
  }

  const model = cleanModelName();
  const ai = new GoogleGenAI({ apiKey });
  const prompt = buildPrompt(title, inlineText);
  const retryDelaysMs = [650, 1500];
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= retryDelaysMs.length; attempt += 1) {
    try {
      const contents =
        mimeType === "application/pdf"
          ? [
              {
                role: "user",
                parts: [
                  { text: prompt },
                  {
                    inlineData: {
                      mimeType,
                      data: Buffer.from(bytes).toString("base64"),
                    },
                  },
                ],
              },
            ]
          : prompt;

      const response = await ai.models.generateContent({
        model,
        contents,
        config: {
          temperature: 0.1,
          maxOutputTokens: 5000,
          responseMimeType: "application/json",
          thinkingConfig: { thinkingBudget: 0 },
        },
      });

      const raw = response.text?.trim();
      if (!raw) throw new Error("AI document extraction returned no content.");

      return { raw, model };
    } catch (error) {
      lastError = error;
      if (!isTransientAiProviderError(error)) throw error;

      const isLastAttempt = attempt >= retryDelaysMs.length;
      if (isLastAttempt) break;

      await new Promise((resolve) =>
        setTimeout(resolve, retryDelaysMs[attempt]),
      );
    }
  }

  throw new AiTemporarilyUnavailableError(
    "Document analysis is temporarily busy.",
    {
      cause: lastError,
      causeStatus: getAiProviderErrorStatus(lastError),
    },
  );
}

export function supportedDealershipKnowledgeMimeType(
  filename: string,
  suppliedMimeType: string,
) {
  const mimeType = String(suppliedMimeType || "").toLowerCase().trim();
  const extension = filename.toLowerCase().split(".").pop() || "";

  if (mimeType === "application/pdf" || extension === "pdf") {
    return "application/pdf";
  }

  const extensionToMime: Record<string, string> = {
    txt: "text/plain",
    md: "text/markdown",
    markdown: "text/markdown",
    csv: "text/csv",
    rtf: "text/rtf",
    json: "application/json",
  };

  const normalized = TEXT_MIME_TYPES.has(mimeType)
    ? mimeType
    : extensionToMime[extension];

  return normalized || null;
}

export async function extractDealershipDocumentKnowledge({
  title,
  filename,
  mimeType,
  bytes,
}: {
  title: string;
  filename: string;
  mimeType: string;
  bytes: Uint8Array;
}): Promise<DealershipDocumentExtraction> {
  const normalizedMime = supportedDealershipKnowledgeMimeType(
    filename,
    mimeType,
  );

  if (!normalizedMime) {
    throw new Error(
      "Unsupported file type. Upload a PDF, TXT, Markdown, CSV, RTF, or JSON file. For Word documents, export or save the file as PDF first.",
    );
  }

  const inlineText =
    normalizedMime === "application/pdf" ? undefined : textFromBytes(bytes);

  if (inlineText !== undefined && !inlineText) {
    throw new Error("The uploaded document does not contain readable text.");
  }

  const { raw, model } = await generateExtraction({
    title,
    mimeType: normalizedMime,
    bytes,
    inlineText,
  });

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(stripCodeFence(raw)) as Record<string, unknown>;
  } catch {
    throw new Error("Lot Logic could not interpret the document extraction.");
  }

  const summary = String(parsed.summary || "").trim().slice(0, 8000);
  const assertions = Array.isArray(parsed.assertions)
    ? parsed.assertions
        .map(sanitizeAssertion)
        .filter(
          (value): value is ExtractedDealershipAssertion => Boolean(value),
        )
        .slice(0, 30)
    : [];

  if (!summary && !assertions.length) {
    throw new Error(
      "Lot Logic did not find explicit dealership knowledge in this document.",
    );
  }

  const extractedText = [
    summary,
    ...assertions.map(
      (assertion) =>
        `${assertion.subjectKey}: ${assertion.predicate} = ${assertion.value}`,
    ),
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 50_000);

  return {
    summary,
    assertions,
    extractedText,
    model,
  };
}
