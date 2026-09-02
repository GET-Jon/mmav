import { NextResponse } from "next/server";

import { getMindfulInventoryAccess } from "@/lib/mindful-inventory/access";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const access = await getMindfulInventoryAccess();
    if (!access) return NextResponse.json({ error: "Mindful Inventory access denied." }, { status: 403 });

    const { id } = await context.params;
    const vehicleId = String(id || "").trim();
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const workOrderId = String(body.workOrderId || "").trim();
    const action = String(body.action || "").trim();
    if (!workOrderId) return NextResponse.json({ error: "Work Order id is required." }, { status: 400 });
    if (!["no_parts_required", "reopen"].includes(action)) return NextResponse.json({ error: "Invalid parts review action." }, { status: 400 });

    const { data: work, error: workError } = await access.supabase
      .from("mindful_inventory_work_orders")
      .select("id,title,vehicle_id,parts_review_status")
      .eq("id", workOrderId)
      .eq("vehicle_id", vehicleId)
      .maybeSingle();
    if (workError) throw new Error(workError.message);
    if (!work) return NextResponse.json({ error: "Work Order not found for this vehicle." }, { status: 404 });

    const { data: vehicle } = await access.supabase
      .from("mindful_inventory_vehicles")
      .select("id")
      .eq("id", vehicleId)
      .eq("company_id", access.company.companyId)
      .maybeSingle();
    if (!vehicle) return NextResponse.json({ error: "Inventory vehicle not found." }, { status: 404 });

    if (action === "no_parts_required") {
      const { count, error: countError } = await access.supabase
        .from("mindful_inventory_work_order_parts")
        .select("id", { count: "exact", head: true })
        .eq("work_order_id", workOrderId)
        .neq("status", "cancelled");
      if (countError) throw new Error(countError.message);
      if ((count || 0) > 0) {
        return NextResponse.json({ error: "Resolve the tracked part dependencies before completing Parts Review." }, { status: 409 });
      }
    }

    const now = new Date().toISOString();
    const resolved = action === "no_parts_required";
    const { error: updateError } = await access.supabase
      .from("mindful_inventory_work_orders")
      .update({
        parts_review_status: resolved ? "resolved" : "pending",
        parts_reviewed_at: resolved ? now : null,
        parts_reviewed_by_user_id: resolved ? access.userId : null,
        updated_by: access.userId,
        updated_at: now,
      })
      .eq("id", workOrderId);
    if (updateError) throw new Error(updateError.message);

    await access.supabase.from("mindful_inventory_history").insert({
      company_id: access.company.companyId,
      vehicle_id: vehicleId,
      event_type: resolved ? "work_order_parts_review_resolved" : "work_order_parts_review_reopened",
      entity_type: "work_order",
      entity_id: workOrderId,
      actor_user_id: access.userId,
      summary: resolved ? `${work.title}: confirmed no parts required.` : `${work.title}: Parts Review reopened.`,
      metadata: { action },
    });

    return NextResponse.json({ workOrderId, partsReviewStatus: resolved ? "resolved" : "pending" });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to update Parts Review." }, { status: 500 });
  }
}
