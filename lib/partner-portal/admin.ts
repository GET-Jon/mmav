import { createSupabaseAdminClient } from "@/lib/supabase/server";

export type PartnerPortalAdminItem = {
  id: string;
  name: string;
  companyName: string | null;
  email: string | null;
  userId: string | null;
  invitedAt: string | null;
  claimedAt: string | null;
  profileConfirmedAt: string | null;
  accessEnabled: boolean;
  mechanicalInspectionEligible: boolean;
  defaultInspectionFee: number | null;
  typicalInspectionDurationHours: number | null;
};

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function getPartnerPortalAdminItems(companyId: string): Promise<PartnerPortalAdminItem[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("mindful_inventory_partners")
    .select("id,name,company_name,email,user_id,portal_invited_at,portal_claimed_at,portal_profile_confirmed_at,portal_access_enabled,mechanical_inspection_eligible,default_inspection_fee,typical_inspection_duration_hours")
    .eq("company_id", companyId)
    .eq("active", true)
    .order("name", { ascending: true });

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    companyName: row.company_name,
    email: row.email,
    userId: row.user_id,
    invitedAt: row.portal_invited_at,
    claimedAt: row.portal_claimed_at,
    profileConfirmedAt: row.portal_profile_confirmed_at,
    accessEnabled: row.portal_access_enabled === true,
    mechanicalInspectionEligible: row.mechanical_inspection_eligible === true,
    defaultInspectionFee: numberOrNull(row.default_inspection_fee),
    typicalInspectionDurationHours: numberOrNull(row.typical_inspection_duration_hours),
  }));
}
