import { NextResponse } from "next/server";

import { getMindfulInventoryAccess } from "@/lib/mindful-inventory/access";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

const allowedCategories = new Set([
  "mechanical",
  "maintenance",
  "tires_wheels",
  "cosmetic",
  "interior",
  "detailing",
  "transportation",
  "title_registration",
  "inspection",
  "photography_listing",
  "other",
]);

const allowedPriorities = new Set([
  "required",
  "recommended",
  "optional",
]);

const allowedStatuses = new Set([
  "not_started",
  "awaiting_approval",
  "approved",
  "scheduled",
  "in_progress",
  "complete",
  "cancelled",
]);

function requiredText(value: unknown, label: string) {
  const clean = String(value ?? "").trim();

  if (!clean) {
    throw new Error(`${label} is required.`);
  }

  return clean;
}

function optionalText(value: unknown) {
  const clean = String(value ?? "").trim();
  return clean || null;
}

function requiredOption(
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

async function getAuthorizedWorkItem(
  workItemId: string,
  companyId: string,
) {
  const supabase = createSupabaseAdminClient();

  const {
    data: workItem,
    error: workItemError,
  } = await supabase
    .from("mindful_inventory_work_items")
    .select("id, inventory_vehicle_id")
    .eq("id", workItemId)
    .maybeSingle();

  if (workItemError) {
    throw new Error(
      `Work-item lookup failed: ${workItemError.message}`,
    );
  }

  if (!workItem?.inventory_vehicle_id) {
    return null;
  }

  const {
    data: vehicle,
    error: vehicleError,
  } = await supabase
    .from("mindful_inventory_vehicles")
    .select("id, company_id")
    .eq("id", workItem.inventory_vehicle_id)
    .eq("company_id", companyId)
    .maybeSingle();

  if (vehicleError) {
    throw new Error(
      `Inventory vehicle lookup failed: ${vehicleError.message}`,
    );
  }

  if (!vehicle) {
    return null;
  }

  return {
    supabase,
    workItem: {
      id: workItem.id,
      inventory_vehicle_id:
        workItem.inventory_vehicle_id,
    },
  };
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
    const workItemId = String(id || "").trim();

    const authorization = await getAuthorizedWorkItem(
      workItemId,
      access.company.companyId,
    );

    if (!authorization) {
      return NextResponse.json(
        { error: "Work item not found." },
        { status: 404 },
      );
    }

    const body = await request.json();

    const status = requiredOption(
      body.status,
      allowedStatuses,
      "work-item status",
    );

    const updateRow = {
      description: requiredText(
        body.description,
        "Description",
      ),
      category: requiredOption(
        body.category,
        allowedCategories,
        "work-item category",
      ),
      priority: requiredOption(
        body.priority,
        allowedPriorities,
        "work-item priority",
      ),
      status,
      vendor: optionalText(body.vendor),
      estimated_cost: nonNegativeMoney(
        body.estimatedCost,
        "Estimated cost",
      ),
      actual_cost: nullableMoney(
        body.actualCost,
        "Actual cost",
      ),
      scheduled_date: nullableDate(body.scheduledDate),
      completed_date:
        status === "complete"
          ? nullableDate(body.completedDate) ??
            new Date().toISOString().slice(0, 10)
          : nullableDate(body.completedDate),
      requires_approval: Boolean(body.requiresApproval),
      approved_at:
        status === "approved" ||
        status === "scheduled" ||
        status === "in_progress" ||
        status === "complete"
          ? new Date().toISOString()
          : null,
      notes: optionalText(body.notes),
      updated_by: access.userId,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await authorization.supabase
      .from("mindful_inventory_work_items")
      .update(updateRow)
      .eq("id", workItemId)
      .select(
        `
        id,
        inventory_vehicle_id,
        description,
        category,
        priority,
        status,
        vendor,
        estimated_cost,
        actual_cost,
        scheduled_date,
        completed_date,
        requires_approval,
        notes
      `,
      )
      .single();

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 },
      );
    }

    await authorization.supabase
      .from("mindful_inventory_activity")
      .insert({
        inventory_vehicle_id:
          authorization.workItem.inventory_vehicle_id,
        action: "work_item_updated",
        description: `Updated work item: ${updateRow.description}`,
        actor_user_id: access.userId,
        metadata: {
          workItemId,
          status: updateRow.status,
          actualCost: updateRow.actual_cost,
        },
      });

    return NextResponse.json({
      workItem: data,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to update work item.",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: Request,
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
    const workItemId = String(id || "").trim();

    const authorization = await getAuthorizedWorkItem(
      workItemId,
      access.company.companyId,
    );

    if (!authorization) {
      return NextResponse.json(
        { error: "Work item not found." },
        { status: 404 },
      );
    }

    const { error } = await authorization.supabase
      .from("mindful_inventory_work_items")
      .delete()
      .eq("id", workItemId);

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 },
      );
    }

    await authorization.supabase
      .from("mindful_inventory_activity")
      .insert({
        inventory_vehicle_id:
          authorization.workItem.inventory_vehicle_id,
        action: "work_item_deleted",
        description: "Deleted an Inventory work item.",
        actor_user_id: access.userId,
        metadata: {
          workItemId,
        },
      });

    return NextResponse.json({
      deleted: true,
      id: workItemId,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to delete work item.",
      },
      { status: 500 },
    );
  }
}
