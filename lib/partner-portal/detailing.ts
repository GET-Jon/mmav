import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { PartnerPortalAccess } from "@/lib/partner-portal/access";

export type PartnerDetailingAssignment = {
  id: string;
  vehicleId: string;
  vehicleLabel: string;
  vin: string | null;
  detailLevel: string;
  scopeItems: string[];
  customScope: string | null;
  status: string;
  scheduledStartAt: string | null;
  expectedTurnaroundMinutes: number | null;
  quotedCost: number | null;
  notes: string | null;
};

export async function getPartnerDetailingAssignments(access: PartnerPortalAccess): Promise<PartnerDetailingAssignment[]> {
  const admin = createSupabaseAdminClient();
  const { data: rows, error } = await admin
    .from("mindful_inventory_detailing")
    .select("id,vehicle_id,detail_level,scope_items,custom_scope,status,scheduled_start_at,expected_turnaround_minutes,quoted_cost,notes")
    .eq("partner_id", access.partner.id)
    .not("status", "eq", "accepted")
    .order("scheduled_start_at", { ascending: true, nullsFirst: false });
  if (error) throw new Error(error.message);
  if (!rows?.length) return [];

  const vehicleIds = rows.map((row) => row.vehicle_id);
  const { data: vehicles, error: vehicleError } = await admin
    .from("mindful_inventory_vehicles")
    .select("id,company_id,year,make,model,trim,vin")
    .in("id", vehicleIds)
    .eq("company_id", access.partner.companyId);
  if (vehicleError) throw new Error(vehicleError.message);
  const byId = new Map((vehicles || []).map((vehicle) => [vehicle.id, vehicle]));

  return rows.flatMap((row) => {
    const vehicle = byId.get(row.vehicle_id);
    if (!vehicle) return [];
    return [{
      id: row.id,
      vehicleId: row.vehicle_id,
      vehicleLabel: [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(" "),
      vin: vehicle.vin,
      detailLevel: row.detail_level,
      scopeItems: Array.isArray(row.scope_items) ? row.scope_items : [],
      customScope: row.custom_scope,
      status: row.status,
      scheduledStartAt: row.scheduled_start_at,
      expectedTurnaroundMinutes: row.expected_turnaround_minutes,
      quotedCost: row.quoted_cost == null ? null : Number(row.quoted_cost),
      notes: row.notes,
    } satisfies PartnerDetailingAssignment];
  });
}
