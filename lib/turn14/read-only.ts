const TURN14_API_BASE = "https://api.turn14.com/v1";
const TURN14_TOKEN_URL = `${TURN14_API_BASE}/token`;

export type Turn14ConnectionDiagnostics = {
  configured: boolean;
  authenticated: boolean;
  apiBase: string;
  orderingEnabled: false;
  tokenType: string | null;
  expiresInSeconds: number | null;
  message: string;
};

export type Turn14CatalogProbe = {
  ok: boolean;
  endpoint: string;
  status: number;
  query: string;
  itemId: string | null;
  resultCount: number | null;
  data: unknown;
  message: string;
};

type Turn14TokenResponse = {
  access_token?: string;
  token_type?: string;
  expires_in?: number | string;
  error?: string;
  error_description?: string;
};

function credentials() {
  const clientId = process.env.TURN14_CLIENT_ID?.trim();
  const clientSecret = process.env.TURN14_CLIENT_SECRET?.trim();
  return { clientId, clientSecret };
}

export function isTurn14Configured() {
  const { clientId, clientSecret } = credentials();
  return Boolean(clientId && clientSecret);
}

async function getTurn14AccessToken() {
  const { clientId, clientSecret } = credentials();
  if (!clientId || !clientSecret) {
    throw new Error("TURN14_CLIENT_ID and TURN14_CLIENT_SECRET are not available to this deployment.");
  }

  const response = await fetch(TURN14_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
    cache: "no-store",
  });

  let payload: Turn14TokenResponse = {};
  try {
    payload = (await response.json()) as Turn14TokenResponse;
  } catch {
    // Never expose raw auth responses.
  }

  if (!response.ok || !payload.access_token) {
    const detail = payload.error_description || payload.error || `HTTP ${response.status}`;
    throw new Error(`Turn 14 authentication failed: ${detail}`);
  }

  return {
    accessToken: payload.access_token,
    tokenType: payload.token_type || "Bearer",
    expiresInSeconds: Number(payload.expires_in) || null,
  };
}

/**
 * Read-only phase safety boundary:
 * - OAuth token exchange is the only POST request in this module.
 * - Catalog and inventory probes use GET only.
 * - There are intentionally no quote, order, purchase, checkout, or fulfillment methods.
 * - There is intentionally no generic arbitrary-request helper.
 */
export async function testTurn14Connection(): Promise<Turn14ConnectionDiagnostics> {
  if (!isTurn14Configured()) {
    return {
      configured: false,
      authenticated: false,
      apiBase: TURN14_API_BASE,
      orderingEnabled: false,
      tokenType: null,
      expiresInSeconds: null,
      message: "TURN14_CLIENT_ID and TURN14_CLIENT_SECRET are not available to this deployment.",
    };
  }

  try {
    const token = await getTurn14AccessToken();
    return {
      configured: true,
      authenticated: true,
      apiBase: TURN14_API_BASE,
      orderingEnabled: false,
      tokenType: token.tokenType,
      expiresInSeconds: token.expiresInSeconds,
      message: "Turn 14 credentials authenticated successfully. Read-only integration mode is active.",
    };
  } catch (error) {
    return {
      configured: true,
      authenticated: false,
      apiBase: TURN14_API_BASE,
      orderingEnabled: false,
      tokenType: null,
      expiresInSeconds: null,
      message: error instanceof Error ? error.message : "Turn 14 authentication failed.",
    };
  }
}

function safeJsonPreview(value: unknown, depth = 0): unknown {
  if (depth > 5) return "[nested data omitted]";
  if (Array.isArray(value)) return value.slice(0, 8).map((item) => safeJsonPreview(item, depth + 1));
  if (!value || typeof value !== "object") return value;

  const record = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(record).slice(0, 30)) {
    if (/token|secret|credential|authorization/i.test(key)) continue;
    output[key] = safeJsonPreview(child, depth + 1);
  }
  return output;
}

function inferredCount(payload: unknown) {
  if (Array.isArray(payload)) return payload.length;
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  if (Array.isArray(record.data)) return record.data.length;
  if (Array.isArray(record.items)) return record.items.length;
  return null;
}

export async function probeTurn14Catalog(query: string): Promise<Turn14CatalogProbe> {
  const cleaned = query.trim().slice(0, 160);
  if (!cleaned) throw new Error("Enter a catalog search phrase.");

  const token = await getTurn14AccessToken();
  const url = new URL(`${TURN14_API_BASE}/items`);
  url.searchParams.set("search", cleaned);

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `${token.tokenType} ${token.accessToken}`,
    },
    cache: "no-store",
  });

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = { note: "Turn 14 returned a non-JSON response." };
  }

  return {
    ok: response.ok,
    endpoint: "/items?search=…",
    status: response.status,
    query: cleaned,
    itemId: null,
    resultCount: inferredCount(payload),
    data: safeJsonPreview(payload),
    message: response.ok
      ? "Catalog GET succeeded. Review the response shape below before we wire product fields into Parts sourcing."
      : `Catalog GET returned HTTP ${response.status}. This is still useful for confirming the exact Turn 14 query contract without issuing any write request.`,
  };
}

export async function probeTurn14Inventory(itemId: string): Promise<Turn14CatalogProbe> {
  const cleaned = itemId.trim().replace(/[^A-Za-z0-9_-]/g, "").slice(0, 80);
  if (!cleaned) throw new Error("Enter a Turn 14 item ID.");

  const token = await getTurn14AccessToken();
  const endpoint = `/inventory/${cleaned}`;
  const response = await fetch(`${TURN14_API_BASE}${endpoint}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `${token.tokenType} ${token.accessToken}`,
    },
    cache: "no-store",
  });

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = { note: "Turn 14 returned a non-JSON response." };
  }

  return {
    ok: response.ok,
    endpoint,
    status: response.status,
    query: "",
    itemId: cleaned,
    resultCount: inferredCount(payload),
    data: safeJsonPreview(payload),
    message: response.ok
      ? "Inventory GET succeeded for this item ID."
      : `Inventory GET returned HTTP ${response.status}.`,
  };
}
