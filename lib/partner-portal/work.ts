import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { PartnerPortalAccess } from "@/lib/partner-portal/access";

export type PartnerWorkItem = {
  id: string;
  vehicleId: string;
  vehicleLabel: string;
  vin: string | null;
  stockNumber: string | null;
  mileage: number | null;
  vehicleDetails: {
    year: number | null;
    make: string | null;
    model: string | null;
    trim: string | null;
    bodyClass: string | null;
    fuelType: string | null;
    driveType: string | null;
    displacementL: string | null;
    engineCylinders: string | null;
    plantCountry: string | null;
  };
  title: string;
  description: string | null;
  category: string;
  subcategory: string | null;
  status: string;
  blockerReason: string | null;
  scheduledStartAt: string | null;
  scheduledEndAt: string | null;
  proposedStartAt: string | null;
  proposedEndAt: string | null;
  partnerConfirmationStatus: string | null;
  partnerEstimateStatus: string | null;
  locationName: string | null;
  partnerLocationConfirmationStatus: string | null;
  partnerLocationRequest: string | null;
  partnerPartsConfirmationStatus: string | null;
  partnerPartsNote: string | null;
  parts: Array<{
    id: string;
    description: string;
    quantity: number | null;
    partNumber: string | null;
    status: string;
    etaAt: string | null;
  }>;
  latestEstimate: {
    id: string;
    revisionNo: number;
    quotedCost: number | null;
    estimatedLaborMinutes: number | null;
    estimatedElapsedMinutes: number | null;
    notes: string | null;
    submittedAt: string;
  } | null;
};

function vehicleLabel(row: Record<string, unknown>) {
  return [row.year, row.make, row.model, row.trim]
    .filter((value) => value !== null && value !== undefined && String(value).trim())
    .join(" ");
}

function decodedVehicle(snapshot: unknown) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return {} as Record<string, unknown>;
  const root = snapshot as Record<string, unknown>;
  const lotLogic = root.lotLogicEvaluationSnapshot;
  if (!lotLogic || typeof lotLogic !== "object" || Array.isArray(lotLogic)) return {} as Record<string, unknown>;
  const payload = (lotLogic as Record<string, unknown>).payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return {} as Record<string, unknown>;
  const decoded = (payload as Record<string, unknown>).decodedVehicle;
  return decoded && typeof decoded === "object" && !Array.isArray(decoded)
    ? decoded as Record<string, unknown>
    : {} as Record<string, unknown>;
}

function optionalString(value: unknown) {
  return value == null || String(value).trim() === "" ? null : String(value);
}

