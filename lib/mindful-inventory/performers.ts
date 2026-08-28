import type { SupabaseClient } from "@supabase/supabase-js";

export type InventoryPerformerOption = {
  key: string;
  type: "partner" | "internal";
  id: string;
  displayName: string;
  secondaryLabel: string | null;
  primaryLocationId: string | null;
  primaryLocationName: string | null;
  capabilityCodes: string[];
  capabilityNames: string[];
  notes: string | null;
};

type InventoryMemberRpcRow = {
  user_id: string;
  display_name: string;
  email: string | null;
  role: string;
};

export async function getInventoryPerformerOptions(
  supabase: SupabaseClient,
  companyId: string,
): Promise<InventoryPerformerOption[]> {
  const [partnersResult, membersResult] = await Promise.all([
    supabase
      .from("mindful_inventory_partners")
      .select("id,name,company_name,notes")
      .eq("company_id", companyId)
      .eq("active", true)
      .order("name", { ascending: true }),
    supabase.rpc("get_inventory_company_members", {
      requested_company_id: companyId,
    }),
  ]);

  if (partnersResult.error) throw new Error(partnersResult.error.message);
  if (membersResult.error) throw new Error(membersResult.error.message);

  const partnerIds = (partnersResult.data || []).map((partner) => partner.id);

  const [locationLinksResult, capabilityLinksResult] = await Promise.all([
    partnerIds.length
      ? supabase
          .from("mindful_inventory_partner_locations")
          .select("partner_id,location_id,is_primary")
          .in("partner_id", partnerIds)
      : Promise.resolve({ data: [], error: null }),
    partnerIds.length
      ? supabase
          .from("mindful_inventory_partner_capability_assignments")
          .select("partner_id,capability_id")
          .in("partner_id", partnerIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (locationLinksResult.error) throw new Error(locationLinksResult.error.message);
  if (capabilityLinksResult.error) throw new Error(capabilityLinksResult.error.message);

  const locationIds = Array.from(
    new Set((locationLinksResult.data || []).map((row) => row.location_id).filter(Boolean)),
  ) as string[];
  const capabilityIds = Array.from(
    new Set((capabilityLinksResult.data || []).map((row) => row.capability_id).filter(Boolean)),
  ) as string[];

  const [locationsResult, capabilitiesResult] = await Promise.all([
    locationIds.length
      ? supabase.from("mindful_inventory_locations").select("id,name").in("id", locationIds)
      : Promise.resolve({ data: [], error: null }),
    capabilityIds.length
      ? supabase
          .from("mindful_inventory_partner_capabilities")
          .select("id,code,name")
          .in("id", capabilityIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (locationsResult.error) throw new Error(locationsResult.error.message);
  if (capabilitiesResult.error) throw new Error(capabilitiesResult.error.message);

  const locations = new Map((locationsResult.data || []).map((row) => [row.id, row.name]));
  const capabilities = new Map(
    (capabilitiesResult.data || []).map((row) => [row.id, { code: row.code, name: row.name }]),
  );

  const primaryLocationByPartner = new Map<string, { id: string; name: string | null }>();
  for (const row of locationLinksResult.data || []) {
    if (!row.is_primary && primaryLocationByPartner.has(row.partner_id)) continue;
    primaryLocationByPartner.set(row.partner_id, {
      id: row.location_id,
      name: locations.get(row.location_id) || null,
    });
  }

  const capabilityIdsByPartner = new Map<string, string[]>();
  for (const row of capabilityLinksResult.data || []) {
    capabilityIdsByPartner.set(row.partner_id, [
      ...(capabilityIdsByPartner.get(row.partner_id) || []),
      row.capability_id,
    ]);
  }

  const partnerOptions: InventoryPerformerOption[] = (partnersResult.data || []).map((partner) => {
    const primaryLocation = primaryLocationByPartner.get(partner.id) || null;
    const partnerCapabilities = (capabilityIdsByPartner.get(partner.id) || [])
      .map((id) => capabilities.get(id))
      .filter(Boolean) as Array<{ code: string; name: string }>;

    return {
      key: `partner:${partner.id}`,
      type: "partner",
      id: partner.id,
      displayName: partner.name,
      secondaryLabel: partner.company_name || null,
      primaryLocationId: primaryLocation?.id || null,
      primaryLocationName: primaryLocation?.name || null,
      capabilityCodes: partnerCapabilities.map((item) => item.code),
      capabilityNames: partnerCapabilities.map((item) => item.name),
      notes: partner.notes || null,
    };
  });

  const memberOptions: InventoryPerformerOption[] = ((membersResult.data || []) as InventoryMemberRpcRow[])
    .map((member) => ({
      key: `user:${member.user_id}`,
      type: "internal" as const,
      id: member.user_id,
      displayName: member.display_name,
      secondaryLabel: member.role || member.email || "Mindful Motor Co.",
      primaryLocationId: null,
      primaryLocationName: null,
      capabilityCodes: [],
      capabilityNames: [],
      notes: null,
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  return [...partnerOptions, ...memberOptions];
}

function normalizedTokens(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((token) => token.length >= 3);
}

export function scorePerformerForWork(
  work: { title: string; category: string },
  performer: InventoryPerformerOption,
) {
  if (performer.type !== "partner") return 0;

  const workTokens = new Set(normalizedTokens(`${work.category} ${work.title}`));
  let score = 0;

  for (const capability of [...performer.capabilityCodes, ...performer.capabilityNames]) {
    for (const token of normalizedTokens(capability)) {
      if (workTokens.has(token)) score += 4;
    }
  }

  if (performer.capabilityCodes.some((code) => code.toLowerCase() === work.category.toLowerCase())) {
    score += 8;
  }

  // Freeform partner notes are useful for niche specialties that do not yet
  // deserve a reusable capability. Keep them a weaker signal than explicit
  // capability assignments so prose cannot outweigh structured configuration.
  if (performer.notes) {
    const noteTokens = new Set(normalizedTokens(performer.notes));
    let noteMatches = 0;
    for (const token of workTokens) {
      if (noteTokens.has(token)) noteMatches += 1;
    }
    score += Math.min(noteMatches, 6);
  }

  return score;
}

export function suggestedPerformerForWork(
  work: { title: string; category: string },
  performers: InventoryPerformerOption[],
) {
  const ranked = performers
    .map((performer) => ({ performer, score: scorePerformerForWork(work, performer) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.performer.displayName.localeCompare(b.performer.displayName));

  if (ranked.length === 0) return null;
  if (ranked.length > 1 && ranked[0].score === ranked[1].score) return null;
  return ranked[0].performer;
}
