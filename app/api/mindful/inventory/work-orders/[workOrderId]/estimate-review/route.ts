import { NextResponse } from "next/server";

import { getMindfulInventoryAccess } from "@/lib/mindful-inventory/access";

export async function POST(
  request: Request,
  context: { params: Promise<{ workOrderId: string }> },
) {
  try {
    const access = await getMindfulInventoryAccess();
    if (!access) return NextResponse.json({ error: "Mindful Inventory access denied." }, { status: 403 });

    const { workOrderId } = await context.params;
    const body = await request.json().catch(() => ({}));
    const action = String(body.action || "").trim();
    if (action !== "approve" && action !== "request_revision") {
      return NextResponse.json({ error: "Review action must be approve or request_revision." }, { status: 400 });
    }

    const { data: work, error: workError } = await access.supabase
      .from("mindful_inventory_work_orders")
      .select("id,vehicle_id,assigned_partner_id,partner_estimate_status,status")
      .eq("id", workOrderId)
      .maybeSingle();
    if (workError) throw new Error(workError.message);
    if (!work?.assigned_partner_id) return NextResponse.json({ error: "Partner Work Order not found." }, { status: 404 });

    const { data: vehicle } = await access.supabase
      .from("mindful_inventory_vehicles")
      .select("id")
      .eq("id", work.vehicle_id)
      .eq("company_id", access.company.companyId)
      .maybeSingle();
    if (!vehicle) return NextResponse.json({ error: "Work Order is outside the current company." }, { status: 403 });
    if (["in_progress", "complete", "cancelled"].includes(work.status)) {
      return NextResponse.json({ error: "Partner estimate review is closed after work begins." }, { status: 409 });
    }

    const { data: latestEstimate, error: estimateError } = await access.supabase
      .from("lot_logic_partner_blind_estimates")
      .select("id,quoted_cost,revision_no,submitted_at")
      .eq("work_order_id", work.id)
      .eq("partner_id", work.assigned_partner_id)
      .order("revision_no", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (estimateError) throw new Error(estimateError.message);
    if (!latestEstimate) return NextResponse.json({ error: "No partner estimate is available to review." }, { status: 409 });

    const now = new Date().toISOString();
    const approved = action === "approve";
    const { error: updateError } = await access.supabase
      .from("mindful_inventory_work_orders")
      .update({
        partner_estimate_status: approved ? "approved" : "revision_requested",
        approved_partner_estimate_id: approved ? latestEstimate.id : null,
        partner_estimate_reviewed_at: now,
        partner_estimate_reviewed_by: access.userId,
        current_forecast: latestEstimate.quoted_cost,
        updated_by: access.userId,
        updated_at: now,
      })
      .eq("id", work.id);
    if (updateError) throw new Error(updateError.message);

    await access.supabase.from("mindful_inventory_history").insert({
      company_id: access.company.companyId,
      vehicle_id: work.vehicle_id,
      event_type: approved ? "partner_estimate_approved" : "partner_estimate_revision_requested",
      entity_type: "work_order",
      entity_id: work.id,
      actor_user_id: access.userId,
      summary: approved ? "Partner estimate approved." : "Partner estimate revision requested.",
      metadata: {
        estimateId: latestEstimate.id,
        revisionNo: latestEstimate.revision_no,
        quotedCost: latestEstimate.quoted_cost,
      },
    });

    return NextResponse.json({
      workOrderId: work.id,
      estimateId: latestEstimate.id,
      partnerEstimateStatus: approved ? "approved" : "revision_requested",
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Partner estimate could not be reviewed." },
      { status: 500 },
    );
  }
}
