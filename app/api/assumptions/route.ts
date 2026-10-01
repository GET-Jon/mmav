import { NextResponse } from "next/server";
import { normalizeAssumptions } from "@/lib/assumptions";
import { loadCompanyAssumptions } from "@/lib/company/dealership-profile";
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
    return NextResponse.json({ assumptions: result.assumptions, source: result.source, dealershipProfile: result.profile, needsDealershipZip: company.companySlug !== "mindful-motor-co" && !result.profile.zip }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load dealership settings." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  try {
    const admin = createSupabaseAdminClient();
    const company = await getCurrentCompanyForUser(admin, user.id);
    if (company.role !== "company_admin") return NextResponse.json({ error: "Only company administrators can update evaluator settings." }, { status: 403 });
    const body = await request.json();
    if (!body?.assumptions || typeof body.assumptions !== "object") return NextResponse.json({ error: "Missing assumptions object." }, { status: 400 });
    const existing = await loadCompanyAssumptions(admin, company.companyId, company.companySlug);
    const normalized = normalizeAssumptions(body.assumptions);
    const { data, error } = await admin.from("company_assumptions").upsert({
      company_id: company.companyId,
      assumptions: { ...normalized, dealershipProfile: existing.profile },
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    }, { onConflict: "company_id" }).select("assumptions,updated_at").single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true, setting: { payload: data.assumptions, updated_at: data.updated_at } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to save assumptions." }, { status: 500 });
  }
}
