import { redirect } from "next/navigation";

import {
  InsightsDashboard,
  type InsightEvaluation,
} from "@/components/insights/insights-dashboard";
import { AppTopNav } from "@/components/navigation/app-top-nav";
import { getCurrentCompanyForUser } from "@/lib/supabase/company";
import {
  createSupabaseServerAuthClient,
  getCurrentUser,
} from "@/lib/supabase/server-auth";

export const dynamic = "force-dynamic";

type CompanyMemberRpcRow = {
  user_id: string;
  display_name: string | null;
  email: string | null;
};

function compactUserLabelFromEmail(email?: string | null) {
  const clean = String(email || "").trim();
  if (!clean) return "Unknown";

  const beforeAt = clean.includes("@") ? clean.split("@")[0] : clean;
  const firstPart = beforeAt.split(/[._\-\s]+/).filter(Boolean)[0] || beforeAt;
  if (!firstPart) return clean.slice(0, 5);

  const normalized =
    firstPart.charAt(0).toUpperCase() + firstPart.slice(1).toLowerCase();

  return normalized.length <= 10 ? normalized : normalized.slice(0, 10);
}

async function loadInsightsData(userId: string) {
  const supabase = await createSupabaseServerAuthClient();
  const company = await getCurrentCompanyForUser(supabase, userId);

  const ninetyDaysAgo = new Date(
    Date.now() - 90 * 24 * 60 * 60 * 1000,
  ).toISOString();

  const [membersResult, evaluationsResult] = await Promise.all([
    supabase.rpc("get_inventory_company_members", {
      requested_company_id: company.companyId,
    }),
    supabase
      .from("auction_evaluations")
      .select(
        `
        id,
        created_at,
        updated_at,
        status,
        year,
        make,
        model,
        trim,
        vehicle_title,
        current_bid,
        target_resale_used,
        expected_gross_profit,
        decision,
        risk_grade,
        auction_site,
        created_by
      `,
      )
      .eq("company_id", company.companyId)
      .neq("status", "draft")
      .gte("created_at", ninetyDaysAgo)
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  if (membersResult.error) throw new Error(membersResult.error.message);
  if (evaluationsResult.error) throw new Error(evaluationsResult.error.message);

  const memberRows = (membersResult.data || []) as CompanyMemberRpcRow[];
  const labelsByUserId = new Map(
    memberRows.map((member) => [
      member.user_id,
      member.display_name ||
        compactUserLabelFromEmail(member.email) ||
        "Unknown",
    ]),
  );

  const evaluations = (evaluationsResult.data || []).map((row) => ({
    ...row,
    created_by_label: row.created_by
      ? labelsByUserId.get(row.created_by) || "Unknown"
      : "Unknown",
  })) as InsightEvaluation[];

  return { company, evaluations };
}

export default async function InsightsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/insights");

  let evaluations: InsightEvaluation[] = [];
  let companyRole: string | null = null;
  let loadError: string | null = null;

  try {
    const result = await loadInsightsData(user.id);
    evaluations = result.evaluations;
    companyRole = result.company.role;
  } catch (error) {
    loadError =
      error instanceof Error ? error.message : "Insights failed to load.";
  }

  return (
    <main className="min-h-screen bg-[#f5f7fb] text-slate-950">
      <AppTopNav
        active="insights"
        userEmail={user.email}
        userRole={companyRole}
      />

      <div className="mx-auto w-full max-w-[1380px] px-4 py-5 sm:px-5 lg:px-7">
        <div className="mb-6">
          <div className="text-[10px] font-black uppercase tracking-[0.16em] text-blue-700">
            Your dealership, quantified
          </div>
          <h1 className="mt-1 text-[30px] font-black tracking-[-0.04em] text-slate-950">
            Insights
          </h1>
          <p className="mt-1 max-w-3xl text-slate-600">
            See what your buying behavior is telling you—and teach Lot Logic
            what the numbers cannot explain on their own.
          </p>
        </div>

        {loadError ? (
          <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            Insights could not load: {loadError}
          </div>
        ) : null}

        <InsightsDashboard evaluations={evaluations} />
      </div>
    </main>
  );
}
