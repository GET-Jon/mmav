import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { defaultPartnerStandardHours, type PartnerStandardHours } from "@/lib/admin/partners";
import type { PartnerPortalAccess } from "@/lib/partner-portal/access";

export type PartnerProfileData = {
  name: string;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  locationText: string | null;
  schedulingMode: string;
  standardHours: PartnerStandardHours;
  profileConfirmedAt: string | null;
  capabilities: Array<{ id: string; name: string; active: boolean; selected: boolean }>;
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

export async function getPartnerProfileData(access: PartnerPortalAccess): Promise<PartnerProfileData> {
  const admin = createSupabaseAdminClient();
  const [{ data: partner, error: partnerError }, { data: capabilities, error: capabilityError }, { data: assignments, error: assignmentError }] = await Promise.all([
    admin
      .from("mindful_inventory_partners")
      .select("name,company_name,email,phone,location_text,scheduling_mode,standard_hours,portal_profile_confirmed_at")
      .eq("id", access.partner.id)
      .single(),
    admin
      .from("mindful_inventory_partner_capabilities")
      .select("id,name,active")
      .eq("company_id", access.partner.companyId)
      .order("name", { ascending: true }),
    admin
      .from("mindful_inventory_partner_capability_assignments")
      .select("capability_id")
      .eq("partner_id", access.partner.id),
  ]);

  if (partnerError) throw new Error(partnerError.message);
  if (capabilityError) throw new Error(capabilityError.message);
  if (assignmentError) throw new Error(assignmentError.message);

  const selected = new Set((assignments ?? []).map((row) => row.capability_id));
  return {
    name: partner.name,
    companyName: partner.company_name,
    email: partner.email,
    phone: partner.phone,
    locationText: partner.location_text,
    schedulingMode: partner.scheduling_mode,
    standardHours: normalizeHours(partner.standard_hours),
    profileConfirmedAt: partner.portal_profile_confirmed_at,
    capabilities: (capabilities ?? []).map((capability) => ({
      id: capability.id,
      name: capability.name,
      active: capability.active === true,
      selected: selected.has(capability.id),
    })),
  };
}
