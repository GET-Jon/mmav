import { NextResponse } from "next/server";

import { getMindfulInventoryAccess } from "@/lib/mindful-inventory/access";

function optionalText(value: unknown) {
  const clean = String(value ?? "").trim();
  return clean || null;
}

function nullableNonNegativeInteger(value: unknown, label: string) {
  if (value === null || value === undefined || value === "") return null;
  const cleaned = typeof value === "string" ? value.replace(/[^0-9-]/g, "") : value;
  const parsed = Number(cleaned);
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`${label} must be a non-negative whole number.`);
  return parsed;
}

function nullableGrade(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const clean = String(value).toLowerCase();
  if (!["a", "b", "c", "d", "e"].includes(clean)) throw new Error("Invalid preliminary grade.");
  return clean;
}

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
    const status = body.status === "complete" ? "complete" : "draft";
    const now = new Date().toISOString();

    const row = {
      vehicle_id: vehicleId,
      performed_by_user_id: access.userId,
      status,
      started_at: now,
      completed_at: status === "complete" ? now : null,
      mileage: nullableNonNegativeInteger(body.mileage, "Mileage"),
      keys_count: nullableNonNegativeInteger(body.keysCount, "Keys count"),
      visible_damage_summary: optionalText(body.visibleDamageSummary),
      initial_observations: optionalText(body.initialObservations),
      preliminary_grade: nullableGrade(body.preliminaryGrade),
      updated_at: now,
    };

    const { data, error } = await access.supabase
      .from("mindful_inventory_intakes")
      .upsert(row, { onConflict: "vehicle_id" })
      .select("id,status,completed_at")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await access.supabase.from("mindful_inventory_history").insert({
      company_id: access.company.companyId,
      vehicle_id: vehicleId,
      event_type: status === "complete" ? "intake_completed" : "intake_saved",
      entity_type: "intake",
      entity_id: data.id,
      actor_user_id: access.userId,
      summary: status === "complete" ? "Purchaser intake completed." : "Purchaser intake saved.",
      metadata: { status },
    });

    return NextResponse.json({ id: data.id, status: data.status, completedAt: data.completed_at });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to save purchaser intake." }, { status: 500 });
  }
}
