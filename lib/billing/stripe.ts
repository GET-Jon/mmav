import { createHmac, timingSafeEqual } from "node:crypto";
import { currentPreviewBillingIsolation } from "@/lib/billing/preview-isolation";

const STRIPE_API_BASE = "https://api.stripe.com/v1";

function stripeSecretKey() {
  const isolation = currentPreviewBillingIsolation();
  if (!isolation.safe) {
    throw new Error(isolation.reason || "Preview billing is not isolated.");
  }
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("Stripe is not configured.");
  }
  return key;
}

export async function stripePost(
  path: string,
  params: URLSearchParams,
): Promise<Record<string, unknown>> {
  const response = await fetch(`${STRIPE_API_BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${stripeSecretKey()}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
    cache: "no-store",
  });

  const data = (await response.json()) as Record<string, unknown>;

  if (!response.ok) {
    const error = data.error as { message?: string } | undefined;
    throw new Error(error?.message || "Stripe request failed.");
  }

  return data;
}

/** Read-only Stripe API lookup used for scheduled plan changes. */
export async function stripeGet(path: string): Promise<Record<string, unknown>> {
  const response = await fetch(`${STRIPE_API_BASE}${path}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${stripeSecretKey()}` },
    cache: "no-store",
  });
  const data = await response.json() as Record<string, unknown>;
  if (!response.ok) {
    const error = data.error as { message?: string } | undefined;
    throw new Error(error?.message || "Stripe lookup failed.");
  }
  return data;
}

/**
 * Stripe redirect URLs must follow the public application origin, not the
 * internal Netlify server-handler request URL. Netlify can expose a
 * deployment-specific hostname in request.url even on the production site.
 */
export function getBillingSiteUrl(requestUrl?: string) {
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/[/]$/, "");
  const isProduction = supabaseUrl === "https://ymlleqpbpgzydyzwhlqq.supabase.co";
  if (isProduction) return "https://yourlotlogic.com";

  // Previews must remain on the preview host for session-cookie isolation.
  // Netlify may rewrite the incoming request hostname, so prefer the stable
  // DEPLOY_PRIME_URL supplied to the deploy when it is available.
  const candidates = [
    process.env.DEPLOY_PRIME_URL,
    requestUrl,
    process.env.DEPLOY_URL,
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const parsed = new URL(candidate);
      if (parsed.protocol === "https:" &&
          /^deploy-preview-[0-9]+--mmav[.]netlify[.]app$/.test(parsed.hostname)) {
        return parsed.origin;
      }
      if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
        return parsed.origin;
      }
    } catch {
      // Ignore malformed candidate URLs; never pass them to Stripe.
    }
  }

  // Unknown staging/preview configurations must not silently redirect a
  // customer's Stripe session to production or an internal deploy hostname.
  throw new Error("Billing return URL is not configured for this environment.");
}

export function verifyStripeWebhook(
  payload: string,
  signatureHeader: string | null,
) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !signatureHeader) return false;

  const entries = signatureHeader.split(",").map((part) => part.trim());
  const timestamp = entries
    .find((part) => part.startsWith("t="))
    ?.slice(2);
  const signatures = entries
    .filter((part) => part.startsWith("v1="))
    .map((part) => part.slice(3));

  if (!timestamp || signatures.length === 0) return false;

  const ageSeconds = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(ageSeconds) || ageSeconds > 300) return false;

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`, "utf8")
    .digest("hex");

  const expectedBuffer = Buffer.from(expected, "hex");

  return signatures.some((candidate) => {
    try {
      const candidateBuffer = Buffer.from(candidate, "hex");
      return (
        candidateBuffer.length === expectedBuffer.length &&
        timingSafeEqual(candidateBuffer, expectedBuffer)
      );
    } catch {
      return false;
    }
  });
}

export function unixToIso(value: unknown) {
  const seconds = typeof value === "number" ? value : Number(value || 0);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return new Date(seconds * 1000).toISOString();
}

export function stringValue(value: unknown) {
  return typeof value === "string" && value ? value : null;
}
