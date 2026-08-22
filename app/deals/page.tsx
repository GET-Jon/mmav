import { AppTopNav } from "@/components/navigation/app-top-nav";
import { DealsPipelineTable } from "@/components/deals/deals-pipeline-table";
import { getCurrentCompanyForUser } from "@/lib/supabase/company";
import {
  createSupabaseServerAuthClient,
  getCurrentUser,
} from "@/lib/supabase/server-auth";

export const dynamic = "force-dynamic";

type SavedEvaluation = {
  id: string;
  created_at: string;
  updated_at: string;
  status: string | null;
  vin: string | null;
  vehicle_title: string | null;
  mileage: number | null;
  current_bid: number | null;
  target_resale_used: number | null;
  safe_bid: number | null;
  max_smart_bid: number | null;
  stretch_bid: number | null;
  expected_gross_profit: number | null;
  decision: string | null;
  risk_grade: string | null;
  auction_site: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_by_email?: string | null;
  updated_by_email?: string | null;
  created_by_label?: string | null;
  updated_by_label?: string | null;
};

type CompanyUserOption = {
  id: string;
  email: string | null;
  label: string;
};

type CompanyMemberRpcRow = {
  user_id: string;
  display_name: string | null;
  email: string | null;
  role: string | null;
};

function compactUserLabelFromEmail(email?: string | null) {
  const clean = String(email || "").trim();

  if (!clean) {
    return "Unknown";
  }

  const beforeAt = clean.includes("@") ? clean.split("@")[0] : clean;
  const firstPart = beforeAt.split(/[._\-\s]+/).filter(Boolean)[0] || beforeAt;

  if (!firstPart) {
    return clean.slice(0, 5);
  }

  const normalized =
    firstPart.charAt(0).toUpperCase() + firstPart.slice(1).toLowerCase();

  return normalized.length <= 10 ? normalized : normalized.slice(0, 5);
}

async function getSavedEvaluations(userId: string) {
  const supabase = await createSupabaseServerAuthClient();
  const company = await getCurrentCompanyForUser(supabase, userId);

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
        vin,
        vehicle_title,
        mileage,
        current_bid,
        target_resale_used,
        safe_bid,
        max_smart_bid,
        stretch_bid,
        expected_gross_profit,
        decision,
        risk_grade,
        auction_site,
        created_by,
        updated_by
      `,
      )
      .eq("company_id", company.companyId)
      .neq("status", "draft")
      .order("updated_at", { ascending: false })
      .limit(50),
  ]);

  if (membersResult.error) {
    return {
      evaluations: [] as SavedEvaluation[],
      companyUsers: [] as CompanyUserOption[],
      error: membersResult.error.message,
    };
  }

  if (evaluationsResult.error) {
    return {
      evaluations: [] as SavedEvaluation[],
      companyUsers: [] as CompanyUserOption[],
      error: evaluationsResult.error.message,
    };
  }

  const memberRows = (membersResult.data || []) as CompanyMemberRpcRow[];
  const companyUsers: CompanyUserOption[] = memberRows.map((member) => ({
    id: member.user_id,
    email: member.email,
    label:
      member.display_name ||
      compactUserLabelFromEmail(member.email) ||
      "Unknown",
  }));

  const userEmailById = new Map(
    companyUsers.map((member) => [member.id, member.email || "Unknown user"]),
  );
  const userLabelById = new Map(
    companyUsers.map((member) => [member.id, member.label]),
  );

  const evaluations = (evaluationsResult.data || []) as SavedEvaluation[];

  return {
    evaluations: evaluations.map((evaluation) => ({
      ...evaluation,
      created_by_email: evaluation.created_by
        ? userEmailById.get(evaluation.created_by) || "Unknown user"
        : null,
      updated_by_email: evaluation.updated_by
        ? userEmailById.get(evaluation.updated_by) || "Unknown user"
        : null,
      created_by_label: evaluation.created_by
        ? userLabelById.get(evaluation.created_by) ||
          compactUserLabelFromEmail(userEmailById.get(evaluation.created_by))
        : null,
      updated_by_label: evaluation.updated_by
        ? userLabelById.get(evaluation.updated_by) ||
          compactUserLabelFromEmail(userEmailById.get(evaluation.updated_by))
        : null,
    })),
    companyUsers,
    error: null as string | null,
  };
}

export default async function DealsPage() {
  const user = await getCurrentUser();
  let evaluations: SavedEvaluation[] = [];
  let companyUsers: CompanyUserOption[] = [];
  let loadError: string | null = null;

  try {
    if (!user) {
      throw new Error("You must be signed in to view saved searches.");
    }

    const result = await getSavedEvaluations(user.id);
    evaluations = result.evaluations;
    companyUsers = result.companyUsers;
    loadError = result.error;
  } catch (error) {
    loadError =
      error instanceof Error ? error.message : "Deal Pipeline failed to load.";
  }

  return (
    <main className="min-h-screen bg-[#f5f7fb] text-slate-950">
      <AppTopNav active="pipeline" userEmail={user?.email} />

      <div className="mx-auto w-full max-w-[1380px] px-4 py-5 sm:px-5 lg:px-7">
        <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <h1 className="text-[28px] font-black tracking-[-0.035em] text-slate-950">
              Deal Pipeline
            </h1>
            <p className="mt-1 text-slate-600">
              Track watched vehicles, bids, passes, wins, losses, and purchases.
            </p>
          </div>

          <div className="rounded-xl bg-white px-4 py-3 text-sm font-semibold shadow-sm">
            {evaluations.length} saved evaluations
          </div>
        </div>

        {loadError ? (
          <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            Deal Pipeline could not load: {loadError}
          </div>
        ) : null}

        <DealsPipelineTable
          evaluations={evaluations}
          companyUsers={companyUsers}
        />
      </div>
    </main>
  );
}
