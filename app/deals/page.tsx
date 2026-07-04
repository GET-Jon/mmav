import { AccountStatus } from "@/components/auth/account-status";
import { AppSidebar } from "@/components/navigation/app-sidebar";
import { DealsPipelineTable } from "@/components/deals/deals-pipeline-table";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getCurrentCompanyForUser } from "@/lib/supabase/company";
import { getCurrentUser } from "@/lib/supabase/server-auth";

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
};

async function getSavedEvaluations(userId: string) {
  const supabase = createSupabaseAdminClient();
  const company = await getCurrentCompanyForUser(supabase, userId);

  const { data, error } = await supabase
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
    `
    )
    .eq("company_id", company.companyId)
    .order("updated_at", {
      ascending: false,
    })
    .limit(50);

  if (error) {
    return {
      evaluations: [] as SavedEvaluation[],
      error: error.message,
    };
  }

  const evaluations = (data || []) as SavedEvaluation[];
  const userIds = Array.from(
    new Set(
      evaluations
        .flatMap((evaluation) => [evaluation.created_by, evaluation.updated_by])
        .filter(Boolean) as string[]
    )
  );

  const userEmailById = new Map<string, string>();

  if (userIds.length) {
    const { data: usersData } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });

    for (const authUser of usersData?.users || []) {
      if (userIds.includes(authUser.id)) {
        userEmailById.set(authUser.id, authUser.email || authUser.id);
      }
    }
  }

  return {
    evaluations: evaluations.map((evaluation) => ({
      ...evaluation,
      created_by_email: evaluation.created_by
        ? userEmailById.get(evaluation.created_by) || "Unknown user"
        : null,
      updated_by_email: evaluation.updated_by
        ? userEmailById.get(evaluation.updated_by) || "Unknown user"
        : null,
    })),
    error: null as string | null,
  };
}

export default async function DealsPage() {
  const user = await getCurrentUser();
  let evaluations: SavedEvaluation[] = [];
  let loadError: string | null = null;

  try {
    if (!user) {
      throw new Error("You must be signed in to view saved searches.");
    }

    const result = await getSavedEvaluations(user.id);
    evaluations = result.evaluations;
    loadError = result.error;
  } catch (error) {
    loadError =
      error instanceof Error
        ? error.message
        : "Saved Searches failed to load.";
  }

  return (
    <main className="min-h-screen bg-slate-100 text-slate-950">
      <div className="flex min-h-screen">
        <AppSidebar active="saved" userEmail={user?.email} />

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-6">
            <div>
              <div className="text-sm font-black uppercase tracking-wide text-slate-500">
                Saved Searches
              </div>
            </div>

            <AccountStatus userEmail={user?.email} />
          </header>

          <div className="flex-1 p-6">
            <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-end">
              <div>
                <h1 className="text-3xl font-bold tracking-tight">
                  Saved Searches
                </h1>
                <p className="mt-1 text-slate-600">
                  Track watched vehicles, bids, passes, wins, losses, and
                  purchases.
                </p>
              </div>

              <div className="rounded-xl bg-white px-4 py-3 text-sm font-semibold shadow-sm">
                {evaluations.length} saved evaluations
              </div>
            </div>

            {loadError ? (
              <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                Saved Searches could not load: {loadError}
              </div>
            ) : null}

            <DealsPipelineTable evaluations={evaluations} />
          </div>
        </div>
      </div>
    </main>
  );
}
