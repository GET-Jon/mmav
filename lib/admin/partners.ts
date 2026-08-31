import type { SupabaseClient } from "@supabase/supabase-js";

export type AdminPartnerPermissionSet = {
  view_assigned_work: boolean;
  start_work: boolean;
  complete_work: boolean;
  upload_media: boolean;
  add_notes: boolean;
  report_blocker: boolean;
  update_parts: boolean;
  update_actual_cost: boolean;
  submit_invoice: boolean;
  reschedule_work: boolean;
  add_finding: boolean;
  propose_additional_work: boolean;
  request_plan_change: boolean;
  edit_estimate: boolean;
};

export type PartnerSchedulingMode = "manager_scheduled" | "partner_availability" | "coordination_required" | "partner_self_scheduling";
export type PartnerDayHours = { enabled: boolean; start: string; end: string };
export type PartnerStandardHours = Record<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun", PartnerDayHours>;
export type CapabilitySource = "admin" | "partner";

export const defaultPartnerStandardHours: PartnerStandardHours = {
  mon: { enabled: true, start: "09:00", end: "17:00" },
  tue: { enabled: true, start: "09:00", end: "17:00" },
  wed: { enabled: true, start: "09:00", end: "17:00" },
  thu: { enabled: true, start: "09:00", end: "17:00" },
  fri: { enabled: true, start: "09:00", end: "17:00" },
  sat: { enabled: false, start: "09:00", end: "17:00" },
  sun: { enabled: false, start: "09:00", end: "17:00" },
};

export type AdminPartner = {
  id: string;
  userId: string | null;
  name: string;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  active: boolean;
  schedulingMode: PartnerSchedulingMode;
  standardHours: PartnerStandardHours;
  notes: string | null;
  primaryLocationId: string | null;
  primaryLocationName: string | null;
  capabilities: Array<{ id: string; code: string; name: string; source: CapabilitySource }>;
  permissions: AdminPartnerPermissionSet;
};

export type AdminCapability = { id: string; code: string; name: string; active: boolean; source: CapabilitySource };
export type AdminPartnerLocationOption = { id: string; name: string };

export const defaultPartnerPermissions: AdminPartnerPermissionSet = {
  view_assigned_work: true,
  start_work: false,
  complete_work: false,
  upload_media: false,
  add_notes: false,
  report_blocker: false,
  update_parts: false,
  update_actual_cost: false,
  submit_invoice: false,
  reschedule_work: false,
  add_finding: false,
  propose_additional_work: false,
  request_plan_change: false,
  edit_estimate: false,
};

function normalizeHours(value: unknown): PartnerStandardHours {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const next = structuredClone(defaultPartnerStandardHours);
  (Object.keys(next) as Array<keyof PartnerStandardHours>).forEach((day) => {
    const row = source[day] && typeof source[day] === "object" ? source[day] as Record<string, unknown> : {};
    next[day] = {
      enabled: typeof row.enabled === "boolean" ? row.enabled : next[day].enabled,
      start: typeof row.start === "string" ? row.start : next[day].start,
      end: typeof row.end === "string" ? row.end : next[day].end,
    };
  });
  return next;
}

