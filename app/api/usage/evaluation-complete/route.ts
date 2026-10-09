import { NextResponse } from "next/server";

import {
  checkUsageAllowance,
  evaluationUsageSubject,
  recordUsageEvent,
} from "@/lib/billing/usage";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/server-auth";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      vin?: unknown;
      year?: unknown;
      make?: unknown;
      model?: unknown;
      trim?: unknown;
      evaluationUsageId?: unknown;
      hasUsableValuation?: boolean;
      valuationCompCount?: number;
    };

    if (!body.hasUsableValuation || Number(body.valuationCompCount || 0) < 1) {
      return NextResponse.json(
        {
          error:
            "This result does not have enough market evidence to count as a completed valuation.",
          counted: false,
        },
        { status: 400 },
      );
    }

    const admin = createSupabaseAdminClient();
    const subjectKey = evaluationUsageSubject(body);
    const allowance = await checkUsageAllowance({
      supabase: admin,
      userId: user.id,
      kind: "evaluation_completed",
      subjectKey,
    });

    if (!allowance.allowed) {
      return NextResponse.json(
        {
          error: allowance.message,
          code: allowance.code,
          usage: allowance.summary,
        },
        { status: allowance.status },
      );
    }

    const consumesGiftedEvaluation =
      "consumesGiftedEvaluation" in allowance &&
      allowance.consumesGiftedEvaluation;

    // Consume the bonus atomically before recording the completed evaluation.
    // This prevents two simultaneous evaluations from both spending the last
    // gifted credit. A rare downstream recording failure can undercount by one
    // credit, which is safer than allowing an overage.
    if (consumesGiftedEvaluation) {
      const { data: consumed, error: consumeError } = await admin.rpc(
        "consume_company_evaluation_credit",
        {
          p_company_id: allowance.summary.company.companyId,
          p_subject_key: subjectKey,
        },
      );

      if (consumeError) throw new Error(consumeError.message);
      if (!consumed) {
        return NextResponse.json(
          {
            error:
              "The gifted evaluation credit was no longer available. Refresh your usage and try again.",
            code: "GIFTED_EVALUATION_UNAVAILABLE",
          },
          { status: 409 },
        );
      }
    }

    await recordUsageEvent({
      supabase: admin,
      companyId: allowance.summary.company.companyId,
      userId: user.id,
      kind: "evaluation_completed",
      subjectKey,
      idempotencyKey: `evaluation_completed:${subjectKey}`,
      metadata: {
        valuationCompCount: Number(body.valuationCompCount || 0),
        giftedEvaluation: consumesGiftedEvaluation,
      },
    });

    return NextResponse.json({
      counted: true,
      subjectKey,
      usage: await getUsageSummaryAfter(admin, user.id),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Usage could not be recorded." },
      { status: 500 },
    );
  }
}

async function getUsageSummaryAfter(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  userId: string,
) {
  const { getUsageSummary } = await import("@/lib/billing/usage");
  return getUsageSummary(admin, userId);
}
