import { NextResponse } from "next/server";

import { getMindfulInventoryAccess } from "@/lib/mindful-inventory/access";

const validStatuses = new Set([
  "requested",
  "booked",
  "awaiting_pickup",
  "in_transit",
  "delayed",
  "delivered",
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
    throw new Error("Transport cost must be zero or greater.");
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

    const { data, error } = await access.supabase
      .from("mindful_inventory_transportation")
      .insert({
        vehicle_id: vehicleId,
        origin_location_id: optionalText(body.originLocationId),
        destination_location_id: optionalText(body.destinationLocationId),
        transporter_partner_id: optionalText(body.transporterPartnerId),
        external_transporter_name: optionalText(body.externalTransporterName),
        contact_name: optionalText(body.contactName),
        contact_phone: optionalText(body.contactPhone),
        status: "requested",
        pickup_scheduled_at: optionalText(body.pickupScheduledAt),
        expected_delivery_at: optionalText(body.expectedDeliveryAt),
        tracking_reference: optionalText(body.trackingReference),
        quoted_cost: nullableNumber(body.quotedCost),
        notes: optionalText(body.notes),
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
      event_type: "transport_requested",
      entity_type: "transportation",
      entity_id: data.id,
      actor_user_id: access.userId,
      summary: "Vehicle transport requested.",
      metadata: {},
    });

    return NextResponse.json({ id: data.id });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to request transportation.",
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
    const transportationId = String(body.transportationId || "").trim();
    const status = String(body.status || "").trim();

    if (!transportationId || !validStatuses.has(status)) {
      return NextResponse.json(
        { error: "Valid transport id and status are required." },
        { status: 400 },
      );
    }

    const { data: existing } = await access.supabase
      .from("mindful_inventory_transportation")
      .select(
        "id,external_transporter_name,transporter_partner_id,actual_pickup_at,actual_delivery_at",
      )
      .eq("id", transportationId)
      .eq("vehicle_id", vehicleId)
      .maybeSingle();

    if (!existing) {
      return NextResponse.json(
        { error: "Transportation record not found." },
        { status: 404 },
      );
    }

    if (
      status !== "requested" &&
      status !== "cancelled" &&
      !existing.external_transporter_name &&
      !existing.transporter_partner_id
    ) {
      return NextResponse.json(
        {
          error:
            "Assign a transporter before advancing this transport request.",
        },
        { status: 400 },
      );
    }

    const now = new Date().toISOString();
    const updates: Record<string, unknown> = {
      status,
      updated_by: access.userId,
      updated_at: now,
    };

    if (status === "in_transit" && !existing.actual_pickup_at) {
      updates.actual_pickup_at = now;
    }

    if (status === "delivered" && !existing.actual_delivery_at) {
      updates.actual_delivery_at = now;
    }

    const { error } = await access.supabase
      .from("mindful_inventory_transportation")
      .update(updates)
      .eq("id", transportationId)
      .eq("vehicle_id", vehicleId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await access.supabase.from("mindful_inventory_history").insert({
      company_id: access.company.companyId,
      vehicle_id: vehicleId,
      event_type: "transport_status_updated",
      entity_type: "transportation",
      entity_id: transportationId,
      actor_user_id: access.userId,
      summary: `Transport ${status.replaceAll("_", " ")}.`,
      metadata: { status },
    });

    return NextResponse.json({ id: transportationId, status });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to update transportation.",
      },
      { status: 500 },
    );
  }
}