export async function getPartnerAssignedWork(access: PartnerPortalAccess): Promise<PartnerWorkItem[]> {
  if (!access.permissions.viewAssignedWork) return [];

  const admin = createSupabaseAdminClient();
  const { data: workOrders, error: workError } = await admin
    .from("mindful_inventory_work_orders")
    .select("id,vehicle_id,title,description,category,subcategory,status,blocker_reason,scheduled_start_at,scheduled_end_at,proposed_start_at,proposed_end_at,partner_confirmation_status,partner_estimate_status,location_id,partner_location_confirmation_status,partner_location_request,partner_parts_confirmation_status,partner_parts_note")
    .eq("assigned_partner_id", access.partner.id)
    .not("status", "eq", "cancelled")
    .order("scheduled_start_at", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (workError) throw new Error(workError.message);
  if (!workOrders?.length) return [];

  const vehicleIds = [...new Set(workOrders.map((row) => row.vehicle_id))];
  const locationIds = [...new Set(workOrders.map((row) => row.location_id).filter(Boolean))] as string[];
  const workOrderIds = workOrders.map((row) => row.id);

  const [vehiclesResult, locationsResult, estimatesResult, partsResult] = await Promise.all([
    admin
      .from("mindful_inventory_vehicles")
      .select("id,year,make,model,trim,vin,stock_number,mileage,source_snapshot")
      .eq("company_id", access.partner.companyId)
      .in("id", vehicleIds),
    locationIds.length
      ? admin
          .from("mindful_inventory_locations")
          .select("id,name")
          .eq("company_id", access.partner.companyId)
          .in("id", locationIds)
      : Promise.resolve({ data: [], error: null }),
    admin
      .from("lot_logic_partner_blind_estimates")
      .select("id,work_order_id,revision_no,quoted_cost,estimated_labor_minutes,estimated_elapsed_minutes,notes,submitted_at")
      .eq("partner_id", access.partner.id)
      .in("work_order_id", workOrderIds)
      .order("revision_no", { ascending: false }),
    admin
      .from("mindful_inventory_work_order_parts")
      .select("id,work_order_id,description,quantity,part_number,status,eta_at")
      .in("work_order_id", workOrderIds)
      .order("created_at", { ascending: true }),
  ]);

  if (vehiclesResult.error) throw new Error(vehiclesResult.error.message);
  if (locationsResult.error) throw new Error(locationsResult.error.message);
  if (estimatesResult.error) throw new Error(estimatesResult.error.message);
  if (partsResult.error) throw new Error(partsResult.error.message);

  const vehicles = new Map((vehiclesResult.data ?? []).map((row) => [row.id, row]));
  const locations = new Map((locationsResult.data ?? []).map((row) => [row.id, row.name]));
  type EstimateRow = NonNullable<typeof estimatesResult.data>[number];
  const latestEstimates = new Map<string, EstimateRow>();
  for (const row of estimatesResult.data ?? []) {
    if (!latestEstimates.has(row.work_order_id)) latestEstimates.set(row.work_order_id, row);
  }

  const partsByWorkOrder = new Map<string, PartnerWorkItem["parts"]>();
  for (const row of partsResult.data ?? []) {
    const current = partsByWorkOrder.get(row.work_order_id) ?? [];
    current.push({
      id: row.id,
      description: row.description,
      quantity: row.quantity == null ? null : Number(row.quantity),
      partNumber: row.part_number,
      status: row.status,
      etaAt: row.eta_at,
    });
    partsByWorkOrder.set(row.work_order_id, current);
  }

  return workOrders
    .filter((row) => vehicles.has(row.vehicle_id))
    .map((row) => {
      const vehicle = vehicles.get(row.vehicle_id)!;
      const decoded = decodedVehicle(vehicle.source_snapshot);
      const estimate = latestEstimates.get(row.id);
      return {
        id: row.id,
        vehicleId: row.vehicle_id,
        vehicleLabel: vehicleLabel(vehicle),
        vin: vehicle.vin,
        stockNumber: vehicle.stock_number,
        mileage: vehicle.mileage,
        vehicleDetails: {
          year: vehicle.year ?? null,
          make: optionalString(vehicle.make),
          model: optionalString(vehicle.model),
          trim: optionalString(vehicle.trim),
          bodyClass: optionalString(decoded.bodyClass),
          fuelType: optionalString(decoded.fuelType),
          driveType: optionalString(decoded.driveType),
          displacementL: optionalString(decoded.displacementL),
          engineCylinders: optionalString(decoded.engineCylinders),
          plantCountry: optionalString(decoded.plantCountry),
        },
        title: row.title,
        description: row.description,
        category: row.category,
        subcategory: row.subcategory,
        status: row.status,
        blockerReason: row.blocker_reason,
        scheduledStartAt: row.scheduled_start_at,
        scheduledEndAt: row.scheduled_end_at,
        proposedStartAt: row.proposed_start_at,
        proposedEndAt: row.proposed_end_at,
        partnerConfirmationStatus: row.partner_confirmation_status,
        partnerEstimateStatus: row.partner_estimate_status,
        locationName: row.location_id ? locations.get(row.location_id) ?? null : null,
        partnerLocationConfirmationStatus: row.partner_location_confirmation_status,
        partnerLocationRequest: row.partner_location_request,
        partnerPartsConfirmationStatus: row.partner_parts_confirmation_status,
        partnerPartsNote: row.partner_parts_note,
        parts: partsByWorkOrder.get(row.id) ?? [],
        latestEstimate: estimate
          ? {
              id: estimate.id,
              revisionNo: estimate.revision_no,
              quotedCost: estimate.quoted_cost == null ? null : Number(estimate.quoted_cost),
              estimatedLaborMinutes: estimate.estimated_labor_minutes,
              estimatedElapsedMinutes: estimate.estimated_elapsed_minutes,
              notes: estimate.notes,
              submittedAt: estimate.submitted_at,
            }
          : null,
      } satisfies PartnerWorkItem;
    });
}
