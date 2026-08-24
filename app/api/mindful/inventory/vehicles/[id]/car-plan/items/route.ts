import { NextResponse } from "next/server";

import { getMindfulInventoryAccess } from "@/lib/mindful-inventory/access";
import type {
  InventoryPlanItemClassification,
  InventoryPlanItemCostSource,
  InventoryPlanItemDecision,
} from "@/lib/mindful-inventory/car-plan";

const allowedClassifications = new Set<InventoryPlanItemClassification>([
  "required",
  "recommended",
  "optional",
  "upgrade",
  "investigate",
]);
const allowedDecisions = new Set<InventoryPlanItemDecision>([
  "approved",
  "declined",
  "investigate",
  "monitor",
]);
const allowedCostSources = new Set<InventoryPlanItemCostSource>([
  "known_quote",
  "historical_actual",
  "catalog_parts_cost",
  "comparable_vehicle",
  "ai_estimate",
  "unknown",
]);
const allowedPriorities = new Set(["1", "2", "3"]);

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

function confidenceValue(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new Error("Confidence must be between 0 and 1.");
  }
  return parsed;
}

function uniqueIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((item) => String(item ?? "").trim()).filter(Boolean)));
}

async function getDraftContext(
  access: NonNullable<Awaited<ReturnType<typeof getMindfulInventoryAccess>>>,
  vehicleId: string,
) {
  const { data: vehicle, error: vehicleError } = await access.supabase
    .from("mindful_inventory_vehicles")
    .select("id")
    .eq("id", vehicleId)
    .eq("company_id", access.company.companyId)
    .maybeSingle();
  if (vehicleError) throw new Error(vehicleError.message);
  if (!vehicle) throw new Error("Inventory vehicle not found.");

  const { data: carPlan, error: planError } = await access.supabase
    .from("mindful_inventory_car_plans")
    .select("id")
    .eq("vehicle_id", vehicleId)
    .maybeSingle();
  if (planError) throw new Error(planError.message);
  if (!carPlan) throw new Error("Create the Draft Car Plan before editing Plan Items.");

  const { data: draftVersion, error: draftError } = await access.supabase
    .from("mindful_inventory_car_plan_versions")
    .select("id,version_number")
    .eq("car_plan_id", carPlan.id)
    .eq("status", "draft")
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (draftError) throw new Error(draftError.message);
  if (!draftVersion) throw new Error("No editable Draft Car Plan version exists.");

  return { draftVersion };
}

function validateEnums(body: Record<string, unknown>) {
  const classification = String(body.classification || "recommended") as InventoryPlanItemClassification;
  const decision = String(body.decision || "investigate") as InventoryPlanItemDecision;
  const priority = String(body.priority || "2");
  const costSource = String(body.costSource || "unknown") as InventoryPlanItemCostSource;

  if (!allowedClassifications.has(classification)) throw new Error("Invalid Plan Item classification.");
  if (!allowedDecisions.has(decision)) throw new Error("Invalid Plan Item decision.");
  if (!allowedPriorities.has(priority)) throw new Error("Invalid Plan Item priority.");
  if (!allowedCostSources.has(costSource)) throw new Error("Invalid cost source.");

  return { classification, decision, priority, costSource };
}

