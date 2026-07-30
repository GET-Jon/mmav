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

export async function POST(
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

    // Authorize through the same authenticated/RLS-aware client
    // used to load the Inventory dashboard.
    const {
      data: vehicle,
      error: vehicleError,
    } = await access.supabase
      .from("mindful_inventory_vehicles")
      .select("id, company_id")
      .eq("id", vehicleId)
      .eq("company_id", access.company.companyId)
      .maybeSingle();

    if (vehicleError) {
      return NextResponse.json(
        {
          error: `Inventory vehicle lookup failed: ${vehicleError.message}`,
        },
        { status: 500 },
      );
    }

    if (!vehicle) {
      return NextResponse.json(
        {
          error:
            "Inventory vehicle not found for the current Mindful company.",
        },
        { status: 404 },
      );
    }

    const supabase = createSupabaseAdminClient();

    const status = requiredOption(
      body.status,
      allowedStatuses,
      "work-item status",
    );

    const row = {
      inventory_vehicle_id: vehicleId,
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
      created_by: access.userId,
      updated_by: access.userId,
    };

    const { data, error } = await supabase
      .from("mindful_inventory_work_items")
      .insert(row)
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

    await supabase
      .from("mindful_inventory_activity")
      .insert({
        inventory_vehicle_id: vehicleId,
        action: "work_item_added",
        description: `Added work item: ${row.description}`,
        actor_user_id: access.userId,
        metadata: {
          workItemId: data.id,
          estimatedCost: row.estimated_cost,
          status: row.status,
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
            : "Failed to add work item.",
      },
      { status: 500 },
    );
  }
}
