import { NextResponse } from "next/server";
import { defaultAssumptions } from "@/lib/assumptions";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

const SETTINGS_KEY = "underwriting_assumptions";

export async function GET() {
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

    return NextResponse.json({
      assumptions: data?.payload || defaultAssumptions,
      source: data?.payload ? "saved" : "default",
    });
  } catch (error) {
    console.error("Failed to load assumptions:", error);

    return NextResponse.json(
      {
        assumptions: defaultAssumptions,
        source: "default",
        error: "Failed to load saved assumptions. Using defaults.",
      },
      { status: 200 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const assumptions = body?.assumptions;

    if (!assumptions || typeof assumptions !== "object") {
      return NextResponse.json(
        { error: "Missing assumptions object." },
        { status: 400 }
      );
    }

    const supabase = createSupabaseAdminClient();

    const { data, error } = await supabase
      .from("app_settings")
      .upsert(
        {
          key: SETTINGS_KEY,
          payload: assumptions,
        },
        {
          onConflict: "key",
        }
      )
      .select("key, payload, updated_at")
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      setting: data,
    });
  } catch (error) {
    console.error("Failed to save assumptions:", error);

    return NextResponse.json(
      { error: "Failed to save assumptions." },
      { status: 500 }
    );
  }
}
