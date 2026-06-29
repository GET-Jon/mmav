import { AppSidebar } from "@/components/navigation/app-sidebar";
import { DealsPipelineTable } from "@/components/deals/deals-pipeline-table";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getDefaultCompanyId } from "@/lib/supabase/company";

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
};

async function getSavedEvaluations() {
  const supabase = createSupabaseAdminClient();
  const companyId = await getDefaultCompanyId(supabase);

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
      auction_site
    `
    )
    .eq("company_id", companyId)
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

  return {
    evaluations: data as SavedEvaluation[],
    error: null as string | null,
  };
}

export default async function DealsPage() {
  let evaluations: SavedEvaluation[] = [];
  let loadError: string | null = null;

  try {
    const result = await getSavedEvaluations();
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
        <AppSidebar active="saved" />

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6">
            <div>
              <div className="text-xl font-bold">Saved Searches</div>
              <div className="text-sm text-slate-500">
                Saved auction evaluations and active deal pipeline
              </div>
            </div>
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