async function recalculatePlanningTotal(
  access: NonNullable<Awaited<ReturnType<typeof getMindfulInventoryAccess>>>,
  planVersionId: string,
) {
  const { data: amountRows, error: amountError } = await access.supabase
    .from("mindful_inventory_plan_items")
    .select("planning_amount,decision")
    .eq("plan_version_id", planVersionId);
  if (amountError) throw new Error(amountError.message);

  const planningTotal = (amountRows || []).reduce(
    (sum, row) => sum + (row.decision === "declined" ? 0 : Number(row.planning_amount || 0)),
    0,
  );

  const { error: totalError } = await access.supabase
    .from("mindful_inventory_car_plan_versions")
    .update({ planning_total: planningTotal, updated_at: new Date().toISOString() })
    .eq("id", planVersionId)
    .eq("status", "draft");
  if (totalError) throw new Error(totalError.message);
  return planningTotal;
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const access = await getMindfulInventoryAccess();
    if (!access) return NextResponse.json({ error: "Mindful Inventory access denied." }, { status: 403 });
    const { id } = await context.params;
    const vehicleId = String(id || "").trim();
    if (!vehicleId) return NextResponse.json({ error: "Inventory vehicle id is required." }, { status: 400 });

    const { draftVersion } = await getDraftContext(access, vehicleId);
    const body = (await request.json()) as Record<string, unknown>;
    const title = String(body.title || "").trim();
    if (!title) return NextResponse.json({ error: "Plan Item title is required." }, { status: 400 });

    const { classification, decision, priority, costSource } = validateEnums(body);
    const declineReason = optionalText(body.declineReason);
    if (decision === "declined" && !declineReason) {
      return NextResponse.json({ error: "Deferred / declined Plan Items require a reason." }, { status: 400 });
    }

    const estimatedCostLow = nullableNonNegativeNumber(body.estimatedCostLow, "Estimated cost low");
    const estimatedCostHigh = nullableNonNegativeNumber(body.estimatedCostHigh, "Estimated cost high");
    if (estimatedCostLow !== null && estimatedCostHigh !== null && estimatedCostHigh < estimatedCostLow) {
      return NextResponse.json({ error: "Estimated cost high cannot be less than estimated cost low." }, { status: 400 });
    }
    const planningAmount = nullableNonNegativeNumber(body.planningAmount, "Planning amount") ?? estimatedCostHigh ?? estimatedCostLow ?? 0;
    const estimatedDurationHours = nullableNonNegativeNumber(body.estimatedDurationHours, "Estimated duration");
    const estimatedLaborHours = nullableNonNegativeNumber(body.estimatedLaborHours, "Estimated labor");
    const estimatedElapsedHours = nullableNonNegativeNumber(body.estimatedElapsedHours, "Estimated turnaround");
    const confidence = confidenceValue(body.confidence);
    const assumptions = body.assumptions === undefined ? [] : body.assumptions;
    if (!Array.isArray(assumptions)) return NextResponse.json({ error: "Plan Item assumptions must be an array." }, { status: 400 });

    const findingIds = uniqueIds(body.findingIds);
    if (findingIds.length > 0) {
      const { data: findingRows, error: findingsError } = await access.supabase
        .from("mindful_inventory_findings")
        .select("id,status")
        .eq("vehicle_id", vehicleId)
        .in("id", findingIds);
      if (findingsError) throw new Error(findingsError.message);
      if ((findingRows || []).length !== findingIds.length) return NextResponse.json({ error: "Every linked Finding must belong to this vehicle." }, { status: 400 });
    }

    const { data: lastItem, error: orderError } = await access.supabase
      .from("mindful_inventory_plan_items")
      .select("sequence_order")
      .eq("plan_version_id", draftVersion.id)
      .order("sequence_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (orderError) throw new Error(orderError.message);
    const sequenceOrder = Number(lastItem?.sequence_order || 0) + 10;

    const { data: planItem, error: itemError } = await access.supabase
      .from("mindful_inventory_plan_items")
      .insert({
        plan_version_id: draftVersion.id,
        finding_id: findingIds[0] || null,
        title,
        description: optionalText(body.description),
        category: optionalText(body.category) || "other",
        classification,
        decision,
        priority,
        rationale: optionalText(body.rationale),
        estimated_cost_low: estimatedCostLow,
        estimated_cost_high: estimatedCostHigh,
        planning_amount: planningAmount,
        estimated_duration_hours: estimatedDurationHours,
        estimated_labor_hours: estimatedLaborHours,
        estimated_elapsed_hours: estimatedElapsedHours,
        decline_reason: decision === "declined" ? declineReason : null,
        sequence_order: sequenceOrder,
        confidence,
        assumptions,
        manager_investigation_required: Boolean(body.managerInvestigationRequired),
        cost_source: costSource,
        cost_source_detail: optionalText(body.costSourceDetail),
      })
      .select("id")
      .single();
    if (itemError) throw new Error(itemError.message);

    if (findingIds.length > 0) {
      const { error: linkError } = await access.supabase
        .from("mindful_inventory_plan_item_findings")
        .insert(findingIds.map((findingId) => ({ plan_item_id: planItem.id, finding_id: findingId })));
      if (linkError) throw new Error(linkError.message);
    }

    const planningTotal = await recalculatePlanningTotal(access, draftVersion.id);
    await access.supabase.from("mindful_inventory_history").insert({
      company_id: access.company.companyId,
      vehicle_id: vehicleId,
      event_type: "car_plan_item_added",
      entity_type: "plan_item",
      entity_id: planItem.id,
      actor_user_id: access.userId,
      summary: `Manager Plan Item added: ${title}`,
      metadata: { planVersionId: draftVersion.id, versionNumber: draftVersion.version_number, classification, decision, planningAmount },
    });

    return NextResponse.json({ id: planItem.id, planVersionId: draftVersion.id, planningTotal });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to add Draft Plan Item." }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const access = await getMindfulInventoryAccess();
    if (!access) return NextResponse.json({ error: "Mindful Inventory access denied." }, { status: 403 });
    const { id } = await context.params;
    const vehicleId = String(id || "").trim();
    if (!vehicleId) return NextResponse.json({ error: "Inventory vehicle id is required." }, { status: 400 });

    const { draftVersion } = await getDraftContext(access, vehicleId);
    const body = (await request.json()) as Record<string, unknown>;
    const itemId = String(body.itemId || "").trim();
    const title = String(body.title || "").trim();
    if (!itemId) return NextResponse.json({ error: "Plan Item id is required." }, { status: 400 });
    if (!title) return NextResponse.json({ error: "Plan Item title is required." }, { status: 400 });

    const { classification, decision, priority, costSource } = validateEnums(body);
    const declineReason = optionalText(body.declineReason);
    if (decision === "declined" && !declineReason) {
      return NextResponse.json({ error: "Deferred / declined Plan Items require a reason." }, { status: 400 });
    }
    const estimatedCostLow = nullableNonNegativeNumber(body.estimatedCostLow, "Estimated cost low");
    const estimatedCostHigh = nullableNonNegativeNumber(body.estimatedCostHigh, "Estimated cost high");
    if (estimatedCostLow !== null && estimatedCostHigh !== null && estimatedCostHigh < estimatedCostLow) {
      return NextResponse.json({ error: "Estimated cost high cannot be less than estimated cost low." }, { status: 400 });
    }

    const planningAmount = nullableNonNegativeNumber(body.planningAmount, "Planning amount") ?? 0;
    const estimatedLaborHours = nullableNonNegativeNumber(body.estimatedLaborHours, "Estimated labor");
    const estimatedElapsedHours = nullableNonNegativeNumber(body.estimatedElapsedHours, "Estimated turnaround");

    const { data: existing, error: existingError } = await access.supabase
      .from("mindful_inventory_plan_items")
      .select("id,title")
      .eq("id", itemId)
      .eq("plan_version_id", draftVersion.id)
      .maybeSingle();
    if (existingError) throw new Error(existingError.message);
    if (!existing) return NextResponse.json({ error: "Draft Plan Item not found." }, { status: 404 });

    const { error: updateError } = await access.supabase
      .from("mindful_inventory_plan_items")
      .update({
        title,
        description: optionalText(body.description),
        category: optionalText(body.category) || "other",
        classification,
        decision,
        priority,
        rationale: optionalText(body.rationale),
        estimated_cost_low: estimatedCostLow,
        estimated_cost_high: estimatedCostHigh,
        planning_amount: planningAmount,
        estimated_labor_hours: estimatedLaborHours,
        estimated_elapsed_hours: estimatedElapsedHours,
        manager_investigation_required: Boolean(body.managerInvestigationRequired),
        cost_source: costSource,
        cost_source_detail: optionalText(body.costSourceDetail),
        decline_reason: decision === "declined" ? declineReason : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", itemId)
      .eq("plan_version_id", draftVersion.id);
    if (updateError) throw new Error(updateError.message);

    const planningTotal = await recalculatePlanningTotal(access, draftVersion.id);
    await access.supabase.from("mindful_inventory_history").insert({
      company_id: access.company.companyId,
      vehicle_id: vehicleId,
      event_type: "car_plan_item_updated",
      entity_type: "plan_item",
      entity_id: itemId,
      actor_user_id: access.userId,
      summary: `Draft Plan Item updated: ${title}`,
      metadata: { previousTitle: existing.title, planVersionId: draftVersion.id, classification, decision, planningAmount },
    });

    return NextResponse.json({ id: itemId, planningTotal });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to update Draft Plan Item." }, { status: 500 });
  }
}
