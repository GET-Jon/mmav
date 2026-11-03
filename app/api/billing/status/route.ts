import { NextResponse } from "next/server";

import { getCurrentCompanyForUser } from "@/lib/supabase/company";
import { getUsageSummary } from "@/lib/billing/usage";
import { isStripePlanConfigured, stripePriceIdForPlan, type BillingPlanKey } from "@/lib/billing/checkout-prices";
import { stripeGet } from "@/lib/billing/stripe";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/server-auth";

type StripeRecord = Record<string, unknown>;
function object(value: unknown): StripeRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as StripeRecord : {};
}
function stripeId(value: unknown): string | null {
  if (typeof value === "string") return value;
  const id = object(value).id;
  return typeof id === "string" ? id : null;
}

type ScheduledPlanChange = { planKey: BillingPlanKey; effectiveAt: string };

/** Stripe's portal attaches a subscription schedule for end-of-period downgrades.
 * Read the future phase, not stale subscription metadata, so the UI reflects
 * changes made or undone directly in Stripe.
 */
async function scheduledPlanChange(subscriptionId: string, currentPlan: string): Promise<ScheduledPlanChange | null> {
  if (!/^sub_[A-Za-z0-9]+$/.test(subscriptionId)) return null;
  const subscription = await stripeGet(`/subscriptions/${subscriptionId}`);
  const scheduleId = stripeId(subscription.schedule);
  if (!scheduleId || !/^sub_sched_[A-Za-z0-9]+$/.test(scheduleId)) return null;
  const schedule = await stripeGet(`/subscription_schedules/${scheduleId}`);
  if (schedule.status !== "active") return null;
  const phases = Array.isArray(schedule.phases) ? schedule.phases : [];
  const nowSeconds = Date.now() / 1000;
  const futurePhases = phases.map(object).filter(phase =>
    typeof phase.start_date === "number" && phase.start_date > nowSeconds
  ).sort((a, b) => Number(a.start_date) - Number(b.start_date));
  const next = futurePhases[0];
  if (!next) return null;
  const items = Array.isArray(next.items) ? next.items : [];
  const priceId = stripeId(object(items[0]).price);
  if (!priceId) return null;
  const keys: BillingPlanKey[] = ["starter", "dealer", "dealer_pro"];
  const nextPlan = keys.find(key => stripePriceIdForPlan(key) === priceId);
  if (!nextPlan || nextPlan === currentPlan) return null;
  return { planKey: nextPlan, effectiveAt: new Date(Number(next.start_date) * 1000).toISOString() };
}

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

  // A missing Stripe schedule never blocks billing status or existing access.
  // The active plan still comes from subscription webhooks.
  let pendingPlanChange: ScheduledPlanChange | null = null;
  if (billing?.status === "active" && billing.stripe_subscription_id && !billing.cancel_at_period_end) {
    try {
      pendingPlanChange = await scheduledPlanChange(String(billing.stripe_subscription_id), String(billing.plan_key || ""));
    } catch (error) {
      console.warn("Unable to fetch scheduled Stripe plan change", error instanceof Error ? error.message : "unknown error");
    }
  }

  return NextResponse.json({
    pendingPlanChange,
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
