import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/server-auth";

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "dealer";
}

async function uniqueCompanySlug(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  companyName: string,
) {
  const base = slugify(companyName);

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const { data, error } = await admin
      .from("companies")
      .select("id")
      .eq("slug", candidate)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data?.id) return candidate;
  }

  return `${base}-${Date.now().toString(36)}`;
}

export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();

  const { data: existingMembership, error: membershipLookupError } = await admin
    .from("company_memberships")
    .select("company_id,role,status,company:companies(id,name,slug,status)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (membershipLookupError) {
    return NextResponse.json({ error: membershipLookupError.message }, { status: 500 });
  }

  const existingCompany = Array.isArray(existingMembership?.company)
    ? existingMembership?.company[0]
    : existingMembership?.company;

  if (existingMembership?.company_id && existingCompany?.id) {
    return NextResponse.json({
      company: {
        id: String(existingCompany.id),
        name: String(existingCompany.name || "Company"),
      },
      mode: "existing",
    });
  }

  const companyName =
    typeof user.user_metadata?.company_name === "string"
      ? user.user_metadata.company_name.trim()
      : "";

  if (!companyName) {
    return NextResponse.json(
      { error: "Company name is missing from signup. Please create your account again." },
      { status: 400 },
    );
  }

  const slug = await uniqueCompanySlug(admin, companyName);

  const { data: company, error: companyError } = await admin
    .from("companies")
    .insert({
      name: companyName,
      slug,
      status: "active",
      created_by: user.id,
    })
    .select("id,name,slug")
    .single();

  if (companyError || !company?.id) {
    return NextResponse.json(
      { error: companyError?.message || "Company creation failed." },
      { status: 500 },
    );
  }

  const rollbackCompany = async () => {
    await admin.from("companies").delete().eq("id", company.id);
  };

  const { error: membershipError } = await admin
    .from("company_memberships")
    .insert({
      company_id: company.id,
      user_id: user.id,
      role: "company_admin",
      status: "active",
      created_by: user.id,
    });

  if (membershipError) {
    await rollbackCompany();
    return NextResponse.json({ error: membershipError.message }, { status: 500 });
  }

  const seedResults = await Promise.all([
    admin.from("company_billing_accounts").upsert(
      {
        company_id: company.id,
        status: "not_configured",
        plan_key: "starter",
      },
      { onConflict: "company_id" },
    ),
    admin.from("company_entitlements").upsert(
      {
        company_id: company.id,
        plan_key: "starter",
        evaluations_per_month: null,
        seats_limit: null,
        auto_dev_enabled: true,
        inventory_enabled: true,
        insights_enabled: true,
        advanced_market_expansion_enabled: true,
      },
      { onConflict: "company_id" },
    ),
    admin.from("company_api_settings").upsert(
      {
        company_id: company.id,
        provider: "marketcheck",
        live_lookup_enabled: true,
        max_api_calls_per_search: 3,
        min_usable_comps_to_stop: 10,
        min_initial_regions: 2,
        created_by: user.id,
        updated_by: user.id,
      },
      { onConflict: "company_id,provider" },
    ),
  ]);

  const seedError = seedResults.find((result) => result.error)?.error;
  if (seedError) {
    return NextResponse.json({ error: seedError.message }, { status: 500 });
  }

  return NextResponse.json({
    company: {
      id: String(company.id),
      name: String(company.name),
    },
    mode: "created",
  });
}
