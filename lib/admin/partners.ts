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
  name: string;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  active: boolean;
  schedulingMode: PartnerSchedulingMode;
  standardHours: PartnerStandardHours;
  notes: string | null;
  capabilities: Array<{ id: string; code: string; name: string }>;
  permissions: AdminPartnerPermissionSet;
};

export type AdminCapability = { id: string; code: string; name: string; active: boolean };

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
  const [partnersResult, capabilityResult] = await Promise.all([
    supabase
      .from("mindful_inventory_partners")
      .select("id,name,company_name,email,phone,active,scheduling_mode,standard_hours,notes")
      .eq("company_id", companyId)
      .order("active", { ascending: false })
      .order("name", { ascending: true }),
    supabase
      .from("mindful_inventory_partner_capabilities")
      .select("id,code,name,active")
      .eq("company_id", companyId)
      .order("name", { ascending: true }),
  ]);

  if (partnersResult.error) throw new Error(partnersResult.error.message);
  if (capabilityResult.error) throw new Error(capabilityResult.error.message);

  const partnerIds = (partnersResult.data || []).map((partner) => partner.id);
  const [assignmentsResult, permissionsResult] = await Promise.all([
    partnerIds.length
      ? supabase.from("mindful_inventory_partner_capability_assignments").select("partner_id,capability_id").in("partner_id", partnerIds)
      : Promise.resolve({ data: [], error: null }),
    partnerIds.length
      ? supabase.from("mindful_inventory_partner_permissions").select("partner_id,view_assigned_work,start_work,complete_work,upload_media,add_notes,report_blocker,update_parts,update_actual_cost,submit_invoice,reschedule_work,add_finding,propose_additional_work,request_plan_change,edit_estimate").in("partner_id", partnerIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (assignmentsResult.error) throw new Error(assignmentsResult.error.message);
  if (permissionsResult.error) throw new Error(permissionsResult.error.message);

  const capabilities = (capabilityResult.data || []) as AdminCapability[];
  const capabilityById = new Map(capabilities.map((capability) => [capability.id, capability]));
  const assignments = new Map<string, AdminPartner["capabilities"]>();
  for (const row of assignmentsResult.data || []) {
    const capability = capabilityById.get(row.capability_id);
    if (!capability) continue;
    assignments.set(row.partner_id, [...(assignments.get(row.partner_id) || []), capability]);
  }
  const permissions = new Map((permissionsResult.data || []).map((row) => [row.partner_id, row]));

  const partners: AdminPartner[] = (partnersResult.data || []).map((partner) => {
    const permissionRow = permissions.get(partner.id);
    return {
      id: partner.id,
      name: partner.name,
      companyName: partner.company_name,
      email: partner.email,
      phone: partner.phone,
      active: Boolean(partner.active),
      schedulingMode: partner.scheduling_mode as PartnerSchedulingMode,
      standardHours: normalizeHours(partner.standard_hours),
      notes: partner.notes,
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

  return { partners, capabilities };
}
