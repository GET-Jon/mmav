import type { SupabaseClient } from "@supabase/supabase-js";

export type MechanicalPartnerDayHours = { enabled: boolean; start: string; end: string };
export type MechanicalPartnerStandardHours = Record<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun", MechanicalPartnerDayHours>;

export type MechanicalInspectorBusySlot = {
  startAt: string;
  endAt: string;
  kind: "inspection" | "work_order";
};

export type MechanicalInspectorOption = {
  id: string;
  name: string;
  companyName: string | null;
  locationText: string | null;
  defaultInspectionFee: number | null;
  typicalDurationHours: number | null;
  openInspectionCount: number;
  standardHours: MechanicalPartnerStandardHours | null;
  busySlots: MechanicalInspectorBusySlot[];
  recommended: boolean;
};

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function standardHoursOrNull(value: unknown): MechanicalPartnerStandardHours | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as MechanicalPartnerStandardHours;
}

export async function getMechanicalInspectorOptions(supabase: SupabaseClient, companyId: string): Promise<MechanicalInspectorOption[]> {
  const { data: partners, error } = await supabase
    .from("mindful_inventory_partners")
    .select("id,name,company_name,location_text,default_inspection_fee,typical_inspection_duration_hours,standard_hours")
    .eq("company_id", companyId)
    .eq("active", true)
    .eq("portal_access_enabled", true)
    .eq("mechanical_inspection_eligible", true)
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  if (!partners?.length) return [];

  const ids = partners.map((partner) => partner.id);
  const [inspectionsResult, workOrdersResult] = await Promise.all([
    supabase
      .from("mindful_inventory_inspections")
      .select("performed_by_partner_id,status,scheduled_start_at,scheduled_end_at")
      .in("performed_by_partner_id", ids)
      .eq("inspection_type", "mechanical")
      .in("status", ["assigned", "confirmed", "in_progress", "revision_requested"]),
    supabase
      .from("mindful_inventory_work_orders")
      .select("assigned_partner_id,status,scheduled_start_at,scheduled_end_at")
      .in("assigned_partner_id", ids)
      .not("scheduled_start_at", "is", null)
      .not("scheduled_end_at", "is", null)
      .not("status", "in", "(complete,cancelled)"),
  ]);
  if (inspectionsResult.error) throw new Error(inspectionsResult.error.message);
  if (workOrdersResult.error) throw new Error(workOrdersResult.error.message);

  const load = new Map<string, number>();
  const busy = new Map<string, MechanicalInspectorBusySlot[]>();

  for (const inspection of inspectionsResult.data || []) {
    if (!inspection.performed_by_partner_id) continue;
    load.set(inspection.performed_by_partner_id, (load.get(inspection.performed_by_partner_id) || 0) + 1);
    if (inspection.scheduled_start_at && inspection.scheduled_end_at) {
      busy.set(inspection.performed_by_partner_id, [
        ...(busy.get(inspection.performed_by_partner_id) || []),
        { startAt: inspection.scheduled_start_at, endAt: inspection.scheduled_end_at, kind: "inspection" },
      ]);
    }
  }

  for (const workOrder of workOrdersResult.data || []) {
    if (!workOrder.assigned_partner_id || !workOrder.scheduled_start_at || !workOrder.scheduled_end_at) continue;
    busy.set(workOrder.assigned_partner_id, [
      ...(busy.get(workOrder.assigned_partner_id) || []),
      { startAt: workOrder.scheduled_start_at, endAt: workOrder.scheduled_end_at, kind: "work_order" },
    ]);
  }

  const options = partners.map((partner) => ({
    id: partner.id,
    name: partner.name,
    companyName: partner.company_name,
    locationText: partner.location_text,
    defaultInspectionFee: numberOrNull(partner.default_inspection_fee),
    typicalDurationHours: numberOrNull(partner.typical_inspection_duration_hours),
    openInspectionCount: load.get(partner.id) || 0,
    standardHours: standardHoursOrNull(partner.standard_hours),
    busySlots: busy.get(partner.id) || [],
    recommended: false,
  }));

  options.sort((a, b) => a.openInspectionCount - b.openInspectionCount || (a.typicalDurationHours || 999) - (b.typicalDurationHours || 999) || a.name.localeCompare(b.name));
  if (options[0]) options[0].recommended = true;
  return options;
}
