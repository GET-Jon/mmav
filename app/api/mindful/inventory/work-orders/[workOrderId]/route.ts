import { NextResponse } from "next/server";

import { getMindfulInventoryAccess } from "@/lib/mindful-inventory/access";

const allowedStatuses = new Set(["planned", "ready_to_schedule", "scheduled", "in_progress", "blocked", "complete", "cancelled"]);

export async function PATCH(
  request: Request,
  context: { params: Promise<{ workOrderId: string }> },
) {
  try {
    const access = await getMindfulInventoryAccess();
    if (!access) return NextResponse.json({ error: "Mindful Inventory access denied." }, { status: 403 });

    const { workOrderId } = await context.params;
    const body = await request.json();
    const status = String(body.status || "").trim();
    const blockerReason = String(body.blockerReason || "").trim() || null;

    if (!allowedStatuses.has(status)) return NextResponse.json({ error: "Invalid Work Order status." }, { status: 400 });
    if (status === "blocked" && !blockerReason) return NextResponse.json({ error: "Blocked Work Orders require a reason." }, { status: 400 });

    const { data: existing, error: existingError } = await access.supabase
      .from("mindful_inventory_work_orders")
      .select("id,vehicle_id,status,actual_start_at")
      .eq("id", workOrderId)
      .single();

    if (existingError || !existing) return NextResponse.json({ error: "Work Order not found." }, { status: 404 });

    const { data: vehicle, error: vehicleError } = await access.supabase
      .from("mindful_inventory_vehicles")
      .select("id")
      .eq("id", existing.vehicle_id)
      .eq("company_id", access.company.companyId)
      .single();

    if (vehicleError || !vehicle) return NextResponse.json({ error: "Work Order is outside the current company." }, { status: 403 });

    const now = new Date().toISOString();
    const patch: Record<string, unknown> = {
      status,
      blocker_reason: status === "blocked" ? blockerReason : null,
      updated_by: access.userId,
      updated_at: now,
    };

    if (status === "in_progress" && !existing.actual_start_at) patch.actual_start_at = now;
    if (status === "complete") {
      patch.actual_start_at = existing.actual_start_at || now;
      patch.actual_end_at = now;
    }

    const { data: updated, error: updateError } = await access.supabase
      .from("mindful_inventory_work_orders")
      .update(patch)
      .eq("id", workOrderId)
      .select("id,status,vehicle_id")
      .single();

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

    await access.supabase.from("mindful_inventory_history").insert({
      company_id: access.company.companyId,
      vehicle_id: existing.vehicle_id,
      event_type: status === "complete" ? "work_order_completed" : "work_order_status_changed",
      entity_type: "work_order",
      entity_id: workOrderId,
      actor_user_id: access.userId,
      summary: status === "complete" ? "Work Order completed." : `Work Order moved to ${status.replaceAll("_", " ")}.`,
      metadata: { previousStatus: existing.status, status },
    });

    if (status === "complete" || status === "cancelled") {
      const { count, error: remainingError } = await access.supabase
        .from("mindful_inventory_work_orders")
        .select("id", { count: "exact", head: true })
        .eq("vehicle_id", existing.vehicle_id)
        .not("status", "in", '("complete","cancelled")');

      if (!remainingError && (count || 0) === 0) {
        await access.supabase
          .from("mindful_inventory_vehicles")
          .update({
            phase: "final_qc",
            next_action: "Complete Final QC",
            next_action_owner_user_id: access.userId,
            updated_by: access.userId,
            updated_at: now,
          })
          .eq("id", existing.vehicle_id)
          .eq("company_id", access.company.companyId);
      }
    }

    return NextResponse.json({ id: updated.id, status: updated.status });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to update Work Order." }, { status: 500 });
  }
}
