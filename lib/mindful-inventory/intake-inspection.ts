import type { SupabaseClient } from "@supabase/supabase-js";

export type InventoryIntakeStatus = "draft" | "complete";
export type InventoryInspectionStatus = "draft" | "assigned" | "confirmed" | "in_progress" | "submitted" | "revision_requested" | "complete" | "cancelled";
export type InventoryFindingSeverity = "green" | "yellow" | "red";
export type InventoryFindingSource = "intake" | "inspection" | "ai" | "partner" | "manager" | "qc" | "other";
export type InventoryFindingStatus = "open" | "resolved" | "dismissed";
export type InventoryFindingMechanicalValidationStatus = "pending" | "confirmed" | "not_found" | "changed" | "needs_diagnosis";
export type InventoryFindingOwnerReviewStatus = "accepted" | "dismissed" | "clarification_requested";
export type MechanicalSuggestedPart = { description: string; quantity: number; partNumber: string | null; notes: string | null };

export type IntakeFieldConfirmation = { confirmedAt: string; value: unknown };

export type InventoryIntakeView = {
  id: string; status: InventoryIntakeStatus; mileage: number | null; keysCount: number | null;
  visibleDamageSummary: string | null; initialObservations: string | null;
  preliminaryGrade: "a" | "b" | "c" | "d" | "e" | null;
  fieldConfirmations: Record<string, IntakeFieldConfirmation>; startedAt: string | null; completedAt: string | null;
};

export type InventoryInspectionView = {
  id: string; inspectionType: string; status: InventoryInspectionStatus; summary: string | null;
  startedAt: string | null; completedAt: string | null; performedByUserId: string | null; performedByPartnerId: string | null;
  requestedStartAt: string | null; scheduledStartAt: string | null; scheduledEndAt: string | null;
  partnerConfirmationStatus: string | null; inspectionFee: number | null; submittedAt: string | null;
  ownerReviewStatus: string | null; revisionNotes: string | null;
};

export type InventoryFindingView = {
  id: string; intakeId: string | null; inspectionId: string | null; source: InventoryFindingSource; title: string;
  description: string | null; category: string; subcategory: string | null; severity: InventoryFindingSeverity | null;
  confidence: string | null; certainty: string | null; estimatedCostLow: number | null; estimatedCostHigh: number | null;
  estimatedDurationHours: number | null; status: InventoryFindingStatus; mechanicalValidationStatus: InventoryFindingMechanicalValidationStatus;
  mechanicalValidationNotes: string | null; mechanicalRecommendedAction: string | null; mechanicalPartsRequired: string | null;
  mechanicalCanPerform: boolean | null; mechanicalLaborHours: number | null; mechanicalProposedLaborPrice: number | null;
  mechanicalSuggestedParts: MechanicalSuggestedPart[];
  mechanicalOwnerReviewStatus: InventoryFindingOwnerReviewStatus | null; mechanicalOwnerReviewNotes: string | null;
  resolvedAt: string | null; createdAt: string; updatedAt: string;
};

export type InventoryIntakeInspectionData = { intake: InventoryIntakeView | null; mechanicalInspection: InventoryInspectionView | null; findings: InventoryFindingView[]; planningReady: boolean };

function toNullableNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value); return Number.isFinite(parsed) ? parsed : null;
}
function normalizeConfirmations(value: unknown): Record<string, IntakeFieldConfirmation> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, IntakeFieldConfirmation>;
}
function normalizeSuggestedParts(value: unknown): MechanicalSuggestedPart[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const row = entry as Record<string, unknown>;
    const description = String(row.description ?? row.name ?? "").trim();
    if (!description) return [];
    const parsedQuantity = Number(row.quantity ?? 1);
    return [{
      description,
      quantity: Number.isFinite(parsedQuantity) && parsedQuantity > 0 ? parsedQuantity : 1,
      partNumber: String(row.partNumber ?? row.part_number ?? "").trim() || null,
      notes: String(row.notes || "").trim() || null,
    }];
  });
}

