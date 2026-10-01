import { NextResponse } from "next/server";

import { checkUsageAllowance } from "@/lib/billing/usage";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/server-auth";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const admin = createSupabaseAdminClient();
    const allowance = await checkUsageAllowance({
      supabase: admin,
      userId: user.id,
      kind: "evaluation_completed",
    });
    return NextResponse.json({
      ...allowance.summary,
      canStartEvaluation: allowance.allowed,
      evaluationAccessMessage: allowance.allowed ? null : allowance.message,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Usage failed to load." },
      { status: 500 },
    );
  }
}
