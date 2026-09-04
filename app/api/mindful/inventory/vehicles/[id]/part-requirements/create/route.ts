import { NextResponse } from "next/server";

import { getMindfulInventoryAccess } from "@/lib/mindful-inventory/access";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const access = await getMindfulInventoryAccess();
    if (!access) return NextResponse.json({ error: "Mindful Inventory access denied." }, { status: 403 });
    const { id } = await context.params;
    const vehicleId = String(id || "").trim();
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const workOrderId = String(body.workOrderId || "").trim();
    const description = String(body.description || "").trim();
    const fitmentQuery = String(body.fitmentQuery || "").trim() || null;
    const quantity = Number(body.quantity || 1);
    if (!workOrderId || !description) return NextResponse.json({ error: "Work Order and part description are required." }, { status: 400 });
    if (!Number.isFinite(quantity) || quantity <= 0) return NextResponse.json({ error: "Quantity must be greater than zero." }, { status: 400 });

    const { data: work, error: workError } = await access.supabase
      .from("mindful_inventory_work_orders")
      .select("id,vehicle_id,plan_item_id")
      .eq("id", workOrderId)
      .eq("vehicle_id", vehicleId)
      .maybeSingle();
    if (workError) throw new Error(workError.message);
    if (!work) return NextResponse.json({ error: "Work Order not found." }, { status: 404 });

    const { data: vehicle } = await access.supabase
      .from("mindful_inventory_vehicles")
      .select("id")
      .eq("id", vehicleId)
      .eq("company_id", access.company.companyId)
      .maybeSingle();
    if (!vehicle) return NextResponse.json({ error: "Inventory vehicle not found." }, { status: 404 });

    const { data: existing, error: existingError } = await access.supabase
      .from("mindful_inventory_part_requirements")
      .select("id")
      .eq("work_order_id", work.id)
      .ilike("description", description)
      .limit(1)
      .maybeSingle();
    if (existingError) throw new Error(existingError.message);
    if (existing) return NextResponse.json({ id: existing.id, created: false });

    const { data: requirement, error } = await access.supabase
      .from("mindful_inventory_part_requirements")
      .insert({
        company_id: access.company.companyId,
        vehicle_id: vehicleId,
        plan_item_id: work.plan_item_id,
        work_order_id: work.id,
        description,
        quantity,
        origin: "ai",
        requirement_status: "suggested",
        fitment_query: fitmentQuery,
        blocking: true,
        created_by: access.userId,
        updated_by: access.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    await access.supabase.from("mindful_inventory_part_requirement_messages").insert({
      requirement_id: requirement.id,
      actor_type: "system",
      message_type: "note",
      body: "Lot Logic suggested this part as a starting point. Verify exact fitment before ordering.",
    });

    return NextResponse.json({ id: requirement.id, created: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to create part requirement." }, { status: 500 });
  }
}
