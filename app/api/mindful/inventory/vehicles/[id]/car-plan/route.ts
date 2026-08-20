import { NextResponse } from "next/server";

import { getMindfulInventoryAccess } from "@/lib/mindful-inventory/access";
import { getInventoryCarPlanData } from "@/lib/mindful-inventory/car-plan";

async function getVehicle(
  access: NonNullable<Awaited<ReturnType<typeof getMindfulInventoryAccess>>>,
  vehicleId: string,
) {
  const { data, error } = await access.supabase
    .from("mindful_inventory_vehicles")
    .select("id")
    .eq("id", vehicleId)
    .eq("company_id", access.company.companyId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

async function planningPrerequisitesComplete(
  access: NonNullable<Awaited<ReturnType<typeof getMindfulInventoryAccess>>>,
  vehicleId: string,
) {
  const [intakeResult, inspectionResult] = await Promise.all([
    access.supabase
      .from("mindful_inventory_intakes")
      .select("id")
      .eq("vehicle_id", vehicleId)
      .eq("status", "complete")
      .maybeSingle(),
    access.supabase
      .from("mindful_inventory_inspections")
      .select("id")
      .eq("vehicle_id", vehicleId)
      .eq("inspection_type", "mechanical")
      .eq("status", "complete")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (intakeResult.error) throw new Error(intakeResult.error.message);
  if (inspectionResult.error) throw new Error(inspectionResult.error.message);

  return Boolean(intakeResult.data && inspectionResult.data);
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const access = await getMindfulInventoryAccess();
    if (!access) {
      return NextResponse.json({ error: "Mindful Inventory access denied." }, { status: 403 });
    }

    const { id } = await context.params;
    const vehicleId = String(id || "").trim();
    if (!vehicleId) {
      return NextResponse.json({ error: "Inventory vehicle id is required." }, { status: 400 });
    }

    const vehicle = await getVehicle(access, vehicleId);
    if (!vehicle) {
      return NextResponse.json({ error: "Inventory vehicle not found." }, { status: 404 });
    }

    const data = await getInventoryCarPlanData(access.supabase, vehicleId);
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load Car Plan." },
      { status: 500 },
    );
  }
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const access = await getMindfulInventoryAccess();
    if (!access) {
      return NextResponse.json({ error: "Mindful Inventory access denied." }, { status: 403 });
    }

    const { id } = await context.params;
    const vehicleId = String(id || "").trim();
    if (!vehicleId) {
      return NextResponse.json({ error: "Inventory vehicle id is required." }, { status: 400 });
    }

    const vehicle = await getVehicle(access, vehicleId);
    if (!vehicle) {
      return NextResponse.json({ error: "Inventory vehicle not found." }, { status: 404 });
    }

    const planningReady = await planningPrerequisitesComplete(access, vehicleId);
    if (!planningReady) {
      return NextResponse.json(
        { error: "Draft Car Plan requires a completed purchaser Intake and completed mechanical Inspection." },
        { status: 400 },
      );
    }

    const existing = await getInventoryCarPlanData(access.supabase, vehicleId);
    if (existing.currentDraftVersion) {
      return NextResponse.json({
        carPlanId: existing.carPlanId,
        planVersionId: existing.currentDraftVersion.id,
        versionNumber: existing.currentDraftVersion.versionNumber,
        created: false,
      });
    }

    if (existing.versions.length > 0) {
      return NextResponse.json(
        { error: "This Car Plan already has version history. Plan revisions are not enabled in this Inventory slice yet." },
        { status: 409 },
      );
    }

    let carPlanId = existing.carPlanId;

    if (!carPlanId) {
      const { data: insertedPlan, error: insertPlanError } = await access.supabase
        .from("mindful_inventory_car_plans")
        .insert({
          vehicle_id: vehicleId,
          created_by: access.userId,
        })
        .select("id")
        .single();

      if (insertPlanError) {
        if (insertPlanError.code !== "23505") {
          throw new Error(insertPlanError.message);
        }

        const { data: concurrentPlan, error: concurrentPlanError } = await access.supabase
          .from("mindful_inventory_car_plans")
          .select("id")
          .eq("vehicle_id", vehicleId)
          .single();

        if (concurrentPlanError) throw new Error(concurrentPlanError.message);
        carPlanId = concurrentPlan.id;
      } else {
        carPlanId = insertedPlan.id;
      }
    }

    const { data: planVersion, error: versionError } = await access.supabase
      .from("mindful_inventory_car_plan_versions")
      .insert({
        car_plan_id: carPlanId,
        version_number: 1,
        status: "draft",
        planning_total: 0,
        ai_generated: false,
        created_by: access.userId,
      })
      .select("id,version_number")
      .single();

    if (versionError) {
      if (versionError.code === "23505") {
        const current = await getInventoryCarPlanData(access.supabase, vehicleId);
        if (current.currentDraftVersion) {
          return NextResponse.json({
            carPlanId: current.carPlanId,
            planVersionId: current.currentDraftVersion.id,
            versionNumber: current.currentDraftVersion.versionNumber,
            created: false,
          });
        }
      }
      throw new Error(versionError.message);
    }

    const { error: historyError } = await access.supabase
      .from("mindful_inventory_history")
      .insert({
        company_id: access.company.companyId,
        vehicle_id: vehicleId,
        event_type: "car_plan_draft_created",
        entity_type: "car_plan_version",
        entity_id: planVersion.id,
        actor_user_id: access.userId,
        summary: "Draft Car Plan v1 created.",
        metadata: { versionNumber: planVersion.version_number, aiGenerated: false },
      });

    if (historyError) {
      console.error("Inventory history insert failed:", historyError.message);
    }

    return NextResponse.json({
      carPlanId,
      planVersionId: planVersion.id,
      versionNumber: planVersion.version_number,
      created: true,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create Draft Car Plan." },
      { status: 500 },
    );
  }
}
