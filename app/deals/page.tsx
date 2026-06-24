import Link from "next/link";
import { AppSidebar } from "@/components/navigation/app-sidebar";
import { DealStatusSelect } from "@/components/deals/deal-status-select";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

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
};

function money(value: number | null) {
  if (value === null || value === undefined) {
    return "—";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function number(value: number | null) {
  if (value === null || value === undefined) {
    return "—";
  }

  return new Intl.NumberFormat("en-US").format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

async function getSavedEvaluations() {
  const supabase = createSupabaseAdminClient();

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
      risk_grade
    `
    )
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
          <h1 className="text-3xl font-bold tracking-tight">Saved Searches</h1>
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
          Saved Searches could not load: {loadError}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Saved</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Vehicle</th>
              <th className="px-4 py-3">VIN</th>
              <th className="px-4 py-3">Mileage</th>
              <th className="px-4 py-3">Current Bid</th>
              <th className="px-4 py-3">Target</th>
              <th className="px-4 py-3">Max Smart</th>
              <th className="px-4 py-3">Profit</th>
              <th className="px-4 py-3">Risk</th>
              <th className="px-4 py-3">Decision</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100">
            {evaluations.map((evaluation) => (
              <tr key={evaluation.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 text-slate-500">
                  {formatDate(evaluation.updated_at)}
                </td>
                <td className="px-4 py-3">
                  <DealStatusSelect
                    evaluationId={evaluation.id}
                    initialStatus={evaluation.status}
                  />
                </td>
                <td className="px-4 py-3 font-semibold">
                  <Link
                    href={`/deals/${evaluation.id}`}
                    className="text-blue-700 hover:underline"
                  >
                    {evaluation.vehicle_title || "Untitled Vehicle"}
                  </Link>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-slate-500">
                  {evaluation.vin || "—"}
                </td>
                <td className="px-4 py-3">{number(evaluation.mileage)}</td>
                <td className="px-4 py-3">{money(evaluation.current_bid)}</td>
                <td className="px-4 py-3">
                  {money(evaluation.target_resale_used)}
                </td>
                <td className="px-4 py-3 font-semibold text-blue-700">
                  {money(evaluation.max_smart_bid)}
                </td>
                <td className="px-4 py-3 font-semibold">
                  {money(evaluation.expected_gross_profit)}
                </td>
                <td className="px-4 py-3">{evaluation.risk_grade || "—"}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-bold ${
                      evaluation.decision === "Pass"
                        ? "bg-red-100 text-red-700"
                        : evaluation.decision === "Watch / Stretch Only"
                        ? "bg-amber-100 text-amber-700"
                        : "bg-emerald-100 text-emerald-700"
                    }`}
                  >
                    {evaluation.decision || "—"}
                  </span>
                </td>
              </tr>
            ))}

            {evaluations.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-center text-slate-500" colSpan={11}>
                  No saved evaluations yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
          </div>
        </div>
      </div>
    </main>
  );
}
