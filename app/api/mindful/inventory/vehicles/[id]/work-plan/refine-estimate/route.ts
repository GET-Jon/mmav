import { NextResponse } from "next/server";

import { refineWorkPlanEstimate } from "@/lib/ai/work-plan-estimate";
import { getMindfulInventoryAccess } from "@/lib/mindful-inventory/access";

export const runtime = "nodejs";

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const access = await getMindfulInventoryAccess();
    if (!access) return NextResponse.json({ error: "Mindful Inventory access denied." }, { status: 403 });

    const { id } = await context.params;
    const vehicleId = String(id || "").trim();
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const itemId = String(body.itemId || "").trim();
    if (!vehicleId || !itemId) return NextResponse.json({ error: "Vehicle and Work Plan item are required." }, { status: 400 });

    const { data: vehicle, error: vehicleError } = await access.supabase
      .from("mindful_inventory_vehicles")
      .select("id,year,make,model,trim,mileage")
      .eq("id", vehicleId)
      .eq("company_id", access.company.companyId)
      .maybeSingle();
    if (vehicleError) throw new Error(vehicleError.message);
    if (!vehicle) return NextResponse.json({ error: "Inventory vehicle not found." }, { status: 404 });

    const { data: plan, error: planError } = await access.supabase
      .from("mindful_inventory_car_plans")
      .select("id")
      .eq("vehicle_id", vehicleId)
      .maybeSingle();
    if (planError) throw new Error(planError.message);
    if (!plan) return NextResponse.json({ error: "Work Plan not found." }, { status: 404 });

    const { data: draft, error: draftError } = await access.supabase
      .from("mindful_inventory_car_plan_versions")
      .select("id")
      .eq("car_plan_id", plan.id)
      .eq("status", "draft")
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (draftError) throw new Error(draftError.message);
    if (!draft) return NextResponse.json({ error: "No editable Draft Work Plan exists." }, { status: 409 });

    const { data: item, error: itemError } = await access.supabase
      .from("mindful_inventory_plan_items")
      .select("id,title,description,category,classification,decision,estimated_labor_hours,estimated_cost_low,estimated_cost_high,planning_amount,cost_source,cost_source_detail,suggested_partner_id")
      .eq("id", itemId)
      .eq("plan_version_id", draft.id)
      .maybeSingle();
    if (itemError) throw new Error(itemError.message);
    if (!item) return NextResponse.json({ error: "Draft Work Plan item not found." }, { status: 404 });
    if (!["ai_estimate", "unknown"].includes(item.cost_source)) {
      return NextResponse.json({ error: "This item already has a stronger cost basis than an AI estimate. Review its pricing instead of refining it with AI." }, { status: 409 });
    }

    const { data: findingLinks, error: findingLinksError } = await access.supabase
      .from("mindful_inventory_plan_item_findings")
      .select("finding_id")
      .eq("plan_item_id", item.id);
    if (findingLinksError) throw new Error(findingLinksError.message);
    const findingIds = (findingLinks || []).map((row) => row.finding_id);

    const [findingsResult, partsResult, partnerResult] = await Promise.all([
      findingIds.length
        ? access.supabase.from("mindful_inventory_findings")
            .select("id,title,description,mechanical_validation_status,mechanical_validation_notes,mechanical_recommended_action,mechanical_can_perform,mechanical_labor_hours,mechanical_proposed_labor_price,estimated_cost_low,estimated_cost_high")
            .in("id", findingIds)
        : Promise.resolve({ data: [], error: null }),
      access.supabase.from("mindful_inventory_part_requirements")
        .select("description,quantity,origin,ai_estimated_unit_price_low,ai_estimated_unit_price_high,partner_offer_unit_price,fulfillment_method,requirement_status")
        .eq("plan_item_id", item.id),
      item.suggested_partner_id
        ? access.supabase.from("mindful_inventory_partners").select("id,name").eq("id", item.suggested_partner_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
    if (findingsResult.error) throw new Error(findingsResult.error.message);
    if (partsResult.error) throw new Error(partsResult.error.message);
    if (partnerResult.error) throw new Error(partnerResult.error.message);

    const refined = await refineWorkPlanEstimate({
      vehicle: {
        year: vehicle.year,
        make: vehicle.make,
        model: vehicle.model,
        trim: vehicle.trim,
        mileage: numberOrNull(vehicle.mileage),
      },
      item: {
        title: item.title,
        description: item.description,
        category: item.category,
        classification: item.classification,
        decision: item.decision,
        estimatedLaborHours: numberOrNull(item.estimated_labor_hours),
        currentEstimateLow: numberOrNull(item.estimated_cost_low),
        currentEstimateHigh: numberOrNull(item.estimated_cost_high),
        currentPlanningAmount: Number(item.planning_amount || 0),
        currentCostSource: item.cost_source,
        currentCostDetail: item.cost_source_detail,
      },
      partner: { name: partnerResult.data?.name || null },
      findings: (findingsResult.data || []).map((finding) => ({
        title: finding.title,
        description: finding.description,
        mechanicalValidationStatus: finding.mechanical_validation_status,
        mechanicalValidationNotes: finding.mechanical_validation_notes,
        mechanicalRecommendedAction: finding.mechanical_recommended_action,
        mechanicalCanPerform: typeof finding.mechanical_can_perform === "boolean" ? finding.mechanical_can_perform : null,
        mechanicalLaborHours: numberOrNull(finding.mechanical_labor_hours),
        mechanicalProposedLaborPrice: numberOrNull(finding.mechanical_proposed_labor_price),
        estimatedCostLow: numberOrNull(finding.estimated_cost_low),
        estimatedCostHigh: numberOrNull(finding.estimated_cost_high),
      })),
      parts: (partsResult.data || []).map((part) => ({
        description: part.description,
        quantity: Number(part.quantity || 1),
        origin: part.origin,
        aiEstimatedUnitPriceLow: numberOrNull(part.ai_estimated_unit_price_low),
        aiEstimatedUnitPriceHigh: numberOrNull(part.ai_estimated_unit_price_high),
        partnerOfferUnitPrice: numberOrNull(part.partner_offer_unit_price),
        fulfillmentMethod: part.fulfillment_method,
        requirementStatus: part.requirement_status,
      })),
    });

    const now = new Date().toISOString();
    const { error: updateError } = await access.supabase
      .from("mindful_inventory_plan_items")
      .update({
        estimated_cost_low: refined.estimatedCostLow,
        estimated_cost_high: refined.estimatedCostHigh,
        planning_amount: refined.planningAmount,
        confidence: refined.confidence,
        cost_source: "ai_estimate",
        cost_source_detail: refined.basis,
        updated_at: now,
      })
      .eq("id", item.id)
      .eq("plan_version_id", draft.id);
    if (updateError) throw new Error(updateError.message);

    const { data: amountRows, error: amountError } = await access.supabase
      .from("mindful_inventory_plan_items")
      .select("planning_amount,decision")
      .eq("plan_version_id", draft.id);
    if (amountError) throw new Error(amountError.message);
    const planningTotal = (amountRows || []).reduce((sum, row) => sum + (row.decision === "declined" ? 0 : Number(row.planning_amount || 0)), 0);
    const { error: totalError } = await access.supabase
      .from("mindful_inventory_car_plan_versions")
      .update({ planning_total: planningTotal, updated_at: now })
      .eq("id", draft.id);
    if (totalError) throw new Error(totalError.message);

    await access.supabase.from("mindful_inventory_history").insert({
      company_id: access.company.companyId,
      vehicle_id: vehicleId,
      event_type: "work_plan_estimate_refined",
      entity_type: "plan_item",
      entity_id: item.id,
      actor_user_id: access.userId,
      summary: `Lot Logic refined the planning estimate for ${item.title}.`,
      metadata: {
        previous: {
          low: numberOrNull(item.estimated_cost_low),
          high: numberOrNull(item.estimated_cost_high),
          planningAmount: Number(item.planning_amount || 0),
          costSource: item.cost_source,
          costDetail: item.cost_source_detail,
        },
        refined,
      },
    });

    return NextResponse.json({ ok: true, itemId: item.id, planningTotal, ...refined });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not refine this Work Plan estimate.";
    console.error("Work Plan estimate refinement failed:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
