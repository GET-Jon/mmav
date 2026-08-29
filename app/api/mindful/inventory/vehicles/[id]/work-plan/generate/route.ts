import { NextResponse } from "next/server";

import { generatePreliminaryWorkPlan } from "@/lib/ai";
import { getMindfulInventoryAccess } from "@/lib/mindful-inventory/access";
import { getInventoryCarPlanData } from "@/lib/mindful-inventory/car-plan";
import { getInventoryIntakeInspectionData } from "@/lib/mindful-inventory/intake-inspection";
import { getInventoryOverviewIntakeData } from "@/lib/mindful-inventory/overview-intake";

export const runtime = "nodejs";

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

    const { data: vehicle, error: vehicleError } = await access.supabase
      .from("mindful_inventory_vehicles")
      .select("id,year,make,model,trim,mileage,phase")
      .eq("id", vehicleId)
      .eq("company_id", access.company.companyId)
      .single();

    if (vehicleError) throw new Error(`Vehicle lookup failed: ${vehicleError.message}`);
    if (!vehicle) {
      return NextResponse.json({ error: "Inventory vehicle not found." }, { status: 404 });
    }

    const [intakeInspection, overview, existingPlan] = await Promise.all([
      getInventoryIntakeInspectionData(access.supabase, vehicleId),
      getInventoryOverviewIntakeData(access.supabase, access.company.companyId, vehicleId),
      getInventoryCarPlanData(access.supabase, vehicleId),
    ]);

    if (!intakeInspection.planningReady || !intakeInspection.mechanicalInspection) {
      return NextResponse.json(
        { error: "Complete Overview / Intake and Mechanical Inspection before generating the Work Plan." },
        { status: 400 },
      );
    }

    if (existingPlan.currentDraftVersion?.aiGenerated && existingPlan.draftItems.length > 0) {
      return NextResponse.json({
        carPlanId: existingPlan.carPlanId,
        planVersionId: existingPlan.currentDraftVersion.id,
        created: false,
      });
    }

    if (existingPlan.versions.length > 0) {
      return NextResponse.json(
        { error: "This vehicle already has Work Plan history. Revision/regeneration is not enabled yet." },
        { status: 409 },
      );
    }

    const preliminary = await generatePreliminaryWorkPlan({
      vehicle: {
        year: vehicle.year,
        make: vehicle.make,
        model: vehicle.model,
        trim: vehicle.trim,
        mileage: vehicle.mileage,
      },
      intake: {
        visibleDamageSummary: intakeInspection.intake?.visibleDamageSummary || null,
        initialObservations: intakeInspection.intake?.initialObservations || null,
      },
      mechanicalInspectionSummary: intakeInspection.mechanicalInspection.summary,
      findings: intakeInspection.findings
        .filter(
          (finding) =>
            finding.status === "open" &&
            finding.mechanicalValidationStatus !== "not_found",
        )
        .map((finding) => ({
          id: finding.id,
          source: finding.source,
          title: finding.title,
          description: finding.description,
          category: finding.category,
          severity: finding.severity,
          confidence: finding.confidence,
          certainty: finding.certainty,
          mechanicalValidationStatus: finding.mechanicalValidationStatus,
          mechanicalValidationNotes: finding.mechanicalValidationNotes,
          estimatedCostLow: finding.estimatedCostLow,
          estimatedCostHigh: finding.estimatedCostHigh,
          estimatedDurationHours: finding.estimatedDurationHours,
        })),
      upgrades: overview.upgrades
        .filter((upgrade) => upgrade.status === "proposed")
        .map((upgrade) => ({
          id: upgrade.id,
          title: upgrade.title,
          description: upgrade.description,
          category: upgrade.category,
          desiredOutcome: upgrade.desiredOutcome,
          manufacturer: upgrade.manufacturer,
          partNumber: upgrade.partNumber,
          estimatedPartsCost: upgrade.estimatedPartsCost,
          estimatedLaborCost: upgrade.estimatedLaborCost,
          estimatedTotalCost: upgrade.estimatedTotalCost,
          notes: upgrade.notes,
        })),
    });

    let carPlanId = existingPlan.carPlanId;
    if (!carPlanId) {
      const { data: plan, error: planError } = await access.supabase
        .from("mindful_inventory_car_plans")
        .insert({ vehicle_id: vehicleId, created_by: access.userId })
        .select("id")
        .single();
      if (planError) throw new Error(`Car Plan creation failed: ${planError.message}`);
      carPlanId = plan.id;
    }

    const { data: version, error: versionError } = await access.supabase
      .from("mindful_inventory_car_plan_versions")
      .insert({
        car_plan_id: carPlanId,
        version_number: 1,
        status: "draft",
        planning_total: 0,
        ai_generated: true,
        ai_summary: preliminary.summary,
        ai_assumptions: preliminary.assumptions,
        created_by: access.userId,
      })
      .select("id,version_number")
      .single();

    if (versionError) throw new Error(`Work Plan version creation failed: ${versionError.message}`);

    try {
      let planningTotal = 0;

      for (let index = 0; index < preliminary.items.length; index += 1) {
        const item = preliminary.items[index];
        const primaryFindingId = item.findingIds[0] || null;

        const { data: insertedItem, error: itemError } = await access.supabase
          .from("mindful_inventory_plan_items")
          .insert({
            plan_version_id: version.id,
            finding_id: primaryFindingId,
            upgrade_id: item.upgradeId,
            title: item.title,
            description: item.description,
            category: item.category,
            classification: item.classification,
            decision: item.decision,
            priority: item.priority,
            rationale: item.rationale,
            estimated_cost_low: item.estimatedCostLow,
            estimated_cost_high: item.estimatedCostHigh,
            planning_amount: item.planningAmount,
            estimated_duration_hours: item.estimatedElapsedHours,
            estimated_labor_hours: item.estimatedLaborHours,
            estimated_elapsed_hours: item.estimatedElapsedHours,
            sequence_order: (index + 1) * 10,
            confidence: item.confidence,
            assumptions: item.assumptions,
            manager_investigation_required: item.managerInvestigationRequired,
            cost_source: item.costSource,
            cost_source_detail: item.costSourceDetail,
          })
          .select("id")
          .single();

        if (itemError) throw new Error(`Work Plan item creation failed for “${item.title}”: ${itemError.message}`);
        planningTotal += item.planningAmount;

        if (item.findingIds.length > 0) {
          const { error: linksError } = await access.supabase
            .from("mindful_inventory_plan_item_findings")
            .insert(item.findingIds.map((findingId) => ({ plan_item_id: insertedItem.id, finding_id: findingId })));
          if (linksError) throw new Error(`Finding linkage failed for “${item.title}”: ${linksError.message}`);
        }
      }

      const { error: totalError } = await access.supabase
        .from("mindful_inventory_car_plan_versions")
        .update({ planning_total: planningTotal, updated_at: new Date().toISOString() })
        .eq("id", version.id);
      if (totalError) throw new Error(`Work Plan total update failed: ${totalError.message}`);

      const { error: vehicleUpdateError } = await access.supabase
        .from("mindful_inventory_vehicles")
        .update({
          phase: "planning",
          next_action: "Review preliminary Work Plan",
          next_action_owner_user_id: access.userId,
          updated_by: access.userId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", vehicleId)
        .eq("company_id", access.company.companyId);
      if (vehicleUpdateError) throw new Error(`Vehicle workflow update failed: ${vehicleUpdateError.message}`);

      await access.supabase.from("mindful_inventory_history").insert({
        company_id: access.company.companyId,
        vehicle_id: vehicleId,
        event_type: "preliminary_work_plan_generated",
        entity_type: "car_plan_version",
        entity_id: version.id,
        actor_user_id: access.userId,
        summary: `Preliminary Work Plan v${version.version_number} generated after Mechanical Inspection.`,
        metadata: {
          aiGenerated: true,
          itemCount: preliminary.items.length,
          planningTotal,
          inspectionId: intakeInspection.mechanicalInspection.id,
        },
      });

      return NextResponse.json({
        carPlanId,
        planVersionId: version.id,
        versionNumber: version.version_number,
        itemCount: preliminary.items.length,
        planningTotal,
        created: true,
      });
    } catch (writeError) {
      await access.supabase.from("mindful_inventory_car_plan_versions").delete().eq("id", version.id);
      throw writeError;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate Preliminary Work Plan.";
    console.error("Preliminary Work Plan generation failed:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
