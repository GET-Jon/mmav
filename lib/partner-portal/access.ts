import { redirect } from "next/navigation";

import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/server-auth";

export type PartnerPortalPermissions = {
  viewAssignedWork: boolean;
  startWork: boolean;
  completeWork: boolean;
  uploadMedia: boolean;
  addNotes: boolean;
  reportBlocker: boolean;
  updateParts: boolean;
  updateActualCost: boolean;
  submitInvoice: boolean;
  rescheduleWork: boolean;
  addFinding: boolean;
  proposeAdditionalWork: boolean;
  requestPlanChange: boolean;
  editEstimate: boolean;
};

export type PartnerPortalAccess = {
  userId: string;
  userEmail: string | null;
  partner: {
    id: string;
    companyId: string;
    name: string;
    companyName: string | null;
    email: string | null;
    profileConfirmedAt: string | null;
    accessEnabled: boolean;
  };
  permissions: PartnerPortalPermissions;
};

function normalizePermissions(row: Record<string, unknown> | null): PartnerPortalPermissions {
  return {
    viewAssignedWork: row?.view_assigned_work === true,
    startWork: row?.start_work === true,
    completeWork: row?.complete_work === true,
    uploadMedia: row?.upload_media === true,
    addNotes: row?.add_notes === true,
    reportBlocker: row?.report_blocker === true,
    updateParts: row?.update_parts === true,
    updateActualCost: row?.update_actual_cost === true,
    submitInvoice: row?.submit_invoice === true,
    rescheduleWork: row?.reschedule_work === true,
    addFinding: row?.add_finding === true,
    proposeAdditionalWork: row?.propose_additional_work === true,
    requestPlanChange: row?.request_plan_change === true,
    editEstimate: row?.edit_estimate === true,
  };
}

export async function getPartnerPortalAccess(): Promise<PartnerPortalAccess | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const admin = createSupabaseAdminClient();
  const { data: partner, error: partnerError } = await admin
    .from("mindful_inventory_partners")
    .select("id,company_id,user_id,name,company_name,email,active,portal_profile_confirmed_at,portal_access_enabled")
    .eq("user_id", user.id)
    .eq("active", true)
    .eq("portal_access_enabled", true)
    .limit(1)
    .maybeSingle();

  if (partnerError) throw new Error(partnerError.message);
  if (!partner) return null;

  const { data: permissions, error: permissionsError } = await admin
    .from("mindful_inventory_partner_permissions")
    .select("view_assigned_work,start_work,complete_work,upload_media,add_notes,report_blocker,update_parts,update_actual_cost,submit_invoice,reschedule_work,add_finding,propose_additional_work,request_plan_change,edit_estimate")
    .eq("partner_id", partner.id)
    .maybeSingle();

  if (permissionsError) throw new Error(permissionsError.message);

  return {
    userId: user.id,
    userEmail: user.email ?? null,
    partner: {
      id: partner.id,
      companyId: partner.company_id,
      name: partner.name,
      companyName: partner.company_name,
      email: partner.email,
      profileConfirmedAt: partner.portal_profile_confirmed_at,
      accessEnabled: partner.portal_access_enabled === true,
    },
    permissions: normalizePermissions(permissions as Record<string, unknown> | null),
  };
}

export async function requirePartnerPortalAccess() {
  const access = await getPartnerPortalAccess();
  if (!access) redirect("/login?next=/partner/work");
  return access;
}
