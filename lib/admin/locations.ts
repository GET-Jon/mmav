import type { SupabaseClient } from "@supabase/supabase-js";

export type AdminResource = {
  id: string;
  locationId: string;
  name: string;
  resourceType: string;
  active: boolean;
  notes: string | null;
};

export type AdminLocation = {
  id: string;
  name: string;
  locationType: string;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string;
  active: boolean;
  notes: string | null;
  resources: AdminResource[];
};

export async function getAdminLocationData(supabase: SupabaseClient, companyId: string): Promise<AdminLocation[]> {
  const { data: locations, error: locationsError } = await supabase
    .from("mindful_inventory_locations")
    .select("id,name,location_type,address_line_1,address_line_2,city,state,postal_code,country,active,notes")
    .eq("company_id", companyId)
    .order("active", { ascending: false })
    .order("name", { ascending: true });
  if (locationsError) throw new Error(locationsError.message);

  const locationIds = (locations || []).map((row) => row.id);
  const resourcesResult = locationIds.length
    ? await supabase
        .from("mindful_inventory_resources")
        .select("id,location_id,name,resource_type,active,notes")
        .in("location_id", locationIds)
        .order("active", { ascending: false })
        .order("name", { ascending: true })
    : { data: [], error: null };
  if (resourcesResult.error) throw new Error(resourcesResult.error.message);

  const resourcesByLocation = new Map<string, AdminResource[]>();
  for (const row of resourcesResult.data || []) {
    const current = resourcesByLocation.get(row.location_id) || [];
    current.push({
      id: row.id,
      locationId: row.location_id,
      name: row.name,
      resourceType: row.resource_type,
      active: Boolean(row.active),
      notes: row.notes,
    });
    resourcesByLocation.set(row.location_id, current);
  }

  return (locations || []).map((row) => ({
    id: row.id,
    name: row.name,
    locationType: row.location_type,
    addressLine1: row.address_line_1,
    addressLine2: row.address_line_2,
    city: row.city,
    state: row.state,
    postalCode: row.postal_code,
    country: row.country || "US",
    active: Boolean(row.active),
    notes: row.notes,
    resources: resourcesByLocation.get(row.id) || [],
  }));
}
