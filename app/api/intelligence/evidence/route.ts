import { NextResponse } from "next/server";

import { getLotLogicIntelligenceAccess } from "@/lib/lot-logic-intelligence/access";

export async function GET() {
  try {
    const access = await getLotLogicIntelligenceAccess();
    if (!access) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const companyId = access.company.companyId;
    const [predictions, outcomes, decisions] = await Promise.all([
      access.supabase
        .from("lot_logic_intelligence_prediction_snapshots")
        .select("id,prediction_type,subject_key,confidence,created_at", { count: "exact" })
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(25),
      access.supabase
        .from("lot_logic_intelligence_prediction_outcomes")
        .select("id,prediction_snapshot_id,actual_cost,actual_labor_minutes,actual_elapsed_minutes,qc_passed,resolved_at", { count: "exact" })
        .eq("company_id", companyId)
        .order("resolved_at", { ascending: false })
        .limit(25),
      access.supabase
        .from("lot_logic_intelligence_decision_events")
        .select("id,decision_type,decided_at", { count: "exact" })
        .eq("company_id", companyId)
        .order("decided_at", { ascending: false })
        .limit(25),
    ]);

    if (predictions.error) throw new Error(predictions.error.message);
    if (outcomes.error) throw new Error(outcomes.error.message);
    if (decisions.error) throw new Error(decisions.error.message);

    return NextResponse.json({
      counts: {
        predictions: predictions.count || 0,
        outcomes: outcomes.count || 0,
        decisions: decisions.count || 0,
      },
      predictions: predictions.data || [],
      outcomes: outcomes.data || [],
      decisions: decisions.data || [],
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load Intelligence evidence." },
      { status: 500 },
    );
  }
}
