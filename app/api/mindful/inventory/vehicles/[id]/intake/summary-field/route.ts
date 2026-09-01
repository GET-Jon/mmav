import { NextResponse } from "next/server";

import { getMindfulInventoryAccess } from "@/lib/mindful-inventory/access";

const numericFields = {
  purchase_mileage: "mileage",
  purchase_price: "purchase_price",
  buyer_fees: "buyer_fees",
  transport_cost: "transport_cost",
  other_acquisition: "other_acquisition_cost",
} as const;

type SummaryField = keyof typeof numericFields;

function parseNonNegativeNumber(value: unknown, field: string) {
  const cleaned = String(value ?? "").replace(/[^0-9.-]/g, "").trim();
  if (!cleaned) throw new Error(`${field} is required.`);
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${field} must be a non-negative number.`);
  return parsed;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const access = await getMindfulInventoryAccess();
    if (!access) return NextResponse.json({ error: "Mindful Inventory access denied." }, { status: 403 });

    const { id } = await context.params;
    const vehicleId = String(id || "").trim();
    if (!vehicleId) return NextResponse.json({ error: "Inventory vehicle id is required." }, { status: 400 });

    const body = await request.json();
    const field = String(body.field || "").trim() as SummaryField;
    const column = numericFields[field];
    if (!column) return NextResponse.json({ error: "Unsupported Intake summary field." }, { status: 400 });

    const value = parseNonNegativeNumber(body.value, field);

    const { data: vehicle, error: vehicleError } = await access.supabase
      .from("mindful_inventory_vehicles")
      .select("id")
      .eq("id", vehicleId)
      .eq("company_id", access.company.companyId)
      .single();

    if (vehicleError || !vehicle) return NextResponse.json({ error: "Inventory vehicle not found." }, { status: 404 });

    const updateRow = {
      [column]: value,
      updated_by: access.userId,
      updated_at: new Date().toISOString(),
    };

    const { error } = await access.supabase
      .from("mindful_inventory_vehicles")
      .update(updateRow as never)
      .eq("id", vehicleId)
      .eq("company_id", access.company.companyId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await access.supabase.from("mindful_inventory_history").insert({
      company_id: access.company.companyId,
      vehicle_id: vehicleId,
      event_type: "intake_summary_corrected",
      entity_type: "vehicle",
      entity_id: vehicleId,
      actor_user_id: access.userId,
      summary: `Intake corrected ${field}.`,
      metadata: { field, value },
    });

    return NextResponse.json({ field, value });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update Intake summary field." },
      { status: 500 },
    );
  }
}
