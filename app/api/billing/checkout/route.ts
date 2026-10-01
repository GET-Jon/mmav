import { NextRequest, NextResponse } from "next/server";

import { getBillingSiteUrl, stripePost } from "@/lib/billing/stripe";
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

  const priceId = process.env.STRIPE_DEFAULT_PRICE_ID;
  if (!process.env.STRIPE_SECRET_KEY || !priceId) {
    return NextResponse.json(
      { error: "Billing checkout is not active yet." },
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
      .upsert(
        {
          company_id: company.companyId,
          stripe_customer_id: customerId,
          status: "not_configured",
          plan_key: "starter",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "company_id" },
      );

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }
  }

  let onboarding = false;
  try {
    const body = (await request.json()) as { source?: string };
    onboarding = body?.source === "onboarding";
  } catch {
    onboarding = false;
  }

  const siteUrl = getBillingSiteUrl(request.url);
  const params = new URLSearchParams();
  params.set("mode", "subscription");
  params.set("customer", customerId);
  params.set("line_items[0][price]", priceId);
  params.set("line_items[0][quantity]", "1");
  params.set("allow_promotion_codes", "true");
  params.set("client_reference_id", company.companyId);
  params.set("metadata[company_id]", company.companyId);
  params.set("subscription_data[metadata][company_id]", company.companyId);
  params.set(
    "success_url",
    onboarding
      ? `${siteUrl}/evaluate?checkout=success`
      : `${siteUrl}/settings?tab=billing&checkout=success`,
  );
  params.set(
    "cancel_url",
    onboarding
      ? `${siteUrl}/onboarding?checkout=canceled`
      : `${siteUrl}/settings?tab=billing&checkout=canceled`,
  );

  const session = await stripePost("/checkout/sessions", params);
  const url = typeof session.url === "string" ? session.url : null;

  if (!url) {
    return NextResponse.json(
      { error: "Stripe checkout session did not return a URL." },
      { status: 502 },
    );
  }

  return NextResponse.json({ url });
}
