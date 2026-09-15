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
  primaryLocationId: string | null;
  locations: Array<{ id: string; name: string; address: string | null }>;
  capabilities: Array<{ id: string; name: string; active: boolean; selected: boolean }>;
  loadWarnings: string[];
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
  const { data: partner, error: partnerError } = await admin
    .from("mindful_inventory_partners")
    .select("name,company_name,email,phone,location_text,scheduling_mode,standard_hours,portal_claimed_at,portal_profile_confirmed_at")
    .eq("id", access.partner.id)
    .single();

  if (partnerError) throw new Error(partnerError.message);

  const [capabilityResult, assignmentResult, locationResult, partnerLocationResult] = await Promise.all([
    admin
      .from("mindful_inventory_partner_capabilities")
      .select("id,name,active")
      .eq("company_id", access.partner.companyId)
      .order("name", { ascending: true }),
    admin
      .from("mindful_inventory_partner_capability_assignments")
      .select("capability_id")
      .eq("partner_id", access.partner.id),
    admin
      .from("mindful_inventory_locations")
      .select("id,name,address_line_1,address_line_2,city,state,postal_code")
      .eq("company_id", access.partner.companyId)
      .eq("active", true)
      .order("name", { ascending: true }),
    admin
      .from("mindful_inventory_partner_locations")
      .select("location_id,is_primary")
      .eq("partner_id", access.partner.id),
  ]);

  const loadWarnings: string[] = [];
  if (capabilityResult.error) {
    console.error("[partner/profile] capabilities failed", capabilityResult.error);
    loadWarnings.push("Capabilities could not be loaded.");
  }
  if (assignmentResult.error) {
    console.error("[partner/profile] capability assignments failed", assignmentResult.error);
    loadWarnings.push("Saved capability selections could not be loaded.");
  }
  if (locationResult.error) {
    console.error("[partner/profile] locations failed", locationResult.error);
    loadWarnings.push("Work locations could not be loaded.");
  }
  if (partnerLocationResult.error) {
    console.error("[partner/profile] partner locations failed", partnerLocationResult.error);
    loadWarnings.push("Your default work location could not be loaded.");
  }

  if (!partner.portal_claimed_at) {
    const { error: claimError } = await admin
      .from("mindful_inventory_partners")
      .update({ portal_claimed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", access.partner.id)
      .eq("user_id", access.userId)
      .eq("portal_access_enabled", true);
    if (claimError) {
      console.error("[partner/profile] portal claim update failed", claimError);
      loadWarnings.push("Portal claim status could not be updated.");
    }
  }

  const capabilities = capabilityResult.data ?? [];
  const assignments = assignmentResult.data ?? [];
  const locations = locationResult.data ?? [];
  const partnerLocations = partnerLocationResult.data ?? [];
  const selected = new Set(assignments.map((row) => row.capability_id));
  const primaryLocation = partnerLocations.find((row) => row.is_primary) ?? partnerLocations[0] ?? null;

  return {
    name: partner.name,
    companyName: partner.company_name,
    email: partner.email,
    phone: partner.phone,
    locationText: partner.location_text,
    schedulingMode: partner.scheduling_mode,
    standardHours: normalizeHours(partner.standard_hours),
    profileConfirmedAt: partner.portal_profile_confirmed_at,
    primaryLocationId: primaryLocation?.location_id ?? null,
    locations: locations.map((location) => ({
      id: location.id,
      name: location.name,
      address: [location.address_line_1, location.address_line_2, location.city, location.state, location.postal_code].filter(Boolean).join(", ") || null,
    })),
    capabilities: capabilities.map((capability) => ({
      id: capability.id,
      name: capability.name,
      active: capability.active === true,
      selected: selected.has(capability.id),
    })),
    loadWarnings,
  };
}
