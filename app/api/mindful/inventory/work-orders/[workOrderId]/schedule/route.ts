import { NextResponse } from "next/server";

import { getMindfulInventoryAccess } from "@/lib/mindful-inventory/access";

function parseDateTime(value: unknown) {
  const clean = String(value ?? "").trim();
  if (!clean) return null;
  const date = new Date(clean);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function PATCH(request: Request, context: { params: Promise<{ workOrderId: string }> }) {
  try {
    const access = await getMindfulInventoryAccess();
    if (!access) return NextResponse.json({ error: "Mindful Inventory access denied." }, { status: 403 });

    const { workOrderId } = await context.params;
    const body = await request.json();
    const start = parseDateTime(body.scheduledStartAt);
    if (!start) return NextResponse.json({ error: "A valid scheduled start is required." }, { status: 400 });

    const { data: existing, error: existingError } = await access.supabase
      .from("mindful_inventory_work_orders")
      .select("id,vehicle_id,status,estimated_elapsed_minutes,estimated_duration_minutes,assigned_partner_id,assigned_user_id,resource_id")
      .eq("id", workOrderId)
      .single();
    if (existingError || !existing) return NextResponse.json({ error: "Work Order not found." }, { status: 404 });

    const { data: vehicle } = await access.supabase.from("mindful_inventory_vehicles").select("id").eq("id", existing.vehicle_id).eq("company_id", access.company.companyId).single();
    if (!vehicle) return NextResponse.json({ error: "Work Order is outside the current company." }, { status: 403 });

    const duration = Number(existing.estimated_elapsed_minutes ?? existing.estimated_duration_minutes ?? 60);
    const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 60;
    const end = new Date(start.getTime() + safeDuration * 60_000);

    const checks: Array<{ field: string; id: string; label: string }> = [];
    if (existing.assigned_partner_id) checks.push({ field: "assigned_partner_id", id: existing.assigned_partner_id, label: "partner" });
    if (existing.assigned_user_id) checks.push({ field: "assigned_user_id", id: existing.assigned_user_id, label: "team member" });
    if (existing.resource_id) checks.push({ field: "resource_id", id: existing.resource_id, label: "resource" });

    for (const check of checks) {
      const { data: conflicts, error: conflictError } = await access.supabase
        .from("mindful_inventory_work_orders")
        .select("id,title,scheduled_start_at,scheduled_end_at")
        .eq(check.field, check.id)
        .neq("id", workOrderId)
        .not("status", "in", '("complete","cancelled")')
        .lt("scheduled_start_at", end.toISOString())
        .gt("scheduled_end_at", start.toISOString())
        .limit(1);
      if (conflictError) throw new Error(conflictError.message);
      if (conflicts?.length) {
        const conflict = conflicts[0];
        return NextResponse.json({ error: `Schedule conflict: this ${check.label} is already assigned to “${conflict.title}” during that time.` }, { status: 409 });
      }
    }

    const now = new Date().toISOString();
    const { data: updated, error: updateError } = await access.supabase
      .from("mindful_inventory_work_orders")
      .update({ scheduled_start_at: start.toISOString(), scheduled_end_at: end.toISOString(), schedule_source: "manual", status: existing.status === "complete" ? "complete" : "scheduled", updated_by: access.userId, updated_at: now })
      .eq("id", workOrderId)
      .select("id,scheduled_start_at,scheduled_end_at,status,schedule_source")
      .single();
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

    await access.supabase.from("mindful_inventory_history").insert({
      company_id: access.company.companyId, vehicle_id: existing.vehicle_id, event_type: "work_order_scheduled", entity_type: "work_order", entity_id: workOrderId, actor_user_id: access.userId,
      summary: "Work Order schedule manually set or adjusted.",
      metadata: { scheduledStartAt: updated.scheduled_start_at, scheduledEndAt: updated.scheduled_end_at, elapsedMinutes: safeDuration, scheduleSource: "manual" },
    });

    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to schedule Work Order." }, { status: 500 });
  }
}
