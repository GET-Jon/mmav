import type { SupabaseClient } from "@supabase/supabase-js";

export type MechanicalInspectorOption = {
  id: string;
  name: string;
  companyName: string | null;
  locationText: string | null;
  defaultInspectionFee: number | null;
  typicalDurationHours: number | null;
  openInspectionCount: number;
  recommended: boolean;
};

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function getMechanicalInspectorOptions(supabase: SupabaseClient, companyId: string): Promise<MechanicalInspectorOption[]> {
  const { data: partners, error } = await supabase
    .from("mindful_inventory_partners")
    .select("id,name,company_name,location_text,default_inspection_fee,typical_inspection_duration_hours")
    .eq("company_id", companyId)
    .eq("active", true)
    .eq("portal_access_enabled", true)
    .eq("mechanical_inspection_eligible", true)
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  if (!partners?.length) return [];

  const ids = partners.map((partner) => partner.id);
  const { data: inspections, error: inspectionError } = await supabase
    .from("mindful_inventory_inspections")
    .select("performed_by_partner_id,status")
    .in("performed_by_partner_id", ids)
    .eq("inspection_type", "mechanical")
    .in("status", ["assigned", "confirmed", "in_progress", "revision_requested"]);
  if (inspectionError) throw new Error(inspectionError.message);

  const load = new Map<string, number>();
  (inspections || []).forEach((inspection) => {
    if (!inspection.performed_by_partner_id) return;
    load.set(inspection.performed_by_partner_id, (load.get(inspection.performed_by_partner_id) || 0) + 1);
  });

  const options = partners.map((partner) => ({
    id: partner.id,
    name: partner.name,
    companyName: partner.company_name,
    locationText: partner.location_text,
    defaultInspectionFee: numberOrNull(partner.default_inspection_fee),
    typicalDurationHours: numberOrNull(partner.typical_inspection_duration_hours),
    openInspectionCount: load.get(partner.id) || 0,
    recommended: false,
  }));

  options.sort((a, b) => a.openInspectionCount - b.openInspectionCount || (a.typicalDurationHours || 999) - (b.typicalDurationHours || 999) || a.name.localeCompare(b.name));
  if (options[0]) options[0].recommended = true;
  return options;
}
