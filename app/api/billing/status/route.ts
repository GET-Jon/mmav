import { NextResponse } from "next/server";

import { getCurrentCompanyForUser } from "@/lib/supabase/company";
import { getUsageSummary } from "@/lib/billing/usage";
import { isStripePlanConfigured } from "@/lib/billing/checkout-prices";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/server-auth";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const company = await getCurrentCompanyForUser(admin, user.id);

  const [{ data: billing, error: billingError }, { data: entitlements, error: entitlementError }, usage] =
    await Promise.all([
      admin
        .from("company_billing_accounts")
        .select(
          "status,plan_key,stripe_customer_id,stripe_subscription_id,stripe_price_id,seats,trial_ends_at,current_period_end,cancel_at_period_end",
        )
        .eq("company_id", company.companyId)
        .maybeSingle(),
      admin
        .from("company_entitlements")
        .select(
          "plan_key,evaluations_per_month,seats_limit,gifted_evaluations,auto_dev_enabled,inventory_enabled,insights_enabled,advanced_market_expansion_enabled",
        )
        .eq("company_id", company.companyId)
        .maybeSingle(),
      getUsageSummary(admin, user.id),
    ]);

  if (billingError) {
    return NextResponse.json({ error: billingError.message }, { status: 500 });
  }
  if (entitlementError) {
    return NextResponse.json({ error: entitlementError.message }, { status: 500 });
  }

  // Keep the trial usable while surfacing a previous unsuccessful checkout.
  // This is derived from Stripe's recorded invoice events, not inferred from
  // trial status, so we don't permanently mark a dealership as delinquent.
  let recentCheckoutPaymentFailed = false;
  if (billing?.status === "trialing" && !billing.stripe_subscription_id) {
    const { data: lastInvoiceEvent, error: invoiceEventError } = await admin
      .from("billing_events")
      .select("event_type")
      .eq("company_id", company.companyId)
      .in("event_type", ["invoice.payment_failed", "invoice.paid"])
      .order("processed_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (invoiceEventError) {
      return NextResponse.json({ error: invoiceEventError.message }, { status: 500 });
    }
    recentCheckoutPaymentFailed = lastInvoiceEvent?.event_type === "invoice.payment_failed";
  }

  return NextResponse.json({
    recentCheckoutPaymentFailed,
    company: {
      id: company.companyId,
      name: company.companyName,
      role: company.role,
    },
    billing: billing || {
      status: "not_configured",
      plan_key: "starter",
    },
    entitlements,
    usage,
    checkoutConfigured:
      isStripePlanConfigured("starter") ||
      isStripePlanConfigured("dealer") ||
      isStripePlanConfigured("dealer_pro"),
    configuredPlans: {
      starter: isStripePlanConfigured("starter"),
      dealer: isStripePlanConfigured("dealer"),
      dealer_pro: isStripePlanConfigured("dealer_pro"),
    },
    portalConfigured: Boolean(process.env.STRIPE_SECRET_KEY),
    stripeSetup: {
      secretKey: Boolean(process.env.STRIPE_SECRET_KEY),
      webhookSecret: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
      starterPrice: isStripePlanConfigured("starter"),
      dealerPrice: isStripePlanConfigured("dealer"),
      dealerProPrice: isStripePlanConfigured("dealer_pro"),
    },
  });
}
