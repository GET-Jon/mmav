import { NextResponse } from "next/server";

import { getMindfulInventoryAccess } from "@/lib/mindful-inventory/access";

function optionalText(value: unknown) {
  const clean = String(value ?? "").trim();
  return clean || null;
}

function nullableNonNegativeNumber(value: unknown, label: string) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${label} must be zero or greater.`);
  return parsed;
}

function positiveNumber(value: unknown, label: string, fallback = 1) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${label} must be greater than zero.`);
  return parsed;
}

function upgradeValues(body: Record<string, unknown>) {
  const title = String(body.title || "").trim();
  if (!title) throw new Error("Upgrade name is required.");

  const estimatedPartsCost = nullableNonNegativeNumber(body.estimatedPartsCost, "Estimated parts cost");
  const estimatedLaborCost = nullableNonNegativeNumber(body.estimatedLaborCost, "Estimated labor cost");
  const explicitTotal = nullableNonNegativeNumber(body.estimatedTotalCost, "Estimated total cost");
  const estimatedTotalCost = explicitTotal ?? (
    estimatedPartsCost !== null || estimatedLaborCost !== null
      ? (estimatedPartsCost || 0) + (estimatedLaborCost || 0)
      : null
  );

  return {
    title,
    description: optionalText(body.description),
    category: optionalText(body.category) || "other",
    desired_outcome: optionalText(body.desiredOutcome),
    manufacturer: optionalText(body.manufacturer),
    part_number: optionalText(body.partNumber),
    quantity: positiveNumber(body.quantity, "Quantity"),
    preferred_vendor: optionalText(body.preferredVendor),
    product_url: optionalText(body.productUrl),
    substitutes_allowed: body.substitutesAllowed !== false,
    estimated_parts_cost: estimatedPartsCost,
    estimated_labor_cost: estimatedLaborCost,
    estimated_total_cost: estimatedTotalCost,
    notes: optionalText(body.notes),
  };
}

async function getVehicle(access: NonNullable<Awaited<ReturnType<typeof getMindfulInventoryAccess>>>, vehicleId: string) {
  const { data, error } = await access.supabase
    .from("mindful_inventory_vehicles")
    .select("id")
    .eq("id", vehicleId)
    .eq("company_id", access.company.companyId)
    .single();

  return error || !data ? null : data;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const access = await getMindfulInventoryAccess();
    if (!access) return NextResponse.json({ error: "Mindful Inventory access denied." }, { status: 403 });

    const { id } = await context.params;
    const vehicleId = String(id || "").trim();
    if (!(await getVehicle(access, vehicleId))) return NextResponse.json({ error: "Inventory vehicle not found." }, { status: 404 });

    const body = await request.json() as Record<string, unknown>;
    const values = upgradeValues(body);

    const { data, error } = await access.supabase
      .from("mindful_inventory_upgrades")
      .insert({
        company_id: access.company.companyId,
        vehicle_id: vehicleId,
        requested_by_user_id: access.userId,
        ...values,
        status: "proposed",
        created_by: access.userId,
        updated_by: access.userId,
      })
      .select("id")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await access.supabase.from("mindful_inventory_history").insert({
      company_id: access.company.companyId,
      vehicle_id: vehicleId,
      event_type: "upgrade_proposed",
      entity_type: "upgrade",
      entity_id: data.id,
      actor_user_id: access.userId,
      summary: `Upgrade proposed: ${values.title}`,
      metadata: { estimatedTotalCost: values.estimated_total_cost },
    });

    return NextResponse.json({ id: data.id });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to add upgrade." }, { status: 500 });
  }
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
    if (!(await getVehicle(access, vehicleId))) return NextResponse.json({ error: "Inventory vehicle not found." }, { status: 404 });

    const body = await request.json() as Record<string, unknown>;
    const upgradeId = String(body.upgradeId || "").trim();
    if (!upgradeId) return NextResponse.json({ error: "Upgrade id is required." }, { status: 400 });

    const values = upgradeValues(body);
    const { data, error } = await access.supabase
      .from("mindful_inventory_upgrades")
      .update({
        ...values,
        updated_by: access.userId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", upgradeId)
      .eq("vehicle_id", vehicleId)
      .eq("company_id", access.company.companyId)
      .eq("status", "proposed")
      .select("id")
      .single();

    if (error || !data) return NextResponse.json({ error: error?.message || "Upgrade not found." }, { status: 404 });

    await access.supabase.from("mindful_inventory_history").insert({
      company_id: access.company.companyId,
      vehicle_id: vehicleId,
      event_type: "upgrade_updated",
      entity_type: "upgrade",
      entity_id: upgradeId,
      actor_user_id: access.userId,
      summary: `Upgrade updated: ${values.title}`,
      metadata: { estimatedTotalCost: values.estimated_total_cost },
    });

    return NextResponse.json({ id: upgradeId });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to update upgrade." }, { status: 500 });
  }
}
