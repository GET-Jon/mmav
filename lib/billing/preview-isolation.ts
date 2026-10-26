/**
 * Fail closed when a Netlify deploy preview is not isolated for Stripe testing.
 * Production Supabase's project ref is public (in client config), not a secret.
 * The check is deliberately confined to preview environments.
 */
const PRODUCTION_SUPABASE_REF = "ymlleqpbpgzydyzwhlqq";

type BillingEnvironment = {
  context?: string;
  deployUrl?: string;
  deployPrimeUrl?: string;
  stripeSecretKey?: string;
  supabaseUrl?: string;
};

export function isDeployPreview(input: BillingEnvironment) {
  const urls = [input.deployUrl || "", input.deployPrimeUrl || ""];
  return input.context === "deploy-preview" ||
    urls.some((url) => /^https?:\/\/deploy-preview-\d+--/i.test(url));
}

export function checkPreviewBillingIsolation(input: BillingEnvironment): {
  safe: boolean;
  reason?: string;
} {
  if (!isDeployPreview(input)) return { safe: true };

  if (!input.stripeSecretKey?.startsWith("sk_test_")) {
    return {
      safe: false,
      reason: "Preview billing is disabled until a Stripe test-mode secret key is configured.",
    };
  }

  const supabaseUrl = input.supabaseUrl || "";
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(supabaseUrl) ||
      supabaseUrl.includes(PRODUCTION_SUPABASE_REF)) {
    return {
      safe: false,
      reason: "Preview billing requires a separate Supabase development project.",
    };
  }

  return { safe: true };
}

export function currentPreviewBillingIsolation() {
  return checkPreviewBillingIsolation({
    context: process.env.CONTEXT,
    deployUrl: process.env.DEPLOY_URL,
    deployPrimeUrl: process.env.DEPLOY_PRIME_URL,
    stripeSecretKey: process.env.STRIPE_SECRET_KEY,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  });
}

export function configuredStripeLiveMode(): boolean | null {
  const key = process.env.STRIPE_SECRET_KEY || "";
  if (key.startsWith("sk_live_")) return true;
  if (key.startsWith("sk_test_")) return false;
  return null;
}
