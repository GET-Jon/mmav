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

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const access = await getMindfulInventoryAccess();
    if (!access) return NextResponse.json({ error: "Mindful Inventory access denied." }, { status: 403 });

    const { id } = await context.params;
    const vehicleId = String(id || "").trim();
    const { data: vehicle, error: vehicleError } = await access.supabase
      .from("mindful_inventory_vehicles")
      .select("id")
      .eq("id", vehicleId)
      .eq("company_id", access.company.companyId)
      .single();

    if (vehicleError || !vehicle) return NextResponse.json({ error: "Inventory vehicle not found." }, { status: 404 });

    const body = await request.json();
    const title = String(body.title || "").trim();
    if (!title) return NextResponse.json({ error: "Upgrade name is required." }, { status: 400 });

    const estimatedPartsCost = nullableNonNegativeNumber(body.estimatedPartsCost, "Estimated parts cost");
    const estimatedLaborCost = nullableNonNegativeNumber(body.estimatedLaborCost, "Estimated labor cost");
    const explicitTotal = nullableNonNegativeNumber(body.estimatedTotalCost, "Estimated total cost");
    const estimatedTotalCost = explicitTotal ?? (
      estimatedPartsCost !== null || estimatedLaborCost !== null
        ? (estimatedPartsCost || 0) + (estimatedLaborCost || 0)
        : null
    );

    const { data, error } = await access.supabase
      .from("mindful_inventory_upgrades")
      .insert({
        company_id: access.company.companyId,
        vehicle_id: vehicleId,
        requested_by_user_id: access.userId,
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
      summary: `Upgrade proposed: ${title}`,
      metadata: { estimatedTotalCost },
    });

    return NextResponse.json({ id: data.id });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to add upgrade." }, { status: 500 });
  }
}