export async function getInventoryIntakeInspectionData(supabase: SupabaseClient, vehicleId: string): Promise<InventoryIntakeInspectionData> {
  const [intakeResult, inspectionResult, findingsResult] = await Promise.all([
    supabase.from("mindful_inventory_intakes").select("id,status,mileage,keys_count,visible_damage_summary,initial_observations,preliminary_grade,field_confirmations,started_at,completed_at").eq("vehicle_id", vehicleId).maybeSingle(),
    supabase.from("mindful_inventory_inspections").select("id,inspection_type,status,summary,started_at,completed_at,performed_by_user_id,performed_by_partner_id,requested_start_at,scheduled_start_at,scheduled_end_at,partner_confirmation_status,inspection_fee,submitted_at,owner_review_status,revision_notes").eq("vehicle_id", vehicleId).eq("inspection_type", "mechanical").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("mindful_inventory_findings").select("id,intake_id,inspection_id,source,title,description,category,subcategory,severity,confidence,certainty,estimated_cost_low,estimated_cost_high,estimated_duration_hours,status,mechanical_validation_status,mechanical_validation_notes,mechanical_recommended_action,mechanical_parts_required,mechanical_can_perform,mechanical_labor_hours,mechanical_proposed_labor_price,mechanical_part_suggestions,mechanical_owner_review_status,mechanical_owner_review_notes,resolved_at,created_at,updated_at").eq("vehicle_id", vehicleId).order("created_at", { ascending: false }),
  ]);
  if (intakeResult.error) throw new Error(intakeResult.error.message);
  if (inspectionResult.error) throw new Error(inspectionResult.error.message);
  if (findingsResult.error) throw new Error(findingsResult.error.message);
  const intakeRow = intakeResult.data; const inspectionRow = inspectionResult.data;
  const intake: InventoryIntakeView | null = intakeRow ? { id: intakeRow.id, status: intakeRow.status as InventoryIntakeStatus, mileage: intakeRow.mileage, keysCount: intakeRow.keys_count, visibleDamageSummary: intakeRow.visible_damage_summary, initialObservations: intakeRow.initial_observations, preliminaryGrade: intakeRow.preliminary_grade, fieldConfirmations: normalizeConfirmations(intakeRow.field_confirmations), startedAt: intakeRow.started_at, completedAt: intakeRow.completed_at } : null;
  const mechanicalInspection: InventoryInspectionView | null = inspectionRow ? { id: inspectionRow.id, inspectionType: inspectionRow.inspection_type, status: inspectionRow.status as InventoryInspectionStatus, summary: inspectionRow.summary, startedAt: inspectionRow.started_at, completedAt: inspectionRow.completed_at, performedByUserId: inspectionRow.performed_by_user_id, performedByPartnerId: inspectionRow.performed_by_partner_id, requestedStartAt: inspectionRow.requested_start_at, scheduledStartAt: inspectionRow.scheduled_start_at, scheduledEndAt: inspectionRow.scheduled_end_at, partnerConfirmationStatus: inspectionRow.partner_confirmation_status, inspectionFee: toNullableNumber(inspectionRow.inspection_fee), submittedAt: inspectionRow.submitted_at, ownerReviewStatus: inspectionRow.owner_review_status, revisionNotes: inspectionRow.revision_notes } : null;
  const findings: InventoryFindingView[] = (findingsResult.data || []).map((row) => ({ id: row.id, intakeId: row.intake_id, inspectionId: row.inspection_id, source: row.source as InventoryFindingSource, title: row.title, description: row.description, category: row.category, subcategory: row.subcategory, severity: row.severity as InventoryFindingSeverity | null, confidence: row.confidence, certainty: row.certainty, estimatedCostLow: toNullableNumber(row.estimated_cost_low), estimatedCostHigh: toNullableNumber(row.estimated_cost_high), estimatedDurationHours: toNullableNumber(row.estimated_duration_hours), status: row.status as InventoryFindingStatus, mechanicalValidationStatus: (row.mechanical_validation_status || "pending") as InventoryFindingMechanicalValidationStatus, mechanicalValidationNotes: row.mechanical_validation_notes, mechanicalRecommendedAction: row.mechanical_recommended_action, mechanicalPartsRequired: row.mechanical_parts_required, mechanicalCanPerform: typeof row.mechanical_can_perform === "boolean" ? row.mechanical_can_perform : null, mechanicalLaborHours: toNullableNumber(row.mechanical_labor_hours), mechanicalProposedLaborPrice: toNullableNumber(row.mechanical_proposed_labor_price), mechanicalSuggestedParts: normalizeSuggestedParts(row.mechanical_part_suggestions), mechanicalOwnerReviewStatus: (["accepted", "dismissed", "clarification_requested"] as const).includes(row.mechanical_owner_review_status as InventoryFindingOwnerReviewStatus) ? row.mechanical_owner_review_status as InventoryFindingOwnerReviewStatus : null, mechanicalOwnerReviewNotes: row.mechanical_owner_review_notes, resolvedAt: row.resolved_at, createdAt: row.created_at, updatedAt: row.updated_at }));
  return { intake, mechanicalInspection, findings, planningReady: intake?.status === "complete" && mechanicalInspection?.status === "complete" };
}
