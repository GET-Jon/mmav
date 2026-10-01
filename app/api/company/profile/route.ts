import { loadCompanyAssumptions, saveDealershipProfile, validateDealershipProfile } from "@/lib/company/dealership-profile";
import { NextResponse } from "next/server";

import { getCurrentCompanyForUser } from "@/lib/supabase/company";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/server-auth";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  try {
    const admin = createSupabaseAdminClient();
    const company = await getCurrentCompanyForUser(admin, user.id);
    const result = await loadCompanyAssumptions(admin, company.companyId, company.companySlug);
    return NextResponse.json({ company, profile: result.profile }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load profile." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const company = await getCurrentCompanyForUser(admin, user.id);

  if (company.role !== "company_admin") {
    return NextResponse.json(
      { error: "Only company administrators can update organization details." },
      { status: 403 },
    );
  }

  const body = (await request.json()) as { name?: unknown; zip?: unknown; websiteUrl?: unknown };
  const name = String(body.name || "").trim();

  if (name.length < 2 || name.length > 120) {
    return NextResponse.json(
      { error: "Company name must be between 2 and 120 characters." },
      { status: 400 },
    );
  }

  let profile;
  try {
    profile = validateDealershipProfile(body.zip, body.websiteUrl);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid profile." }, { status: 400 });
  }
  try {
    await saveDealershipProfile(admin, company.companyId, user.id, profile, company.companySlug);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save dealership profile." }, { status: 500 });
  }

  const { data, error } = await admin
    .from("companies")
    .update({ name })
    .eq("id", company.companyId)
    .select("id,name")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ company: data, profile });
}
