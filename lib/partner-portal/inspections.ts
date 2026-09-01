import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { PartnerPortalAccess } from "@/lib/partner-portal/access";

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
  }>;
};

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
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
  const [vehiclesResult, findingsResult] = await Promise.all([
    admin.from("mindful_inventory_vehicles").select("id,year,make,model,trim,vin,mileage").in("id", vehicleIds),
    admin.from("mindful_inventory_findings").select("id,vehicle_id,title,description,severity,status,source,mechanical_validation_status,mechanical_validation_notes").in("vehicle_id", vehicleIds).eq("status", "open"),
  ]);
  if (vehiclesResult.error) throw new Error(vehiclesResult.error.message);
  if (findingsResult.error) throw new Error(findingsResult.error.message);

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
      findings: (findingsResult.data || []).filter((finding) => finding.vehicle_id === row.vehicle_id && finding.source === "ai").map((finding) => ({
        id: finding.id,
        title: finding.title,
        description: finding.description,
        severity: finding.severity,
        validationStatus: finding.mechanical_validation_status || "pending",
        validationNotes: finding.mechanical_validation_notes,
      })),
    };
  });
}
