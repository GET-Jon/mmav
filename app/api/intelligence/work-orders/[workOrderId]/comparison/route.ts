import { NextResponse } from "next/server";

import { getLotLogicIntelligenceAccess } from "@/lib/lot-logic-intelligence/access";

export async function GET(
  _request: Request,
  context: { params: Promise<{ workOrderId: string }> },
) {
  try {
    const access = await getLotLogicIntelligenceAccess();
    if (!access) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const { workOrderId } = await context.params;
    const { data: workOrder, error: workOrderError } = await access.supabase
      .from("mindful_inventory_work_orders")
      .select(
        "id,vehicle_id,plan_item_id,assigned_partner_id,initial_estimate,approved_budget,current_forecast,estimated_labor_minutes,estimated_elapsed_minutes,actual_cost,actual_labor_minutes,actual_start_at,actual_end_at,status",
      )
      .eq("id", workOrderId)
      .maybeSingle();

    if (workOrderError) {
      return NextResponse.json({ error: workOrderError.message }, { status: 500 });
    }
    if (!workOrder) {
      return NextResponse.json({ error: "Work order not found." }, { status: 404 });
    }

    const [{ data: predictions, error: predictionsError }, { data: estimates, error: estimatesError }] =
      await Promise.all([
        access.supabase
          .from("lot_logic_intelligence_prediction_snapshots")
          .select(
            "id,prediction_type,subject_key,predicted_cost_low,predicted_cost_high,predicted_labor_minutes,predicted_elapsed_minutes,predicted_partner_id,confidence,model_provider,model_name,prompt_version,created_at",
          )
          .or(`work_order_id.eq.${workOrderId},plan_item_id.eq.${workOrder.plan_item_id}`)
          .order("created_at", { ascending: false }),
        access.supabase
          .from("lot_logic_partner_blind_estimates")
          .select(
            "id,partner_id,revision_no,quoted_cost,estimated_labor_minutes,estimated_elapsed_minutes,notes,submitted_at",
          )
          .eq("work_order_id", workOrderId)
          .order("revision_no", { ascending: false }),
      ]);

    if (predictionsError) {
      return NextResponse.json({ error: predictionsError.message }, { status: 500 });
    }
    if (estimatesError) {
      return NextResponse.json({ error: estimatesError.message }, { status: 500 });
    }

    let actualElapsedMinutes: number | null = null;
    if (workOrder.actual_start_at && workOrder.actual_end_at) {
      actualElapsedMinutes = Math.max(
        0,
        Math.round(
          (new Date(workOrder.actual_end_at).getTime() - new Date(workOrder.actual_start_at).getTime()) /
            60000,
        ),
      );
    }

    return NextResponse.json({
      workOrder: {
        id: workOrder.id,
        vehicleId: workOrder.vehicle_id,
        planItemId: workOrder.plan_item_id,
        assignedPartnerId: workOrder.assigned_partner_id,
        status: workOrder.status,
      },
      internalPlanning: {
        initialEstimate: workOrder.initial_estimate,
        approvedBudget: workOrder.approved_budget,
        currentForecast: workOrder.current_forecast,
        estimatedLaborMinutes: workOrder.estimated_labor_minutes,
        estimatedElapsedMinutes: workOrder.estimated_elapsed_minutes,
      },
      aiPredictions: predictions ?? [],
      partnerEstimates: estimates ?? [],
      actual: {
        cost: workOrder.actual_cost,
        laborMinutes: workOrder.actual_labor_minutes,
        elapsedMinutes: actualElapsedMinutes,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load estimate comparison." },
      { status: 500 },
    );
  }
}
