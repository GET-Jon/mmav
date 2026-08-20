import { NextResponse } from "next/server";

import { getMindfulInventoryAccess } from "@/lib/mindful-inventory/access";

function optionalText(value: unknown) {
  const clean = String(value ?? "").trim();
  return clean || null;
}

const allowedStatuses = new Set(["draft", "in_progress", "complete", "cancelled"]);

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const access = await getMindfulInventoryAccess();
    if (!access) return NextResponse.json({ error: "Mindful Inventory access denied." }, { status: 403 });

    const { id } = await context.params;
    const vehicleId = String(id || "").trim();
    if (!vehicleId) return NextResponse.json({ error: "Inventory vehicle id is required." }, { status: 400 });

    const { data: vehicle, error: vehicleError } = await access.supabase
      .from("mindful_inventory_vehicles")
      .select("id")
      .eq("id", vehicleId)
      .eq("company_id", access.company.companyId)
      .single();

    if (vehicleError || !vehicle) return NextResponse.json({ error: "Inventory vehicle not found." }, { status: 404 });

    const body = await request.json();
    const status = String(body.status || "draft");
    if (!allowedStatuses.has(status)) return NextResponse.json({ error: "Invalid inspection status." }, { status: 400 });

    const now = new Date().toISOString();
    const { data: existing } = await access.supabase
      .from("mindful_inventory_inspections")
      .select("id,started_at")
      .eq("vehicle_id", vehicleId)
      .eq("inspection_type", "mechanical")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const row = {
      vehicle_id: vehicleId,
      inspection_type: "mechanical",
      performed_by_user_id: access.userId,
      performed_by_partner_id: null,
      status,
      started_at: existing?.started_at || now,
      completed_at: status === "complete" ? now : null,
      summary: optionalText(body.summary),
      updated_at: now,
    };

    const result = existing
      ? await access.supabase
          .from("mindful_inventory_inspections")
          .update(row)
          .eq("id", existing.id)
          .select("id,status,completed_at")
          .single()
      : await access.supabase
          .from("mindful_inventory_inspections")
          .insert(row)
          .select("id,status,completed_at")
          .single();

    if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });

    await access.supabase.from("mindful_inventory_history").insert({
      company_id: access.company.companyId,
      vehicle_id: vehicleId,
      event_type: status === "complete" ? "mechanical_inspection_completed" : "mechanical_inspection_saved",
      entity_type: "inspection",
      entity_id: result.data.id,
      actor_user_id: access.userId,
      summary: status === "complete" ? "Mechanical inspection completed." : "Mechanical inspection saved.",
      metadata: { status },
    });

    return NextResponse.json({ id: result.data.id, status: result.data.status, completedAt: result.data.completed_at });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to save mechanical inspection." }, { status: 500 });
  }
}
