import { NextResponse } from "next/server";

import { getMindfulInventoryAccess } from "@/lib/mindful-inventory/access";

const validStatuses = new Set([
  "needed",
  "ordered",
  "backordered",
  "received",
  "installed",
  "cancelled",
]);

const validSourceTypes = new Set([
  "official_retailer",
  "parts_retailer",
  "marketplace",
  "local_supplier",
  "other",
]);

function optionalText(value: unknown) {
  const clean = String(value ?? "").trim();
  return clean || null;
}

function optionalSourceType(value: unknown) {
  const clean = String(value ?? "").trim();
  if (!clean) return null;
  if (!validSourceTypes.has(clean)) {
    throw new Error("Invalid part source type.");
  }
  return clean;
}

function nullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error("Cost must be zero or greater.");
  }
  return parsed;
}

async function getVehicle(
  access: NonNullable<Awaited<ReturnType<typeof getMindfulInventoryAccess>>>,
  vehicleId: string,
) {
  const { data } = await access.supabase
    .from("mindful_inventory_vehicles")
    .select("id")
    .eq("id", vehicleId)
    .eq("company_id", access.company.companyId)
    .maybeSingle();

  return data;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const access = await getMindfulInventoryAccess();
    if (!access) {
      return NextResponse.json(
        { error: "Mindful Inventory access denied." },
        { status: 403 },
      );
    }

    const { id } = await context.params;
    const vehicleId = String(id || "").trim();

    if (!(await getVehicle(access, vehicleId))) {
      return NextResponse.json(
        { error: "Inventory vehicle not found." },
        { status: 404 },
      );
    }

    const body = (await request.json()) as Record<string, unknown>;
    const workOrderId = String(body.workOrderId || "").trim();
    const description = String(body.description || "").trim();

    if (!workOrderId) {
      return NextResponse.json(
        { error: "Work Order is required." },
        { status: 400 },
      );
    }

    if (!description) {
      return NextResponse.json(
        { error: "Part description is required." },
        { status: 400 },
      );
    }

    const { data: workOrder } = await access.supabase
      .from("mindful_inventory_work_orders")
      .select("id,title")
      .eq("id", workOrderId)
      .eq("vehicle_id", vehicleId)
      .maybeSingle();

    if (!workOrder) {
      return NextResponse.json(
        { error: "Work Order not found for this vehicle." },
        { status: 404 },
      );
    }

    const quantity = Number(body.quantity || 1);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return NextResponse.json(
        { error: "Quantity must be greater than zero." },
        { status: 400 },
      );
    }

    const expectedArrival = optionalText(body.etaAt);
    const { data, error } = await access.supabase
      .from("mindful_inventory_work_order_parts")
      .insert({
        work_order_id: workOrderId,
        description,
        quantity,
        supplier: optionalText(body.supplier),
        source_type: optionalSourceType(body.sourceType),
        source_url: optionalText(body.sourceUrl),
        part_number: optionalText(body.partNumber),
        supplier_reference: optionalText(body.supplierReference),
        quoted_unit_price: nullableNumber(body.quotedUnitPrice),
        actual_unit_price: nullableNumber(body.actualUnitPrice),
        shipping_cost: nullableNumber(body.shippingCost),
        tracking_reference: optionalText(body.trackingReference),
        eta_at: expectedArrival,
        notes: optionalText(body.notes),
        status: "needed",
        created_by: access.userId,
        updated_by: access.userId,
      })
      .select("id")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await access.supabase.from("mindful_inventory_history").insert({
      company_id: access.company.companyId,
      vehicle_id: vehicleId,
      event_type: "part_added",
      entity_type: "work_order_part",
      entity_id: data.id,
      actor_user_id: access.userId,
      summary: `Part added for ${workOrder.title}: ${description}`,
      metadata: {
        workOrderId,
        supplier: optionalText(body.supplier),
        sourceType: optionalSourceType(body.sourceType),
        expectedArrival,
      },
    });

    return NextResponse.json({ id: data.id });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to add part.",
      },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const access = await getMindfulInventoryAccess();
    if (!access) {
      return NextResponse.json(
        { error: "Mindful Inventory access denied." },
        { status: 403 },
      );
    }

    const { id } = await context.params;
    const vehicleId = String(id || "").trim();

    if (!(await getVehicle(access, vehicleId))) {
      return NextResponse.json(
        { error: "Inventory vehicle not found." },
        { status: 404 },
      );
    }

    const body = (await request.json()) as Record<string, unknown>;
    const partId = String(body.partId || "").trim();
    const status = body.status === undefined ? null : String(body.status || "").trim();

    if (!partId) {
      return NextResponse.json(
        { error: "Part id is required." },
        { status: 400 },
      );
    }
    if (status !== null && !validStatuses.has(status)) {
      return NextResponse.json(
        { error: "A valid part status is required." },
        { status: 400 },
      );
    }

    const { data: part } = await access.supabase
      .from("mindful_inventory_work_order_parts")
      .select("id,work_order_id,description")
      .eq("id", partId)
      .maybeSingle();

    if (!part) {
      return NextResponse.json(
        { error: "Part not found." },
        { status: 404 },
      );
    }

    const { data: workOrder } = await access.supabase
      .from("mindful_inventory_work_orders")
      .select("id")
      .eq("id", part.work_order_id)
      .eq("vehicle_id", vehicleId)
      .maybeSingle();

    if (!workOrder) {
      return NextResponse.json(
        { error: "Part does not belong to this vehicle." },
        { status: 403 },
      );
    }

    const now = new Date().toISOString();
    const updates: Record<string, unknown> = {
      updated_by: access.userId,
      updated_at: now,
    };

    if (status !== null) {
      updates.status = status;
      if (status === "ordered") updates.ordered_at = now;
      if (status === "received") updates.received_at = now;
      if (status === "installed") updates.installed_at = now;
    }
    if (body.supplier !== undefined) updates.supplier = optionalText(body.supplier);
    if (body.sourceType !== undefined) updates.source_type = optionalSourceType(body.sourceType);
    if (body.sourceUrl !== undefined) updates.source_url = optionalText(body.sourceUrl);
    if (body.partNumber !== undefined) updates.part_number = optionalText(body.partNumber);
    if (body.supplierReference !== undefined) updates.supplier_reference = optionalText(body.supplierReference);
    if (body.quotedUnitPrice !== undefined) updates.quoted_unit_price = nullableNumber(body.quotedUnitPrice);
    if (body.actualUnitPrice !== undefined) updates.actual_unit_price = nullableNumber(body.actualUnitPrice);
    if (body.shippingCost !== undefined) updates.shipping_cost = nullableNumber(body.shippingCost);
    if (body.trackingReference !== undefined) updates.tracking_reference = optionalText(body.trackingReference);
    if (body.etaAt !== undefined) updates.eta_at = optionalText(body.etaAt);
    if (body.notes !== undefined) updates.notes = optionalText(body.notes);

    const { error } = await access.supabase
      .from("mindful_inventory_work_order_parts")
      .update(updates)
      .eq("id", partId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await access.supabase.from("mindful_inventory_history").insert({
      company_id: access.company.companyId,
      vehicle_id: vehicleId,
      event_type: status ? "part_status_updated" : "part_updated",
      entity_type: "work_order_part",
      entity_id: partId,
      actor_user_id: access.userId,
      summary: status
        ? `${part.description}: ${status.replaceAll("_", " ")}`
        : `${part.description}: part details updated`,
      metadata: {
        ...(status ? { status } : {}),
        ...(body.etaAt !== undefined ? { expectedArrival: optionalText(body.etaAt) } : {}),
        ...(body.trackingReference !== undefined ? { trackingReference: optionalText(body.trackingReference) } : {}),
        ...(body.supplier !== undefined ? { supplier: optionalText(body.supplier) } : {}),
      },
    });

    return NextResponse.json({ id: partId, status });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to update part.",
      },
      { status: 500 },
    );
  }
}
