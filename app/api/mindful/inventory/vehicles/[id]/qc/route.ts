import { NextResponse } from "next/server";

import { getMindfulInventoryAccess } from "@/lib/mindful-inventory/access";

const defaultChecklist = [
  {
    category: "mechanical",
    label: "No warning lights or unresolved mechanical faults",
  },
  {
    category: "mechanical",
    label: "Road test completed with no material concerns",
  },
  {
    category: "workmanship",
    label: "Authorized repairs and upgrades visually verified",
  },
  {
    category: "workmanship",
    label: "No obvious leaks, loose components, or unfinished work",
  },
  {
    category: "cosmetic",
    label: "Exterior condition acceptable for release",
  },
  {
    category: "cosmetic",
    label: "Interior condition acceptable for release",
  },
  {
    category: "safety",
    label: "Lights, signals, horn, wipers, and safety equipment functional",
  },
  {
    category: "release",
    label: "Vehicle is clean, complete, and ready for merchandising",
  },
];

async function getVehicle(
  access: NonNullable<Awaited<ReturnType<typeof getMindfulInventoryAccess>>>,
  vehicleId: string,
) {
  const { data } = await access.supabase
    .from("mindful_inventory_vehicles")
    .select("id,phase")
    .eq("id", vehicleId)
    .eq("company_id", access.company.companyId)
    .maybeSingle();

  return data;
}

