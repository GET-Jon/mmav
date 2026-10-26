import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import { getCurrentCompanyForUser } from "@/lib/supabase/company";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { normalizeDealSources } from "@/lib/deal-source-profiles";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({error:"Unauthorized"}, {status:401});
  try {
    const db = createSupabaseAdminClient();
    const company = await getCurrentCompanyForUser(db, user.id);
    const {data,error} = await db.from("company_assumptions").select("assumptions").eq("company_id",company.companyId).maybeSingle();
    if (error) throw error;
    return NextResponse.json({sources:normalizeDealSources(data?.assumptions?.dealSources),canEdit:company.role==="company_admin"},
      {headers:{"Cache-Control":"private, no-store"}});
  } catch (e) { return NextResponse.json({error:e instanceof Error?e.message:"Unable to load sources"},{status:500}); }
}

export async function POST(request:Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({error:"Unauthorized"},{status:401});
  try {
    const db = createSupabaseAdminClient();
    const company = await getCurrentCompanyForUser(db,user.id);
    if(company.role!=="company_admin") return NextResponse.json({error:"Only dealership administrators can change source defaults"},{status:403});
    const body = await request.json();
    if (!Array.isArray(body?.sources) || body.sources.length > 30) return NextResponse.json({error:"Invalid source list"},{status:400});
    const sources = normalizeDealSources(body.sources);
    if (sources.length !== body.sources.length || sources.length === 0) return NextResponse.json({error:"Provide at least one valid source with unique names"},{status:400});
    const {data,error} = await db.from("company_assumptions").select("assumptions").eq("company_id",company.companyId).maybeSingle();
    if(error) throw error;
    // Preserve existing underwriting settings, including dealership profile.
    const assumptions = {...(data?.assumptions || {}),dealSources:sources};
    const saved = await db.from("company_assumptions").upsert({
      company_id:company.companyId,assumptions,updated_by:user.id,updated_at:new Date().toISOString(),
    },{onConflict:"company_id"});
    if(saved.error) throw saved.error;
    return NextResponse.json({sources});
  } catch(e) {return NextResponse.json({error:e instanceof Error?e.message:"Unable to save sources"},{status:500});}
}
