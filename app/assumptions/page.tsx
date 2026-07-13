import Link from "next/link";
import { AssumptionsTabs } from "@/components/assumptions/assumptions-tabs";
import { AppSidebar } from "@/components/navigation/app-sidebar";
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
    <main className="min-h-screen bg-slate-100 text-slate-950">
      <div className="flex min-h-screen">
        <AppSidebar active="assumptions" userEmail={user?.email} />

        <div className="flex min-w-0 flex-1 flex-col">
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
