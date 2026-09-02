import { POST as runStrictMarketCheckSearch } from "./strict-search";

function normalizeIdentity(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalizeMercedesSearch(body: Record<string, unknown>) {
  const normalizedMake = normalizeIdentity(body.make);

  const isMercedes =
    normalizedMake === "mercedes" ||
    normalizedMake === "mercedes benz" ||
    normalizedMake === "mercedesbenz";

  if (!isMercedes) {
    return body;
  }

  // Normalize only the manufacturer name here. Keep the evaluator's model
  // identity intact so the strict search layer can apply its existing model
  // aliases without bouncing C-Class -> C300 -> C-Class.
  return {
    ...body,
    make: "Mercedes-Benz",
  };
}

export async function POST(request: Request) {
  const body = (await request.json()) as Record<string, unknown>;
  const normalizedBody = canonicalizeMercedesSearch(body);

  const forwardedRequest = new Request(request.url, {
    method: "POST",
    headers: request.headers,
    body: JSON.stringify(normalizedBody),
  });

  return runStrictMarketCheckSearch(forwardedRequest);
}
