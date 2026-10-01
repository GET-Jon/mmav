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


async function ensureCompanyDefaults(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  companyId: string,
  userId: string,
) {
  const { data: existingBilling, error: billingLookupError } = await admin
    .from("company_billing_accounts")
    .select("company_id,status,trial_ends_at")
    .eq("company_id", companyId)
    .maybeSingle();

  if (billingLookupError) throw new Error(billingLookupError.message);

  const billingWrite = existingBilling?.company_id
    ? Promise.resolve({ error: null })
    : admin.from("company_billing_accounts").insert({
        company_id: companyId,
        status: "trialing",
        plan_key: "starter",
        trial_ends_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      });

  const seedResults = await Promise.all([
    billingWrite,
    admin.from("company_entitlements").upsert(
      {
        company_id: companyId,
        plan_key: "starter",
        evaluations_per_month: 20,
        seats_limit: 1,
        auto_dev_enabled: true,
        inventory_enabled: false,
        insights_enabled: true,
        advanced_market_expansion_enabled: true,
      },
      { onConflict: "company_id" },
    ),
    admin.from("company_api_settings").upsert(
      {
        company_id: companyId,
        provider: "marketcheck",
        live_lookup_enabled: true,
        max_api_calls_per_search: 3,
        min_usable_comps_to_stop: 10,
        min_initial_regions: 2,
        created_by: userId,
        updated_by: userId,
      },
      { onConflict: "company_id,provider" },
    ),
  ]);

  const seedError = seedResults.find((result) => result.error)?.error;
  if (seedError) throw new Error(seedError.message);
}

export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();

  const { data: existingMembership, error: membershipLookupError } = await admin
    .from("company_memberships")
    .select("company_id,role,status,company:companies(id,name,slug,status,created_by)")
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

  const companyName =
    typeof user.user_metadata?.company_name === "string"
      ? user.user_metadata.company_name.trim()
      : "";

  const signupSource =
    typeof user.user_metadata?.signup_source === "string"
      ? user.user_metadata.signup_source.trim()
      : "";

  if (existingMembership?.company_id && existingCompany?.id) {
    const isRetryOfPublicSignup =
      signupSource === "public_try_lot_logic" &&
      existingMembership.role === "company_admin" &&
      String(existingCompany.created_by || "") === user.id &&
      Boolean(companyName) &&
      String(existingCompany.name || "").trim().toLowerCase() ===
        companyName.toLowerCase();

    if (signupSource === "public_try_lot_logic" && !isRetryOfPublicSignup) {
      return NextResponse.json(
        {
          error:
            "This account is already linked to an existing company workspace. Public signup will not attach a new signup to an unrelated company. Sign in normally or use a different email for a new workspace.",
        },
        { status: 409 },
      );
    }

    try {
      await ensureCompanyDefaults(admin, String(existingCompany.id), user.id);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Workspace defaults failed." },
        { status: 500 },
      );
    }

    return NextResponse.json({
      company: {
        id: String(existingCompany.id),
        name: String(existingCompany.name || "Company"),
      },
      mode: isRetryOfPublicSignup ? "resumed" : "existing",
    });
  }

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

  try {
    await ensureCompanyDefaults(admin, String(company.id), user.id);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Workspace defaults failed." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    company: {
      id: String(company.id),
      name: String(company.name),
    },
    mode: "created",
  });
}
