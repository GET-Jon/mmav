import { NextResponse } from "next/server";

import { getPlatformAdminAccess } from "@/lib/admin/platform-admin";
import { configuredStripeLiveMode, checkPreviewBillingIsolation } from "@/lib/billing/preview-isolation";

export const dynamic = "force-dynamic";

const PLANS = [
  { key: "starter", env: "STRIPE_STARTER_PRICE_ID", amount: 2900 },
  { key: "dealer", env: "STRIPE_DEALER_PRICE_ID", amount: 7900 },
  { key: "dealer_pro", env: "STRIPE_DEALER_PRO_PRICE_ID", amount: 14900 },
] as const;

/**
 * Administrator-only, read-only Stripe readiness check for production or deploy previews.
 * Never return credentials, Stripe error bodies, account details, or API response headers.
 * This verifies the environment-appropriate API key and catalog. A signed live webhook delivery
 * must still be verified separately; Stripe does not reveal webhook signing secrets via API.
 */
export async function GET() {
  const headers = { "Cache-Control": "private, no-store" };

  // Only authenticated platform administrators can use the diagnostic.
  const access = await getPlatformAdminAccess();
  if (!access) {
    return NextResponse.json({ error: "Not found." }, { status: 404, headers });
  }

  // Netlify's Next.js server handler may rewrite the request host, and CONTEXT
  // is not guaranteed in runtime. Use the configured Supabase project to
  // establish which billing environment this function actually serves.
  // A mismatched Stripe key is reported as a failed check, never assumed live.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const productionSupabaseUrl = "https://ymlleqpbpgzydyzwhlqq.supabase.co";
  const isProduction = supabaseUrl.replace(/[/]$/, "") === productionSupabaseUrl;
  const isIsolatedPreview = !isProduction && checkPreviewBillingIsolation({
    context: "deploy-preview",
    stripeSecretKey: process.env.STRIPE_SECRET_KEY,
    supabaseUrl,
  }).safe;
  if (!isProduction && !isIsolatedPreview) {
    return NextResponse.json({ error: "Billing environment is not safely configured." }, { status: 503, headers });
  }
  const context = isProduction ? "production" : "deploy-preview";

  const mode = configuredStripeLiveMode();
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const expectedLiveMode = context === "production";
  const keyModeCorrect = mode === expectedLiveMode;
  const plans = await Promise.all(PLANS.map(async (plan) => {
    const id = process.env[plan.env];
    if (!id || !id.startsWith("price_") || !secretKey || !keyModeCorrect) {
      return { plan: plan.key, configured: Boolean(id), verified: false };
    }

    try {
      const response = await fetch(
        `https://api.stripe.com/v1/prices/${encodeURIComponent(id)}`,
        {
          method: "GET",
          headers: { Authorization: `Bearer ${secretKey}` },
          cache: "no-store",
          signal: AbortSignal.timeout(8000),
        },
      );
      if (!response.ok) {
        return { plan: plan.key, configured: true, verified: false };
      }
      const price = await response.json() as {
        id?: string;
        livemode?: boolean;
        active?: boolean;
        currency?: string;
        unit_amount?: number;
        recurring?: { interval?: string; interval_count?: number };
      };
      return {
        plan: plan.key,
        configured: true,
        verified: price.id === id &&
          price.livemode === expectedLiveMode &&
          price.active === true &&
          price.currency === "usd" &&
          price.unit_amount === plan.amount &&
          price.recurring?.interval === "month" &&
          price.recurring?.interval_count === 1,
      };
    } catch {
      return { plan: plan.key, configured: true, verified: false };
    }
  }));

  return NextResponse.json({
    environment: context,
    keyModeCorrect,
    webhookSecretConfigured: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
    stripePrices: plans,
    passed: keyModeCorrect && plans.every((plan) => plan.verified),
    note: "Webhook signature validation still requires a real Stripe event delivery.",
  }, { headers });
}
