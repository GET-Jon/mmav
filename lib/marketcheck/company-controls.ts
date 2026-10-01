import type { SupabaseClient } from "@supabase/supabase-js";
import { defaultMarketCheckApiControls, normalizeMarketCheckApiControls } from "@/lib/marketcheck/api-controls";

export async function loadCompanyMarketCheckControls(admin: SupabaseClient, companyId: string, userId: string) {
  const columns = "max_api_calls_per_search,min_usable_comps_to_stop,min_initial_regions";
  const userResult = await admin.from("user_api_settings").select(columns).eq("company_id", companyId).eq("user_id", userId).eq("provider", "marketcheck").maybeSingle();
  if (userResult.error) throw new Error(userResult.error.message);
  const companyResult = !userResult.data ? await admin.from("company_api_settings").select(columns).eq("company_id", companyId).eq("provider", "marketcheck").maybeSingle() : null;
  if (companyResult?.error) throw new Error(companyResult.error.message);
  const row = userResult.data || companyResult?.data;
  return {
    controls: row ? normalizeMarketCheckApiControls({
      maxApiCallsPerSearch: row.max_api_calls_per_search,
      minUsableCompsToStop: row.min_usable_comps_to_stop,
      minInitialRegions: row.min_initial_regions,
    }) : defaultMarketCheckApiControls,
    source: row ? "database" : "defaults",
    settingsScope: userResult.data ? "user" : "company",
  };
}