export async function getAdminPartnerData(supabase: SupabaseClient, companyId: string) {
  const [partnersResult, capabilityResult, locationsResult] = await Promise.all([
    supabase
      .from("mindful_inventory_partners")
      .select("id,user_id,name,company_name,email,phone,active,scheduling_mode,standard_hours,notes")
      .eq("company_id", companyId)
      .order("active", { ascending: false })
      .order("name", { ascending: true }),
    supabase
      .from("mindful_inventory_partner_capabilities")
      .select("id,code,name,active,source")
      .eq("company_id", companyId)
      .order("name", { ascending: true }),
    supabase
      .from("mindful_inventory_locations")
      .select("id,name")
      .eq("company_id", companyId)
      .eq("active", true)
      .order("name", { ascending: true }),
  ]);

  if (partnersResult.error) throw new Error(partnersResult.error.message);
  if (capabilityResult.error) throw new Error(capabilityResult.error.message);
  if (locationsResult.error) throw new Error(locationsResult.error.message);

  const partnerIds = (partnersResult.data || []).map((partner) => partner.id);
  const [assignmentsResult, permissionsResult, locationLinksResult] = await Promise.all([
    partnerIds.length
      ? supabase.from("mindful_inventory_partner_capability_assignments").select("partner_id,capability_id").in("partner_id", partnerIds)
      : Promise.resolve({ data: [], error: null }),
    partnerIds.length
      ? supabase.from("mindful_inventory_partner_permissions").select("partner_id,view_assigned_work,start_work,complete_work,upload_media,add_notes,report_blocker,update_parts,update_actual_cost,submit_invoice,reschedule_work,add_finding,propose_additional_work,request_plan_change,edit_estimate").in("partner_id", partnerIds)
      : Promise.resolve({ data: [], error: null }),
    partnerIds.length
      ? supabase.from("mindful_inventory_partner_locations").select("partner_id,location_id,is_primary").in("partner_id", partnerIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (assignmentsResult.error) throw new Error(assignmentsResult.error.message);
  if (permissionsResult.error) throw new Error(permissionsResult.error.message);
  if (locationLinksResult.error) throw new Error(locationLinksResult.error.message);

  const capabilities: AdminCapability[] = (capabilityResult.data || []).map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    active: row.active === true,
    source: row.source === "partner" ? "partner" : "admin",
  }));
  const capabilityById = new Map(capabilities.map((capability) => [capability.id, capability]));
  const assignments = new Map<string, AdminPartner["capabilities"]>();
  for (const row of assignmentsResult.data || []) {
    const capability = capabilityById.get(row.capability_id);
    if (!capability) continue;
    assignments.set(row.partner_id, [...(assignments.get(row.partner_id) || []), capability]);
  }
  const permissions = new Map((permissionsResult.data || []).map((row) => [row.partner_id, row]));
  const locations = (locationsResult.data || []) as AdminPartnerLocationOption[];
  const locationNameById = new Map(locations.map((location) => [location.id, location.name]));
  const primaryLocationByPartner = new Map<string, string>();
  for (const row of locationLinksResult.data || []) {
    if (row.is_primary || !primaryLocationByPartner.has(row.partner_id)) primaryLocationByPartner.set(row.partner_id, row.location_id);
  }

  const partners: AdminPartner[] = (partnersResult.data || []).map((partner) => {
    const permissionRow = permissions.get(partner.id);
    return {
      id: partner.id,
      userId: partner.user_id,
      name: partner.name,
      companyName: partner.company_name,
      email: partner.email,
      phone: partner.phone,
      active: Boolean(partner.active),
      schedulingMode: partner.scheduling_mode as PartnerSchedulingMode,
      standardHours: normalizeHours(partner.standard_hours),
      notes: partner.notes,
      primaryLocationId: primaryLocationByPartner.get(partner.id) || null,
      primaryLocationName: locationNameById.get(primaryLocationByPartner.get(partner.id) || "") || null,
      capabilities: assignments.get(partner.id) || [],
      permissions: permissionRow
        ? {
            view_assigned_work: Boolean(permissionRow.view_assigned_work),
            start_work: Boolean(permissionRow.start_work),
            complete_work: Boolean(permissionRow.complete_work),
            upload_media: Boolean(permissionRow.upload_media),
            add_notes: Boolean(permissionRow.add_notes),
            report_blocker: Boolean(permissionRow.report_blocker),
            update_parts: Boolean(permissionRow.update_parts),
            update_actual_cost: Boolean(permissionRow.update_actual_cost),
            submit_invoice: Boolean(permissionRow.submit_invoice),
            reschedule_work: Boolean(permissionRow.reschedule_work),
            add_finding: Boolean(permissionRow.add_finding),
            propose_additional_work: Boolean(permissionRow.propose_additional_work),
            request_plan_change: Boolean(permissionRow.request_plan_change),
            edit_estimate: Boolean(permissionRow.edit_estimate),
          }
        : { ...defaultPartnerPermissions },
    };
  });

  return { partners, capabilities, locations };
}