async function latestInspection(
  access: NonNullable<Awaited<ReturnType<typeof getMindfulInventoryAccess>>>,
  vehicleId: string,
) {
  const { data } = await access.supabase
    .from("mindful_inventory_qc_inspections")
    .select("id,outcome,completed_at")
    .eq("vehicle_id", vehicleId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data;
}

export async function POST(
  _request: Request,
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

    const vehicle = await getVehicle(access, vehicleId);

    if (!vehicle) {
      return NextResponse.json(
        { error: "Inventory vehicle not found." },
        { status: 404 },
      );
    }

    const existing = await latestInspection(access, vehicleId);

    if (existing && !existing.completed_at) {
      return NextResponse.json({ id: existing.id });
    }

    const now = new Date().toISOString();

    const { data: inspection, error } = await access.supabase
      .from("mindful_inventory_qc_inspections")
      .insert({
        vehicle_id: vehicleId,
        performed_by_user_id: access.userId,
        started_at: now,
      })
      .select("id")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const { error: itemError } = await access.supabase
      .from("mindful_inventory_qc_items")
      .insert(
        defaultChecklist.map((item, index) => ({
          qc_inspection_id: inspection.id,
          category: item.category,
          label: item.label,
          result: null,
          sequence_order: index + 1,
        })),
      );

    if (itemError) {
      return NextResponse.json(
        { error: itemError.message },
        { status: 500 },
      );
    }

    await access.supabase.from("mindful_inventory_history").insert({
      company_id: access.company.companyId,
      vehicle_id: vehicleId,
      event_type: "qc_started",
      entity_type: "qc_inspection",
      entity_id: inspection.id,
      actor_user_id: access.userId,
      summary: "Final QC started.",
      metadata: {},
    });

    return NextResponse.json({ id: inspection.id });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to start QC.",
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

    const vehicle = await getVehicle(access, vehicleId);

    if (!vehicle) {
      return NextResponse.json(
        { error: "Inventory vehicle not found." },
        { status: 404 },
      );
    }

    const inspection = await latestInspection(access, vehicleId);

    if (!inspection || inspection.completed_at) {
      return NextResponse.json(
        { error: "No active QC inspection found." },
        { status: 409 },
      );
    }

    const body = (await request.json()) as {
      action?: string;
      itemId?: string;
      result?: string;
      notes?: string;
      summary?: string;
    };

    if (body.action === "update_item") {
      const itemId = String(body.itemId || "").trim();
      const result = String(body.result || "").trim();

      if (
        !itemId ||
        !["pass", "fail", "not_applicable"].includes(result)
      ) {
        return NextResponse.json(
          { error: "Valid QC item and result are required." },
          { status: 400 },
        );
      }

      const { data: item } = await access.supabase
        .from("mindful_inventory_qc_items")
        .select("id")
        .eq("id", itemId)
        .eq("qc_inspection_id", inspection.id)
        .maybeSingle();

      if (!item) {
        return NextResponse.json(
          { error: "QC item not found." },
          { status: 404 },
        );
      }

      const { error } = await access.supabase
        .from("mindful_inventory_qc_items")
        .update({
          result,
          notes: String(body.notes || "").trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", itemId);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ id: itemId, result });
    }

    if (body.action !== "complete") {
      return NextResponse.json(
        { error: "Unsupported QC action." },
        { status: 400 },
      );
    }

    const { data: items, error: itemError } = await access.supabase
      .from("mindful_inventory_qc_items")
      .select("id,label,result,notes")
      .eq("qc_inspection_id", inspection.id)
      .order("sequence_order");

    if (itemError) {
      return NextResponse.json(
        { error: itemError.message },
        { status: 500 },
      );
    }

    const incomplete = (items || []).filter((item) => !item.result);

    if (incomplete.length > 0) {
      return NextResponse.json(
        { error: "Complete every QC checklist item before finishing QC." },
        { status: 400 },
      );
    }

    const failedItems = (items || []).filter(
      (item) => item.result === "fail",
    );

    const outcome = failedItems.length > 0 ? "fail" : "pass";
    const now = new Date().toISOString();

    const { error: inspectionError } = await access.supabase
      .from("mindful_inventory_qc_inspections")
      .update({
        outcome,
        summary: String(body.summary || "").trim() || null,
        completed_at: now,
        updated_at: now,
      })
      .eq("id", inspection.id);

    if (inspectionError) {
      return NextResponse.json(
        { error: inspectionError.message },
        { status: 500 },
      );
    }

    if (outcome === "pass") {
      const { error: vehicleError } = await access.supabase
        .from("mindful_inventory_vehicles")
        .update({
          phase: "ready",
          next_action: "Prepare vehicle for merchandising and sale",
          next_action_owner_user_id: access.userId,
          updated_at: now,
          updated_by: access.userId,
        })
        .eq("id", vehicleId)
        .eq("company_id", access.company.companyId);

      if (vehicleError) {
        return NextResponse.json(
          { error: vehicleError.message },
          { status: 500 },
        );
      }

      await access.supabase.from("mindful_inventory_history").insert({
        company_id: access.company.companyId,
        vehicle_id: vehicleId,
        event_type: "qc_passed",
        entity_type: "qc_inspection",
        entity_id: inspection.id,
        actor_user_id: access.userId,
        summary: "Final QC passed. Vehicle released as Ready.",
        metadata: {},
      });

      return NextResponse.json({
        outcome,
        phase: "ready",
      });
    }

    const titles = failedItems.map((item) => item.label);

    const { data: latestPlan } = await access.supabase
      .from("mindful_inventory_work_orders")
      .select("plan_version_id")
      .eq("vehicle_id", vehicleId)
      .not("plan_version_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { error: workError } = await access.supabase
      .from("mindful_inventory_work_orders")
      .insert({
        vehicle_id: vehicleId,
        plan_version_id: latestPlan?.plan_version_id || null,
        source_type: "qc_rework",
        title: "QC rework",
        description: titles.join("; "),
        category: "quality_control",
        classification: "required",
        status: "ready_to_schedule",
        approved_budget: 0,
        current_forecast: 0,
        next_action_owner_user_id: access.userId,
      });

    if (workError) {
      return NextResponse.json(
        { error: workError.message },
        { status: 500 },
      );
    }

    const { error: vehicleError } = await access.supabase
      .from("mindful_inventory_vehicles")
      .update({
        phase: "reconditioning",
        next_action: "Complete QC rework",
        next_action_owner_user_id: access.userId,
        updated_at: now,
        updated_by: access.userId,
      })
      .eq("id", vehicleId)
      .eq("company_id", access.company.companyId);

    if (vehicleError) {
      return NextResponse.json(
        { error: vehicleError.message },
        { status: 500 },
      );
    }

    await access.supabase.from("mindful_inventory_history").insert({
      company_id: access.company.companyId,
      vehicle_id: vehicleId,
      event_type: "qc_failed",
      entity_type: "qc_inspection",
      entity_id: inspection.id,
      actor_user_id: access.userId,
      summary: "Final QC failed. Rework created.",
      metadata: {
        failedItems: titles,
      },
    });

    return NextResponse.json({
      outcome,
      phase: "reconditioning",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to update QC.",
      },
      { status: 500 },
    );
  }
}
