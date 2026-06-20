import Link from "next/link";
import { AssumptionsTabs } from "@/components/assumptions/assumptions-tabs";
import { defaultAssumptions } from "@/lib/assumptions";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { Assumptions } from "@/types/assumptions";

export const dynamic = "force-dynamic";

const SETTINGS_KEY = "underwriting_assumptions";

async function loadAssumptions(): Promise<{
  assumptions: Assumptions;
  source: "saved" | "default";
}> {
  try {
    const supabase = createSupabaseAdminClient();

    const { data, error } = await supabase
      .from("app_settings")
      .select("payload")
      .eq("key", SETTINGS_KEY)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (data?.payload) {
      return {
        assumptions: data.payload as Assumptions,
        source: "saved",
      };
    }

    return {
      assumptions: defaultAssumptions,
      source: "default",
    };
  } catch (error) {
    console.error("Failed to load saved assumptions:", error);

    return {
      assumptions: defaultAssumptions,
      source: "default",
    };
  }
}

export default async function AssumptionsPage() {
  const { assumptions, source } = await loadAssumptions();

  return (
    <main className="min-h-screen bg-slate-100 text-slate-950">
      <div className="flex min-h-screen">
        <aside className="hidden w-64 shrink-0 bg-slate-950 p-5 text-white lg:block">
          <div className="mb-10 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-400 text-xl font-black text-slate-950">
              M
            </div>
            <div>
              <div className="text-lg font-bold leading-tight">Mindful</div>
              <div className="text-lg font-bold leading-tight">Motors</div>
            </div>
          </div>

          <nav className="space-y-2 text-sm">
            <Link
              href="/"
              className="block rounded-xl px-4 py-3 text-slate-300 hover:bg-white/5"
            >
              Auction Evaluator
            </Link>
            <Link
              href="/assumptions"
              className="block rounded-xl bg-cyan-500/20 px-4 py-3 text-cyan-200"
            >
              Rules & Defaults
            </Link>
          </nav>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6">
            <div>
              <div className="text-xl font-bold">Rules & Defaults</div>
              <div className="text-sm text-slate-500">
                Assumptions used by the auction valuation engine
              </div>
            </div>
            <div
              className={`rounded-full px-3 py-1 text-sm font-medium ${
                source === "saved"
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-slate-100 text-slate-700"
              }`}
            >
              {source === "saved" ? "Saved Supabase rules" : "Code defaults"}
            </div>
          </header>

          <div className="flex-1 p-6">
            <div className="mb-6">
              <h1 className="text-3xl font-bold tracking-tight">
                Assumptions
              </h1>
              <p className="mt-2 max-w-3xl text-slate-600">
                These settings control bidding logic, fee tiers, risk rules, and
                comp adjustments. Saved changes are stored in Supabase and can
                be updated without editing code.
              </p>
            </div>

            <AssumptionsTabs assumptions={assumptions} />
          </div>
        </div>
      </div>
    </main>
  );
}
