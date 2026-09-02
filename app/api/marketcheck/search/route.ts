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
  const normalizedModel = normalizeIdentity(body.model);
  const normalizedTrim = normalizeIdentity(body.trim);

  const isMercedes =
    normalizedMake === "mercedes" ||
    normalizedMake === "mercedes benz" ||
    normalizedMake === "mercedesbenz";

  if (!isMercedes) {
    return body;
  }

  const nextBody: Record<string, unknown> = {
    ...body,
    make: "Mercedes-Benz",
  };

  // MarketCheck's active-inventory taxonomy commonly exposes ordinary
  // Mercedes C-Class cars under the actual model variant (C300/C43/C63)
  // rather than the broader class label returned by some VIN decoders.
  // Keep performance variants distinct; only default a generic C-Class to
  // the mainstream C300 retrieval identity when no stronger trim signal exists.
  if (normalizedModel === "c class" || normalizedModel === "cclass") {
    if (/\bc\s*63\b/.test(normalizedTrim) || normalizedTrim.includes("amg c 63")) {
      nextBody.model = "C63";
    } else if (/\bc\s*43\b/.test(normalizedTrim) || normalizedTrim.includes("amg c 43")) {
      nextBody.model = "C43";
    } else if (/\bc\s*300\b/.test(normalizedTrim)) {
      nextBody.model = "C300";
    } else {
      nextBody.model = "C300";
    }
  }

  return nextBody;
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
