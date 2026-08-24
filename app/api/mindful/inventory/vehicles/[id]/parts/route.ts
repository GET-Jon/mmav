import { NextResponse } from "next/server";

import { getMindfulInventoryAccess } from "@/lib/mindful-inventory/access";

const validStatuses = new Set([
  "needed",
  "ordered",
  "backordered",
  "received",
  "cancelled",
]);

function optionalText(value: unknown) {
  const clean = String(value ?? "").trim();
  return clean || null;
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

    const { data, error } = await access.supabase
      .from("mindful_inventory_work_order_parts")
      .insert({
        work_order_id: workOrderId,
        description,
        quantity,
        supplier: optionalText(body.supplier),
        supplier_reference: optionalText(body.supplierReference),
        quoted_unit_price: nullableNumber(body.quotedUnitPrice),
        eta_at: optionalText(body.etaAt),
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
      metadata: { workOrderId },
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
    const status = String(body.status || "").trim();

    if (!partId || !validStatuses.has(status)) {
      return NextResponse.json(
        { error: "Valid part id and status are required." },
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
      status,
      updated_by: access.userId,
      updated_at: now,
    };

    if (status === "ordered") updates.ordered_at = now;
    if (status === "received") updates.received_at = now;

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
      event_type: "part_status_updated",
      entity_type: "work_order_part",
      entity_id: partId,
      actor_user_id: access.userId,
      summary: `${part.description}: ${status.replaceAll("_", " ")}`,
      metadata: { status },
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
