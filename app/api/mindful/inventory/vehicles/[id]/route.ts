import { NextResponse } from "next/server";

import { getMindfulInventoryAccess } from "@/lib/mindful-inventory/access";
import type {
  InventoryTitleStatus,
  InventoryVehicleGrade,
  InventoryVehicleHealth,
  InventoryVehiclePhase,
  InventoryVehiclePriority,
} from "@/lib/mindful-inventory/types";

const allowedPhases = new Set<InventoryVehiclePhase>([
  "purchased",
  "intake",
  "inspection",
  "planning",
  "reconditioning",
  "final_qc",
  "merchandising",
  "ready",
]);

const allowedGrades = new Set<InventoryVehicleGrade>(["a", "b", "c", "d", "e"]);
const allowedPriorities = new Set<InventoryVehiclePriority>(["1", "2", "3"]);
const allowedHealth = new Set<InventoryVehicleHealth>([
  "on_track",
  "at_risk",
  "behind",
  "blocked",
]);
const allowedTitleStatuses = new Set<InventoryTitleStatus>([
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

function requiredEnum<T extends string>(
  value: unknown,
  allowed: Set<T>,
  label: string,
): T {
  const clean = String(value ?? "").trim() as T;

  if (!allowed.has(clean)) {
    throw new Error(`Invalid ${label}.`);
  }

  return clean;
}

function nullableEnum<T extends string>(
  value: unknown,
  allowed: Set<T>,
  label: string,
): T | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  return requiredEnum(value, allowed, label);
}

function nullableDate(value: unknown, label: string) {
  const clean = String(value ?? "").trim();

  if (!clean) {
    return null;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    throw new Error(`Invalid ${label}.`);
  }

  const parsed = new Date(`${clean}T00:00:00.000Z`);

  if (!Number.isFinite(parsed.getTime())) {
    throw new Error(`Invalid ${label}.`);
  }

  return parsed.toISOString();
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

    const { data: currentVehicle, error: currentVehicleError } = await access.supabase
      .from("mindful_inventory_vehicles")
      .select("id,project_owner_user_id")
      .eq("id", vehicleId)
      .eq("company_id", access.company.companyId)
      .single();

    if (currentVehicleError || !currentVehicle) {
      return NextResponse.json({ error: "Inventory vehicle not found." }, { status: 404 });
    }

    const body = await request.json();
    const requestedPhase = requiredEnum(body.phase, allowedPhases, "vehicle phase");
    const holdActive = Boolean(body.holdActive);
    const holdReason = optionalText(body.holdReason);
    const ownerWasProvided = Object.prototype.hasOwnProperty.call(body, "projectOwnerUserId");
    const requestedOwnerUserId = ownerWasProvided
      ? optionalText(body.projectOwnerUserId)
      : currentVehicle.project_owner_user_id;

    if (requestedOwnerUserId) {
      const { data: ownerMembership, error: ownerMembershipError } = await access.supabase
        .from("company_memberships")
        .select("user_id")
        .eq("company_id", access.company.companyId)
        .eq("user_id", requestedOwnerUserId)
        .eq("status", "active")
        .maybeSingle();

      if (ownerMembershipError) throw new Error(ownerMembershipError.message);
      if (!ownerMembership) {
        return NextResponse.json(
          { error: "Vehicle Owner must be an active member of Mindful Motor Co." },
          { status: 400 },
        );
      }
    }

    if (holdActive && !holdReason) {
      return NextResponse.json(
        { error: "A hold reason is required when a vehicle is on hold." },
        { status: 400 },
      );
    }

    if (requestedPhase === "planning") {
      const ready = await planningPrerequisitesComplete(access, vehicleId);
      if (!ready) {
        return NextResponse.json(
          { error: "Planning requires a completed purchaser Intake and completed mechanical Inspection." },
          { status: 400 },
        );
      }
    }

    const updateRow = {
      project_owner_user_id: requestedOwnerUserId,
      phase: requestedPhase,
      grade: nullableEnum(body.grade, allowedGrades, "vehicle grade"),
      priority: requiredEnum(body.priority, allowedPriorities, "vehicle priority"),
      health: requiredEnum(body.health, allowedHealth, "vehicle health"),
      title_status: requiredEnum(
        body.titleStatus,
        allowedTitleStatuses,
        "title status",
      ),
      next_action: optionalText(body.nextAction),
      next_action_due_at: nullableDate(body.nextActionDueAt, "next action due date"),
      target_ready_at: nullableDate(body.targetReadyAt, "target ready date"),
      forecast_ready_at: nullableDate(body.forecastReadyAt, "forecast ready date"),
      hold_active: holdActive,
      hold_reason: holdActive ? holdReason : null,
      hold_owner_user_id: holdActive ? access.userId : null,
      hold_follow_up_at: holdActive
        ? nullableDate(body.holdFollowUpAt, "hold follow-up date")
        : null,
      updated_by: access.userId,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await access.supabase
      .from("mindful_inventory_vehicles")
      .update(updateRow)
      .eq("id", vehicleId)
      .eq("company_id", access.company.companyId)
      .select("id, updated_at")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const { error: historyError } = await access.supabase
      .from("mindful_inventory_history")
      .insert({
        company_id: access.company.companyId,
        vehicle_id: vehicleId,
        event_type: "vehicle_operational_details_updated",
        entity_type: "vehicle",
        entity_id: vehicleId,
        actor_user_id: access.userId,
        summary: "Vehicle operational details updated.",
        metadata: {
          projectOwnerUserId: updateRow.project_owner_user_id,
          phase: updateRow.phase,
          grade: updateRow.grade,
          priority: updateRow.priority,
          health: updateRow.health,
          titleStatus: updateRow.title_status,
          holdActive: updateRow.hold_active,
        },
      });

    if (historyError) {
      console.error("Inventory history insert failed:", historyError.message);
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
