import { NextResponse } from "next/server";
import {
  defaultMarketCheckApiControls,
  normalizeMarketCheckApiControls,
  type MarketCheckApiControls,
} from "@/lib/marketcheck/api-controls";
import { getCurrentCompanyForUser } from "@/lib/supabase/company";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/server-auth";

const MARKETCHECK_PROVIDER = "marketcheck";

type UserApiSettingsRow = {
  id: string;
  company_id: string;
  user_id: string;
  provider: string;
  live_lookup_enabled: boolean;
  max_api_calls_per_search: number;
  min_usable_comps_to_stop: number;
  min_initial_regions: number;
  settings: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

function rowToControls(
  row: UserApiSettingsRow | null | undefined
): MarketCheckApiControls {
  if (!row) {
    return defaultMarketCheckApiControls;
  }

  return normalizeMarketCheckApiControls({
    liveLookupEnabled: row.live_lookup_enabled,
    maxApiCallsPerSearch: row.max_api_calls_per_search,
    minUsableCompsToStop: row.min_usable_comps_to_stop,
    minInitialRegions: row.min_initial_regions,
  });
}

function controlsToRow(controls: MarketCheckApiControls) {
  return {
    live_lookup_enabled: controls.liveLookupEnabled,
    max_api_calls_per_search: controls.maxApiCallsPerSearch,
    min_usable_comps_to_stop: controls.minUsableCompsToStop,
    min_initial_regions: controls.minInitialRegions,
  };
}

export async function GET() {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const supabase = createSupabaseAdminClient();
    const company = await getCurrentCompanyForUser(supabase, currentUser.id);

    const { data, error } = await supabase
      .from("user_api_settings")
      .select(
        `
        id,
        company_id,
        user_id,
        provider,
        live_lookup_enabled,
        max_api_calls_per_search,
        min_usable_comps_to_stop,
        min_initial_regions,
        settings,
        created_at,
        updated_at
      `
      )
      .eq("company_id", company.companyId)
      .eq("user_id", currentUser.id)
      .eq("provider", MARKETCHECK_PROVIDER)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      company,
      user: {
        id: currentUser.id,
        email: currentUser.email,
      },
      provider: MARKETCHECK_PROVIDER,
      controls: rowToControls(data as UserApiSettingsRow | null),
      source: data ? "database" : "defaults",
      settingsScope: "user",
      settings: data || null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load user API settings.",
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = await request.json();

    const controls = normalizeMarketCheckApiControls({
      liveLookupEnabled: body.liveLookupEnabled,
      maxApiCallsPerSearch: body.maxApiCallsPerSearch,
      minUsableCompsToStop: body.minUsableCompsToStop,
      minInitialRegions: body.minInitialRegions,
    });

    const supabase = createSupabaseAdminClient();
    const company = await getCurrentCompanyForUser(supabase, currentUser.id);

    const { data, error } = await supabase
      .from("user_api_settings")
      .upsert(
        {
          company_id: company.companyId,
          user_id: currentUser.id,
          provider: MARKETCHECK_PROVIDER,
          ...controlsToRow(controls),
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "company_id,user_id,provider",
        }
      )
      .select(
        `
        id,
        company_id,
        user_id,
        provider,
        live_lookup_enabled,
        max_api_calls_per_search,
        min_usable_comps_to_stop,
        min_initial_regions,
        settings,
        created_at,
        updated_at
      `
      )
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      company,
      user: {
        id: currentUser.id,
        email: currentUser.email,
      },
      provider: MARKETCHECK_PROVIDER,
      controls: rowToControls(data as UserApiSettingsRow),
      source: "database",
      settingsScope: "user",
      settings: data,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to update user API settings.",
      },
      { status: 500 }
    );
  }
}
