import { NextResponse } from "next/server";

import { getCurrentCompanyForUser } from "@/lib/supabase/company";
import { getUsageSummary } from "@/lib/billing/usage";
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
          "plan_key,evaluations_per_month,seats_limit,auto_dev_enabled,inventory_enabled,insights_enabled,advanced_market_expansion_enabled",
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

  return NextResponse.json({
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
    checkoutConfigured: Boolean(process.env.STRIPE_SECRET_KEY),
    configuredPlans: {
      starter: Boolean(process.env.STRIPE_SECRET_KEY),
      dealer: Boolean(process.env.STRIPE_SECRET_KEY),
      dealer_pro: Boolean(process.env.STRIPE_SECRET_KEY),
    },
    portalConfigured: Boolean(process.env.STRIPE_SECRET_KEY),
  });
}
