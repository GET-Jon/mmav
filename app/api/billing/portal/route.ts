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

  const { data: billing, error } = await admin
    .from("company_billing_accounts")
    .select("stripe_customer_id")
    .eq("company_id", company.companyId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!billing?.stripe_customer_id || !process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json(
      { error: "Billing portal is not available yet." },
      { status: 404 },
    );
  }

  const params = new URLSearchParams();
  params.set("customer", billing.stripe_customer_id);
  params.set("return_url", `${getBillingSiteUrl(request.url)}/settings?tab=billing`);

  const session = await stripePost("/billing_portal/sessions", params);
  const url = typeof session.url === "string" ? session.url : null;

  if (!url) {
    return NextResponse.json(
      { error: "Stripe billing portal did not return a URL." },
      { status: 502 },
    );
  }

  return NextResponse.json({ url });
}
