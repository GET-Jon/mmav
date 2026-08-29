import { NextResponse } from "next/server";

import { getLotLogicIntelligenceAccess } from "@/lib/lot-logic-intelligence/access";
import { reviewInsight } from "@/lib/lot-logic-intelligence/service";
import type { InsightReviewAction } from "@/lib/lot-logic-intelligence/types";

const VALID_ACTIONS = new Set<InsightReviewAction>([
  "validated",
  "refuted",
  "keep_observing",
]);

export async function POST(
  request: Request,
  context: { params: Promise<{ insightId: string }> },
) {
  try {
    const access = await getLotLogicIntelligenceAccess();
    if (!access) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }
    if (!access.isAdmin) {
      return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
    }

    const { insightId } = await context.params;
    const body = await request.json().catch(() => ({}));
    const action = String(body.action || "") as InsightReviewAction;
    const notes = body.notes == null ? null : String(body.notes).trim().slice(0, 2000);

    if (!VALID_ACTIONS.has(action)) {
      return NextResponse.json(
        { error: "Action must be validated, refuted, or keep_observing." },
        { status: 400 },
      );
    }

    const result = await reviewInsight(access.supabase, {
      companyId: access.company.companyId,
      insightId,
      action,
      reviewedBy: access.userId,
      notes,
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to review intelligence insight." },
      { status: 500 },
    );
  }
}
