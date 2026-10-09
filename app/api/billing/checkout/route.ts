import { NextRequest, NextResponse } from "next/server";

import { getBillingSiteUrl, stripePost } from "@/lib/billing/stripe";
import { addCheckoutPrice, isStripePlanConfigured, stripePriceIdForPlan } from "@/lib/billing/checkout-prices";
import { getCurrentCompanyForUser } from "@/lib/supabase/company";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/server-auth";

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const company = await getCurrentCompanyForUser(admin, user.id);

  if (company.role !== "company_admin") {
    return NextResponse.json(
      { error: "Only company administrators can manage billing." },
      { status: 403 },
    );
  }

  let requestedPlan: "starter" | "dealer" | "dealer_pro" = "starter";
  let returnToEvaluator = false;
  try {
    const body = (await request.json()) as { planKey?: string; returnTo?: string };
    returnToEvaluator = body.returnTo === "/evaluate";
    const requested = String(body?.planKey || "starter").trim().toLowerCase();
    if (requested === "dealer" || requested === "dealer_pro") {
      requestedPlan = requested;
    }
  } catch {
    requestedPlan = "starter";
  }

  const priceId = stripePriceIdForPlan(requestedPlan);

  if (!isStripePlanConfigured(requestedPlan)) {
    return NextResponse.json(
      {
        error: `The ${requestedPlan === "dealer_pro" ? "Dealer Pro" : requestedPlan === "dealer" ? "Dealer" : "Starter"} Stripe price is not configured yet.`,
      },
      { status: 503 },
    );
  }

  const { data: billing, error } = await admin
    .from("company_billing_accounts")
    .select("stripe_customer_id,stripe_subscription_id,status")
    .eq("company_id", company.companyId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (
    billing?.stripe_subscription_id &&
    ["trialing", "active", "past_due"].includes(String(billing.status))
  ) {
    return NextResponse.json(
      { error: "This company already has a subscription. Use Manage billing." },
      { status: 409 },
    );
  }

  let customerId =
    typeof billing?.stripe_customer_id === "string"
      ? billing.stripe_customer_id
      : "";

  if (!customerId) {
    const customerParams = new URLSearchParams();
    customerParams.set("email", user.email || "");
    customerParams.set("name", company.companyName);
    customerParams.set("metadata[company_id]", company.companyId);
    customerParams.set("metadata[company_slug]", company.companySlug);

    const customer = await stripePost("/customers", customerParams);
    customerId = String(customer.id || "");

    if (!customerId) {
      return NextResponse.json(
        { error: "Stripe customer creation failed." },
        { status: 502 },
      );
    }

    const { error: updateError } = await admin
      .from("company_billing_accounts")
      .update({
        stripe_customer_id: customerId,
        updated_at: new Date().toISOString(),
      })
      .eq("company_id", company.companyId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }
  }

  const siteUrl = getBillingSiteUrl(request.url);
  const params = new URLSearchParams();
  params.set("mode", "subscription");
  params.set("customer", customerId);
  addCheckoutPrice(params, requestedPlan, priceId);
  params.set("line_items[0][quantity]", "1");
  params.set("allow_promotion_codes", "true");
  params.set("automatic_tax[enabled]", "true");
  params.set("customer_update[address]", "auto");
  params.set("client_reference_id", company.companyId);
  params.set("metadata[company_id]", company.companyId);
  params.set("subscription_data[metadata][company_id]", company.companyId);
  params.set("success_url", returnToEvaluator ? `${siteUrl}/?checkout=success` : `${siteUrl}/settings?tab=billing&checkout=success`);
  params.set("cancel_url", returnToEvaluator ? `${siteUrl}/?checkout=canceled` : `${siteUrl}/settings?tab=billing&checkout=canceled`);
  params.set("metadata[plan_key]", requestedPlan);
  params.set("subscription_data[metadata][plan_key]", requestedPlan);

  const session = await stripePost("/checkout/sessions", params);
  const url = typeof session.url === "string" ? session.url : null;

  if (!url) {
    return NextResponse.json(
      { error: "Stripe checkout session did not return a URL." },
      { status: 502 },
    );
  }

  return NextResponse.json({ url, planKey: requestedPlan });
}
