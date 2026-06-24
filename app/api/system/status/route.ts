import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const checks = {
    supabaseUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    supabaseServiceRoleKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    marketCheckApiKey: Boolean(process.env.MARKETCHECK_API_KEY),
    auctionEvaluationsTable: false,
    auctionEvaluationsReadable: false,
  };

  try {
    const supabase = createSupabaseAdminClient();

    const { error } = await supabase
      .from("auction_evaluations")
      .select("id", { count: "exact", head: true });

    if (error) {
      return NextResponse.json(
        {
          ok: false,
          checks,
          error: {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
          },
        },
        { status: 500 }
      );
    }

    checks.auctionEvaluationsTable = true;
    checks.auctionEvaluationsReadable = true;

    return NextResponse.json({
      ok: true,
      checks,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        checks,
        error:
          error instanceof Error
            ? error.message
            : "Unknown system status error.",
      },
      { status: 500 }
    );
  }
}
