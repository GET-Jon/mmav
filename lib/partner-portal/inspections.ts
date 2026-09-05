import { loadFindingConversation, type FindingConversationMessage } from "@/lib/mindful-inventory/finding-conversation";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { PartnerPortalAccess } from "@/lib/partner-portal/access";

export type MechanicalPartSuggestion = {
  name: string;
  quantity: number;
  partNumber: string | null;
  notes: string | null;
};

export type PartnerInspectionUpgrade = {
  id: string;
  title: string;
  description: string | null;
  desiredOutcome: string | null;
  manufacturer: string | null;
  partNumber: string | null;
  quantity: number;
  preferredVendor: string | null;
  validationStatus: string;
  validationNotes: string | null;
  recommendedAction: string | null;
  partSuggestions: MechanicalPartSuggestion[];
  canPerform: boolean | null;
  laborHours: number | null;
  proposedLaborPrice: number | null;
};

export type PartnerInspectionItem = {
  id: string;
  vehicleId: string;
  vehicleLabel: string;
  vin: string | null;
  mileage: number | null;
  status: string;
  requestedStartAt: string | null;
  scheduledStartAt: string | null;
  scheduledEndAt: string | null;
  confirmationStatus: string | null;
  inspectionFee: number | null;
  summary: string | null;
  revisionNotes: string | null;
  ownerReviewStatus: string | null;
  findings: Array<{
    id: string;
    title: string;
    description: string | null;
    severity: string | null;
    validationStatus: string;
    validationNotes: string | null;
    recommendedAction: string | null;
    partsRequired: string | null;
    partSuggestions: MechanicalPartSuggestion[];
    canPerform: boolean | null;
    laborHours: number | null;
    proposedLaborPrice: number | null;
    ownerReviewStatus: string | null;
    ownerReviewNotes: string | null;
    conversation: FindingConversationMessage[];
  }>;
  upgrades: PartnerInspectionUpgrade[];
};

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function partsOrEmpty(value: unknown): MechanicalPartSuggestion[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
    const row = raw as Record<string, unknown>;
    const name = String(row.name ?? row.description ?? "").trim();
    if (!name) return [];
    return [{
      name,
      quantity: numberOrNull(row.quantity) || 1,
      partNumber: String(row.partNumber ?? row.part_number ?? "").trim() || null,
      notes: String(row.notes || "").trim() || null,
    }];
  });
}

