import { NextResponse } from "next/server";

import { getMindfulInventoryAccess } from "@/lib/mindful-inventory/access";

const resolutions = new Set([
  "in_stock",
  "purchased",
  "partner_supplied",
  "customer_supplied",
  "not_required",
]);

const statusForResolution: Record<string, string> = {
  in_stock: "received",
  purchased: "ordered",
  partner_supplied: "received",
  customer_supplied: "received",
  not_required: "cancelled",
};

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const access = await getMindfulInventoryAccess();
    if (!access) {
      return NextResponse.json({ error: "Mindful Inventory access denied." }, { status: 403 });
    }

    const { id } = await context.params;
    const vehicleId = String(id || "").trim();
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const partId = String(body.partId || "").trim();
    const resolution = String(body.resolution || "").trim();

    if (!partId) return NextResponse.json({ error: "Part id is required." }, { status: 400 });
    if (!resolutions.has(resolution)) {
      return NextResponse.json({ error: "Choose a valid dependency resolution." }, { status: 400 });
    }

    const { data: part, error: partError } = await access.supabase
      .from("mindful_inventory_work_order_parts")
      .select("id,work_order_id,description,status")
      .eq("id", partId)
      .maybeSingle();
    if (partError) throw new Error(partError.message);
    if (!part) return NextResponse.json({ error: "Part not found." }, { status: 404 });

    const { data: work, error: workError } = await access.supabase
      .from("mindful_inventory_work_orders")
      .select("id,title,vehicle_id")
      .eq("id", part.work_order_id)
      .eq("vehicle_id", vehicleId)
      .maybeSingle();
    if (workError) throw new Error(workError.message);
    if (!work) return NextResponse.json({ error: "Part does not belong to this vehicle." }, { status: 403 });

    const { data: vehicle } = await access.supabase
      .from("mindful_inventory_vehicles")
      .select("id")
      .eq("id", vehicleId)
      .eq("company_id", access.company.companyId)
      .maybeSingle();
    if (!vehicle) return NextResponse.json({ error: "Inventory vehicle not found." }, { status: 404 });

    const now = new Date().toISOString();
    const nextStatus = statusForResolution[resolution];
    const patch: Record<string, unknown> = {
      dependency_resolution: resolution,
      dependency_resolved_at: now,
      dependency_resolved_by: access.userId,
      status: nextStatus,
      updated_by: access.userId,
      updated_at: now,
    };

    if (resolution === "purchased") patch.ordered_at = now;
    if (["in_stock", "partner_supplied", "customer_supplied"].includes(resolution)) patch.received_at = now;

    const { error: updateError } = await access.supabase
      .from("mindful_inventory_work_order_parts")
      .update(patch)
      .eq("id", partId);
    if (updateError) throw new Error(updateError.message);

    await access.supabase.from("mindful_inventory_history").insert({
      company_id: access.company.companyId,
      vehicle_id: vehicleId,
      event_type: "part_dependency_resolved",
      entity_type: "work_order_part",
      entity_id: partId,
      actor_user_id: access.userId,
      summary: `${part.description}: dependency resolved as ${resolution.replaceAll("_", " ")}.`,
      metadata: {
        workOrderId: work.id,
        workOrderTitle: work.title,
        previousStatus: part.status,
        resolution,
        status: nextStatus,
      },
    });

    return NextResponse.json({ id: partId, resolution, status: nextStatus });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to resolve part dependency." },
      { status: 500 },
    );
  }
}
