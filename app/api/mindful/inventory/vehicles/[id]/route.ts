import { NextResponse } from "next/server";

import { getMindfulInventoryAccess } from "@/lib/mindful-inventory/access";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

const allowedStages = new Set([
  "purchased",
  "awaiting_transport",
  "received",
  "inspection",
  "work_scoping",
  "parts_ordered",
  "in_service",
  "awaiting_detail",
  "ready_for_sale",
  "listed",
  "sale_pending",
  "sold",
  "blocked",
]);

const allowedTitleStatuses = new Set([
  "unknown",
  "awaiting",
  "received",
  "issue",
  "not_applicable",
]);

function optionalText(value: unknown) {
  const clean = String(value ?? "").trim();
  return clean || null;
}

function requiredStatus(
  value: unknown,
  allowed: Set<string>,
  label: string,
) {
  const clean = String(value ?? "").trim();

  if (!allowed.has(clean)) {
    throw new Error(`Invalid ${label}.`);
  }

  return clean;
}

function nonNegativeMoney(value: unknown, label: string) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${label} must be zero or greater.`);
  }

  return parsed;
}

function nullableMoney(value: unknown, label: string) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  return nonNegativeMoney(value, label);
}

function nullableDate(value: unknown) {
  const clean = String(value ?? "").trim();

  if (!clean) {
    return null;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    throw new Error("Invalid date.");
  }

  return clean;
}

export async function PATCH(
  request: Request,
  context: {
    params: Promise<{ id: string }>;
  },
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

    if (!vehicleId) {
      return NextResponse.json(
        { error: "Inventory vehicle id is required." },
        { status: 400 },
      );
    }

    const body = await request.json();

    const updateRow = {
      purchase_price: nonNegativeMoney(
        body.purchasePrice,
        "Purchase price",
      ),
      buyer_fees: nonNegativeMoney(
        body.buyerFees,
        "Buyer fees",
      ),
      transport_cost: nonNegativeMoney(
        body.transportCost,
        "Transport cost",
      ),
      other_acquisition_cost: nonNegativeMoney(
        body.otherAcquisitionCost,
        "Other acquisition cost",
      ),

      stage: requiredStatus(
        body.stage,
        allowedStages,
        "vehicle stage",
      ),

      current_location: optionalText(body.currentLocation),

      title_status: requiredStatus(
        body.titleStatus,
        allowedTitleStatuses,
        "title status",
      ),

      target_ready_date: nullableDate(body.targetReadyDate),

      expected_sale_price: nullableMoney(
        body.expectedSalePrice,
        "Expected sale price",
      ),

      next_action: optionalText(body.nextAction),
      next_action_owner: optionalText(body.nextActionOwner),
      next_action_due_date: nullableDate(
        body.nextActionDueDate,
      ),

      notes: optionalText(body.notes),

      updated_by: access.userId,
      updated_at: new Date().toISOString(),
    };

    const supabase = createSupabaseAdminClient();

    const { data, error } = await supabase
      .from("mindful_inventory_vehicles")
      .update(updateRow)
      .eq("id", vehicleId)
      .eq("company_id", access.company.companyId)
      .select("id, updated_at")
      .single();

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 },
      );
    }

    const { error: activityError } = await supabase
      .from("mindful_inventory_activity")
      .insert({
        inventory_vehicle_id: vehicleId,
        action: "vehicle_updated",
        description: "Inventory vehicle details updated.",
        actor_user_id: access.userId,
        metadata: {
          stage: updateRow.stage,
          currentLocation: updateRow.current_location,
        },
      });

    if (activityError) {
      console.error(
        "Inventory activity insert failed:",
        activityError.message,
      );
    }

    return NextResponse.json({
      id: data.id,
      updatedAt: data.updated_at,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to update Inventory vehicle.",
      },
      { status: 500 },
    );
  }
}
