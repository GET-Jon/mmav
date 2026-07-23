import Link from "next/link";
import { AssumptionsTabs } from "@/components/assumptions/assumptions-tabs";
import { AppTopNav } from "@/components/navigation/app-top-nav";
import { defaultAssumptions } from "@/lib/assumptions";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/server-auth";
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
  const user = await getCurrentUser();
  const { assumptions, source } = await loadAssumptions();

  return (
    <main className="min-h-screen bg-[#f5f7fb] text-slate-950">
      <AppTopNav active="rules" userEmail={user?.email} />

      <div className="mx-auto w-full max-w-[1380px] px-4 py-5 sm:px-5 lg:px-7">
        <div className="mb-6">
          <h1 className="text-[28px] font-black tracking-[-0.035em] text-slate-950">
            Assumptions
          </h1>
          <p className="mt-2 max-w-3xl text-slate-600">
            These settings control bidding logic, fee tiers, risk rules, and
            comp adjustments. Saved changes are stored in Supabase and can be
            updated without editing code.
          </p>
        </div>

        <AssumptionsTabs assumptions={assumptions} />
      </div>
    </main>
  );
}
