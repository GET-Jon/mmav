import { AppSidebar } from "@/components/navigation/app-sidebar";
import { modelTaxonomyFallbacks } from "@/lib/marketcheck/model-taxonomy";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  return (
    <main className="min-h-screen bg-slate-100 text-slate-950">
      <div className="flex min-h-screen">
        <AppSidebar active="settings" />

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6">
            <div>
              <div className="text-xl font-bold">Settings</div>
              <div className="text-sm text-slate-500">
                System configuration and valuation controls
              </div>
            </div>
          </header>

          <div className="flex-1 p-6">
            <div className="mb-6">
              <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
              <p className="mt-1 text-slate-600">
                Review operational rules used by the auction evaluator.
              </p>
            </div>

            <div className="mb-5 flex flex-wrap gap-2">
              <div className="rounded-full bg-slate-950 px-4 py-2 text-sm font-bold text-white">
                Model Taxonomy
              </div>
              <div className="rounded-full bg-white px-4 py-2 text-sm font-bold text-slate-500 shadow-sm">
                API Usage
              </div>
              <div className="rounded-full bg-white px-4 py-2 text-sm font-bold text-slate-500 shadow-sm">
                Users
              </div>
              <div className="rounded-full bg-white px-4 py-2 text-sm font-bold text-slate-500 shadow-sm">
                Organization
              </div>
            </div>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-5 flex flex-col justify-between gap-3 md:flex-row md:items-start">
                <div>
                  <h2 className="text-xl font-bold">MarketCheck Model Taxonomy</h2>
                  <p className="mt-1 max-w-3xl text-sm text-slate-600">
                    These rules handle cases where MarketCheck groups a true
                    performance model under a broader model family. The broader
                    model is used only as a candidate retrieval pool. Returned
                    listings must still pass strict include/reject filters before
                    they can be used as comps.
                  </p>
                </div>

                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
                  View-only for now. Admin editing should be added after
                  Supabase-backed audit history.
                </div>
              </div>

              <div className="overflow-hidden rounded-xl border border-slate-200">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Make</th>
                      <th className="px-4 py-3">User Model</th>
                      <th className="px-4 py-3">Fallback Search</th>
                      <th className="px-4 py-3">Must Include</th>
                      <th className="px-4 py-3">Reject If Includes</th>
                      <th className="px-4 py-3">Notes</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100">
                    {modelTaxonomyFallbacks.map((fallback) => (
                      <tr key={fallback.id} className="align-top hover:bg-slate-50">
                        <td className="px-4 py-3 font-semibold">
                          {fallback.make}
                        </td>

                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {fallback.requestedModels.map((model) => (
                              <span
                                key={model}
                                className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700"
                              >
                                {model}
                              </span>
                            ))}
                          </div>
                        </td>

                        <td className="px-4 py-3">
                          <div className="font-semibold text-blue-700">
                            {fallback.fallbackModel}
                          </div>
                          <div className="mt-1 text-xs text-slate-500">
                            {fallback.fallbackLabel}
                          </div>
                        </td>

                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {fallback.mustInclude.map((term) => (
                              <span
                                key={term}
                                className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700"
                              >
                                {term}
                              </span>
                            ))}
                          </div>
                        </td>

                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {fallback.rejectIfIncludes.map((term) => (
                              <span
                                key={term}
                                className="rounded-full bg-red-50 px-2 py-1 text-xs font-bold text-red-700"
                              >
                                {term}
                              </span>
                            ))}
                          </div>
                        </td>

                        <td className="px-4 py-3 text-slate-600">
                          {fallback.notes}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
