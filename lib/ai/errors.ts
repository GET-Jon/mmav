export class AiTemporarilyUnavailableError extends Error {
  readonly code = "AI_TEMPORARILY_UNAVAILABLE";
  readonly status = 503;
  readonly causeStatus: number | null;

  constructor(
    message = "The AI service is temporarily busy.",
    options?: { cause?: unknown; causeStatus?: number | null },
  ) {
    super(message, options?.cause ? { cause: options.cause } : undefined);
    this.name = "AiTemporarilyUnavailableError";
    this.causeStatus = options?.causeStatus ?? null;
  }
}

function statusFromUnknown(error: unknown) {
  if (!error || typeof error !== "object") return null;

  const candidate = error as Record<string, unknown>;
  const direct = Number(candidate.status ?? candidate.statusCode ?? candidate.code);
  if (Number.isFinite(direct) && direct >= 100 && direct <= 599) {
    return direct;
  }

  const nestedError =
    candidate.error && typeof candidate.error === "object"
      ? (candidate.error as Record<string, unknown>)
      : null;
  const nested = Number(
    nestedError?.status ?? nestedError?.statusCode ?? nestedError?.code,
  );
  if (Number.isFinite(nested) && nested >= 100 && nested <= 599) {
    return nested;
  }

  return null;
}

function messageFromUnknown(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;

  try {
    return JSON.stringify(error);
  } catch {
    return "";
  }
}

export function getAiProviderErrorStatus(error: unknown) {
  const structuredStatus = statusFromUnknown(error);
  if (structuredStatus) return structuredStatus;

  const message = messageFromUnknown(error);
  const jsonStatus = message.match(/["']?code["']?\s*:\s*(429|500|502|503|504)/i);
  if (jsonStatus) return Number(jsonStatus[1]);

  const httpStatus = message.match(/\b(429|500|502|503|504)\b/);
  return httpStatus ? Number(httpStatus[1]) : null;
}

export function isTransientAiProviderError(error: unknown) {
  const status = getAiProviderErrorStatus(error);
  if (status && [429, 500, 502, 503, 504].includes(status)) {
    return true;
  }

  const message = messageFromUnknown(error).toLowerCase();
  return (
    message.includes("unavailable") ||
    message.includes("high demand") ||
    message.includes("temporarily") ||
    message.includes("rate limit") ||
    message.includes("resource exhausted") ||
    message.includes("overloaded")
  );
}
