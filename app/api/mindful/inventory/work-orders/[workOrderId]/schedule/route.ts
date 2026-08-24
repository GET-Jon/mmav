import { NextResponse } from "next/server";

import { getMindfulInventoryAccess } from "@/lib/mindful-inventory/access";

function parseDateTime(value: unknown) {
  const clean = String(value ?? "").trim();
  if (!clean) return null;
  const date = new Date(clean);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ workOrderId: string }> },
) {
  try {
    const access = await getMindfulInventoryAccess();
    if (!access) return NextResponse.json({ error: "Mindful Inventory access denied." }, { status: 403 });

    const { workOrderId } = await context.params;
    const body = await request.json();
    const start = parseDateTime(body.scheduledStartAt);
    if (!start) return NextResponse.json({ error: "A valid scheduled start is required." }, { status: 400 });

    const { data: existing, error: existingError } = await access.supabase
      .from("mindful_inventory_work_orders")
      .select("id,vehicle_id,status,estimated_elapsed_minutes,estimated_duration_minutes")
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

    const duration = Number(existing.estimated_elapsed_minutes ?? existing.estimated_duration_minutes ?? 60);
    const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 60;
    const end = new Date(start.getTime() + safeDuration * 60_000);
    const now = new Date().toISOString();

    const { data: updated, error: updateError } = await access.supabase
      .from("mindful_inventory_work_orders")
      .update({
        scheduled_start_at: start.toISOString(),
        scheduled_end_at: end.toISOString(),
        schedule_source: "manual",
        status: existing.status === "complete" ? "complete" : "scheduled",
        updated_by: access.userId,
        updated_at: now,
      })
      .eq("id", workOrderId)
      .select("id,scheduled_start_at,scheduled_end_at,status,schedule_source")
      .single();

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

    await access.supabase.from("mindful_inventory_history").insert({
      company_id: access.company.companyId,
      vehicle_id: existing.vehicle_id,
      event_type: "work_order_scheduled",
      entity_type: "work_order",
      entity_id: workOrderId,
      actor_user_id: access.userId,
      summary: "Work Order schedule manually set or adjusted.",
      metadata: {
        scheduledStartAt: updated.scheduled_start_at,
        scheduledEndAt: updated.scheduled_end_at,
        elapsedMinutes: safeDuration,
        scheduleSource: "manual",
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to schedule Work Order." }, { status: 500 });
  }
}
