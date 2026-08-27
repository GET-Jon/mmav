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

/**
 * Read-only phase safety boundary:
 * - This module contains authentication and read diagnostics only.
 * - There are intentionally no quote, order, purchase, or fulfillment methods.
 * - Do not add a generic request helper that can issue arbitrary POST/PUT/PATCH/DELETE calls.
 */
export async function testTurn14Connection(): Promise<Turn14ConnectionDiagnostics> {
  const { clientId, clientSecret } = credentials();

  if (!clientId || !clientSecret) {
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
    // Keep the diagnostic useful without exposing any response body that may contain sensitive data.
  }

  if (!response.ok || !payload.access_token) {
    const detail = payload.error_description || payload.error || `HTTP ${response.status}`;
    return {
      configured: true,
      authenticated: false,
      apiBase: TURN14_API_BASE,
      orderingEnabled: false,
      tokenType: null,
      expiresInSeconds: null,
      message: `Turn 14 authentication failed: ${detail}`,
    };
  }

  const parsedExpiry = Number(payload.expires_in);

  return {
    configured: true,
    authenticated: true,
    apiBase: TURN14_API_BASE,
    orderingEnabled: false,
    tokenType: payload.token_type || "Bearer",
    expiresInSeconds: Number.isFinite(parsedExpiry) ? parsedExpiry : null,
    message: "Turn 14 credentials authenticated successfully. Read-only integration mode is active.",
  };
}