export async function getPartnerInspectionAssignments(access: PartnerPortalAccess): Promise<PartnerInspectionItem[]> {
  if (!access.partner.mechanicalInspectionEligible) return [];
  const admin = createSupabaseAdminClient();

  const { data: inspections, error } = await admin
    .from("mindful_inventory_inspections")
    .select("id,vehicle_id,status,requested_start_at,scheduled_start_at,scheduled_end_at,partner_confirmation_status,inspection_fee,summary,revision_notes,owner_review_status,created_at")
    .eq("performed_by_partner_id", access.partner.id)
    .eq("inspection_type", "mechanical")
    .neq("status", "cancelled")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  if (!inspections?.length) return [];

  const vehicleIds = [...new Set(inspections.map((row) => row.vehicle_id))];
  const [vehiclesResult, findingsResult, upgradesResult] = await Promise.all([
    admin.from("mindful_inventory_vehicles").select("id,year,make,model,trim,vin,mileage").in("id", vehicleIds),
    admin.from("mindful_inventory_findings").select("id,vehicle_id,title,description,severity,status,source,mechanical_validation_status,mechanical_validation_notes,mechanical_recommended_action,mechanical_parts_required,mechanical_part_suggestions,mechanical_can_perform,mechanical_labor_hours,mechanical_proposed_labor_price,mechanical_owner_review_status,mechanical_owner_review_notes,updated_at").in("vehicle_id", vehicleIds).eq("status", "open"),
    admin.from("mindful_inventory_upgrades").select("id,vehicle_id,title,description,desired_outcome,manufacturer,part_number,quantity,preferred_vendor,status,mechanical_validation_status,mechanical_validation_notes,mechanical_recommended_action,mechanical_part_suggestions,mechanical_can_perform,mechanical_labor_hours,mechanical_proposed_labor_price").in("vehicle_id", vehicleIds).eq("status", "proposed"),
  ]);
  if (vehiclesResult.error) throw new Error(vehiclesResult.error.message);
  if (findingsResult.error) throw new Error(findingsResult.error.message);
  if (upgradesResult.error) throw new Error(upgradesResult.error.message);

  const findingRows = findingsResult.data || [];
  const conversationByFinding = await loadFindingConversation(admin, findingRows.map((finding) => finding.id));
  const vehicles = new Map((vehiclesResult.data || []).map((row) => [row.id, row]));
  return inspections.map((row) => {
    const vehicle = vehicles.get(row.vehicle_id);
    return {
      id: row.id,
      vehicleId: row.vehicle_id,
      vehicleLabel: vehicle ? [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(" ") : "Vehicle",
      vin: vehicle?.vin || null,
      mileage: numberOrNull(vehicle?.mileage),
      status: row.status,
      requestedStartAt: row.requested_start_at,
      scheduledStartAt: row.scheduled_start_at,
      scheduledEndAt: row.scheduled_end_at,
      confirmationStatus: row.partner_confirmation_status,
      inspectionFee: numberOrNull(row.inspection_fee),
      summary: row.summary,
      revisionNotes: row.revision_notes,
      ownerReviewStatus: row.owner_review_status,
      findings: findingRows.filter((finding) => finding.vehicle_id === row.vehicle_id && ["ai", "partner"].includes(finding.source)).map((finding) => {
        const conversation = [...(conversationByFinding.get(finding.id) || [])];
        const last = conversation.at(-1);
        const response = String(finding.mechanical_validation_notes || "").trim();
        if (last?.role === "owner" && finding.mechanical_owner_review_status !== "clarification_requested" && response) {
          conversation.push({ id: `legacy-response-${finding.id}-${finding.updated_at}`, role: "partner", message: response, createdAt: finding.updated_at });
        }
        return {
          id: finding.id,
          title: finding.title,
          description: finding.description,
          severity: finding.severity,
          validationStatus: finding.mechanical_validation_status || "pending",
          validationNotes: finding.mechanical_validation_notes,
          recommendedAction: finding.mechanical_recommended_action,
          partsRequired: finding.mechanical_parts_required,
          partSuggestions: partsOrEmpty(finding.mechanical_part_suggestions),
          canPerform: typeof finding.mechanical_can_perform === "boolean" ? finding.mechanical_can_perform : null,
          laborHours: numberOrNull(finding.mechanical_labor_hours),
          proposedLaborPrice: numberOrNull(finding.mechanical_proposed_labor_price),
          ownerReviewStatus: finding.mechanical_owner_review_status,
          ownerReviewNotes: finding.mechanical_owner_review_notes,
          conversation,
        };
      }),
      upgrades: (upgradesResult.data || []).filter((upgrade) => upgrade.vehicle_id === row.vehicle_id).map((upgrade) => ({
        id: upgrade.id,
        title: upgrade.title,
        description: upgrade.description,
        desiredOutcome: upgrade.desired_outcome,
        manufacturer: upgrade.manufacturer,
        partNumber: upgrade.part_number,
        quantity: numberOrNull(upgrade.quantity) || 1,
        preferredVendor: upgrade.preferred_vendor,
        validationStatus: upgrade.mechanical_validation_status || "pending",
        validationNotes: upgrade.mechanical_validation_notes,
        recommendedAction: upgrade.mechanical_recommended_action,
        partSuggestions: partsOrEmpty(upgrade.mechanical_part_suggestions),
        canPerform: typeof upgrade.mechanical_can_perform === "boolean" ? upgrade.mechanical_can_perform : null,
        laborHours: numberOrNull(upgrade.mechanical_labor_hours),
        proposedLaborPrice: numberOrNull(upgrade.mechanical_proposed_labor_price),
      })),
    };
  });
}
