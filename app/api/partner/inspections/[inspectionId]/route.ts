import { NextResponse } from "next/server";

import { requirePartnerPortalAccess } from "@/lib/partner-portal/access";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

const validationStatuses = new Set(["confirmed", "not_found", "changed", "needs_diagnosis"]);
const upgradeStatuses = new Set(["feasible", "feasible_with_changes", "not_recommended", "needs_info"]);

type PartSuggestion = {
  name: string;
  quantity: number;
  partNumber: string | null;
  notes: string | null;
};

function optionalText(value: unknown) {
  const clean = String(value ?? "").trim();
  return clean || null;
}

function optionalNonNegativeNumber(value: unknown, label = "Value") {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${label} must be a non-negative number.`);
  return parsed;
}

function partSuggestions(value: unknown): PartSuggestion[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((raw) => {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
      const row = raw as Record<string, unknown>;
      const name = String(row.name ?? row.description ?? "").trim();
      if (!name) return null;
      const quantityValue = Number(row.quantity ?? 1);
      return {
        name,
        quantity: Number.isFinite(quantityValue) && quantityValue > 0 ? quantityValue : 1,
        partNumber: optionalText(row.partNumber ?? row.part_number),
        notes: optionalText(row.notes),
      } satisfies PartSuggestion;
    })
    .filter((row): row is PartSuggestion => Boolean(row));
}

function recommendationPatch(body: Record<string, unknown>) {
  const suggestions = partSuggestions(body.partSuggestions);
  const legacyParts = optionalText(body.partsRequired);
  const summary = suggestions.length
    ? suggestions.map((part) => `${part.quantity > 1 ? `${part.quantity}x ` : ""}${part.name}${part.partNumber ? ` (${part.partNumber})` : ""}`).join(", ")
    : legacyParts;

  return {
    mechanical_recommended_action: optionalText(body.recommendedAction),
    mechanical_parts_required: summary,
    mechanical_part_suggestions: suggestions,
    mechanical_can_perform: typeof body.canPerform === "boolean" ? body.canPerform : null,
    mechanical_labor_hours: optionalNonNegativeNumber(body.laborHours, "Labor hours"),
    mechanical_proposed_labor_price: optionalNonNegativeNumber(body.proposedLaborPrice, "Proposed labor price"),
  };
}

function upgradeRecommendationPatch(body: Record<string, unknown>) {
  return {
    mechanical_recommended_action: optionalText(body.recommendedAction),
    mechanical_part_suggestions: partSuggestions(body.partSuggestions),
    mechanical_can_perform: typeof body.canPerform === "boolean" ? body.canPerform : null,
    mechanical_labor_hours: optionalNonNegativeNumber(body.laborHours, "Labor hours"),
    mechanical_proposed_labor_price: optionalNonNegativeNumber(body.proposedLaborPrice, "Proposed labor price"),
  };
}

export async function PATCH(request: Request, context: { params: Promise<{ inspectionId: string }> }) {
  try {
    const access = await requirePartnerPortalAccess();
    if (!access.partner.mechanicalInspectionEligible) return NextResponse.json({ error: "Mechanical inspection access is not enabled." }, { status: 403 });

    const { inspectionId } = await context.params;
    const admin = createSupabaseAdminClient();
    const { data: inspection, error: inspectionError } = await admin
      .from("mindful_inventory_inspections")
      .select("id,vehicle_id,status,requested_start_at")
      .eq("id", inspectionId)
      .eq("performed_by_partner_id", access.partner.id)
      .eq("inspection_type", "mechanical")
      .maybeSingle();
    if (inspectionError) throw new Error(inspectionError.message);
    if (!inspection) return NextResponse.json({ error: "Inspection assignment not found." }, { status: 404 });

    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const action = String(body.action || "").trim();
    const now = new Date().toISOString();
    let historyEventType = `partner_inspection_${action}`;
    let historySummary = `${access.partner.name} updated mechanical inspection: ${action}.`;
    let historyMetadata: Record<string, unknown> = { action };

    if (action === "confirm") {
      const scheduledStartAt = optionalText(body.scheduledStartAt) || inspection.requested_start_at || now;
      const durationHours = Number(body.durationHours || 1.5);
      const scheduledEndAt = new Date(new Date(scheduledStartAt).getTime() + Math.max(durationHours, 0.25) * 3600000).toISOString();
      const { error } = await admin.from("mindful_inventory_inspections").update({ status: "confirmed", partner_confirmation_status: "confirmed", scheduled_start_at: scheduledStartAt, scheduled_end_at: scheduledEndAt, updated_at: now }).eq("id", inspection.id);
      if (error) throw new Error(error.message);
    } else if (action === "start") {
      if (!["confirmed", "revision_requested"].includes(inspection.status)) return NextResponse.json({ error: "Confirm the inspection before starting it." }, { status: 409 });
      const { error } = await admin.from("mindful_inventory_inspections").update({ status: "in_progress", started_at: now, revision_notes: null, updated_at: now }).eq("id", inspection.id);
      if (error) throw new Error(error.message);
    } else if (action === "submit") {
      if (inspection.status !== "in_progress") return NextResponse.json({ error: "Start the inspection before submitting it." }, { status: 409 });
      const [pendingFindings, pendingUpgrades] = await Promise.all([
        admin.from("mindful_inventory_findings").select("id").eq("vehicle_id", inspection.vehicle_id).eq("status", "open").in("source", ["ai", "partner"]).eq("mechanical_validation_status", "pending"),
        admin.from("mindful_inventory_upgrades").select("id").eq("vehicle_id", inspection.vehicle_id).eq("status", "proposed").eq("mechanical_validation_status", "pending"),
      ]);
      if (pendingFindings.error) throw new Error(pendingFindings.error.message);
      if (pendingUpgrades.error) throw new Error(pendingUpgrades.error.message);
      const remaining = (pendingFindings.data?.length || 0) + (pendingUpgrades.data?.length || 0);
      if (remaining) return NextResponse.json({ error: `Review all findings and requested upgrades before submitting the inspection (${remaining} remaining).` }, { status: 409 });
      const { error } = await admin.from("mindful_inventory_inspections").update({ status: "submitted", summary: optionalText(body.summary), submitted_at: now, owner_review_status: "pending", updated_at: now }).eq("id", inspection.id);
      if (error) throw new Error(error.message);
    } else if (action === "validate_finding") {
      const findingId = String(body.findingId || "").trim();
      const status = String(body.status || "").trim();
      if (!findingId || !validationStatuses.has(status)) return NextResponse.json({ error: "Invalid finding validation." }, { status: 400 });

      const { data: finding, error: findingError } = await admin.from("mindful_inventory_findings")
        .select("id,title,mechanical_owner_review_status")
        .eq("id", findingId)
        .eq("vehicle_id", inspection.vehicle_id)
        .in("source", ["ai", "partner"])
        .maybeSingle();
      if (findingError) throw new Error(findingError.message);
      if (!finding) return NextResponse.json({ error: "Finding not found." }, { status: 404 });
      const normalEdit = ["in_progress", "revision_requested"].includes(inspection.status);
      const clarificationEdit = inspection.status === "submitted" && finding.mechanical_owner_review_status === "clarification_requested";
      if (!normalEdit && !clarificationEdit) return NextResponse.json({ error: "This finding is not editable." }, { status: 409 });

      const responseNote = optionalText(body.notes);
      if (clarificationEdit && !responseNote) {
        return NextResponse.json({ error: "Add a response to the Owner before resubmitting this finding." }, { status: 400 });
      }

      const update = {
        mechanical_validation_status: status,
        mechanical_validation_notes: responseNote,
        ...recommendationPatch(body),
        ...(clarificationEdit ? { mechanical_owner_review_status: null, mechanical_owner_reviewed_at: null, mechanical_owner_reviewed_by_user_id: null } : {}),
        updated_at: now,
      };
      const { error } = await admin.from("mindful_inventory_findings").update(update).eq("id", findingId);
      if (error) throw new Error(error.message);

      if (clarificationEdit) {
        historyEventType = "mechanical_finding_clarification_answered";
        historySummary = `${access.partner.name} answered the Owner's clarification on mechanical finding: ${finding.title}.`;
        historyMetadata = { action, findingId, notes: responseNote, status };
      } else {
        historyMetadata = { action, findingId, notes: responseNote, status };
      }
    } else if (action === "validate_upgrade") {
      if (!["in_progress", "revision_requested"].includes(inspection.status)) return NextResponse.json({ error: "Requested upgrades can only be reviewed during an active inspection." }, { status: 409 });
      const upgradeId = String(body.upgradeId || "").trim();
      const status = String(body.status || "").trim();
      if (!upgradeId || !upgradeStatuses.has(status)) return NextResponse.json({ error: "Invalid upgrade review." }, { status: 400 });
      const { error } = await admin.from("mindful_inventory_upgrades").update({
        mechanical_validation_status: status,
        mechanical_validation_notes: optionalText(body.notes),
        ...upgradeRecommendationPatch(body),
        updated_at: now,
      }).eq("id", upgradeId).eq("vehicle_id", inspection.vehicle_id).eq("status", "proposed");
      if (error) throw new Error(error.message);
    } else if (action === "add_finding") {
      if (!["in_progress", "revision_requested"].includes(inspection.status)) return NextResponse.json({ error: "This inspection is not editable." }, { status: 409 });
      const title = String(body.title || "").trim();
      if (!title) return NextResponse.json({ error: "Finding title is required." }, { status: 400 });
      const { error } = await admin.from("mindful_inventory_findings").insert({
        vehicle_id: inspection.vehicle_id,
        inspection_id: inspection.id,
        source: "partner",
        source_user_id: null,
        source_partner_id: access.partner.id,
        title,
        description: optionalText(body.description),
        category: String(body.category || "mechanical"),
        severity: body.severity || null,
        estimated_duration_hours: optionalNonNegativeNumber(body.laborHours, "Labor hours"),
        status: "open",
        mechanical_validation_status: "confirmed",
        mechanical_validation_notes: optionalText(body.notes),
        ...recommendationPatch(body),
      });
      if (error) throw new Error(error.message);
    } else {
      return NextResponse.json({ error: "Unsupported inspection action." }, { status: 400 });
    }

    await admin.from("mindful_inventory_history").insert({
      company_id: access.partner.companyId,
      vehicle_id: inspection.vehicle_id,
      event_type: historyEventType,
      entity_type: action === "validate_upgrade" ? "upgrade" : action === "validate_finding" ? "finding" : "inspection",
      entity_id: action === "validate_upgrade" ? String(body.upgradeId || inspection.id) : action === "validate_finding" ? String(body.findingId || inspection.id) : inspection.id,
      actor_user_id: access.userId,
      summary: historySummary,
      metadata: historyMetadata,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to update inspection." }, { status: 500 });
  }
}
