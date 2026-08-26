import type { SupabaseClient } from "@supabase/supabase-js";

export type InventoryWorkOrderStatus =
  | "planned"
  | "ready_to_schedule"
  | "scheduled"
  | "in_progress"
  | "blocked"
  | "complete"
  | "cancelled";

export type InventoryWorkOrderView = {
  id: string;
  vehicleId: string;
  planItemId: string;
  planVersionId: string;
  title: string;
  description: string | null;
  category: string;
  classification: string;
  status: InventoryWorkOrderStatus;
  blockerReason: string | null;
  estimatedDurationMinutes: number | null;
  estimatedLaborMinutes: number | null;
  estimatedElapsedMinutes: number | null;
  scheduledStartAt: string | null;
  scheduledEndAt: string | null;
  proposedStartAt: string | null;
  proposedEndAt: string | null;
  partnerConfirmationStatus: "awaiting_partner" | "confirmed" | "declined" | null;
  scheduleSource: "suggested" | "manual" | null;
  actualStartAt: string | null;
  actualEndAt: string | null;
  approvedBudget: number;
  currentForecast: number;
  actualCost: number | null;
  assignedPartnerId: string | null;
  assignedUserId: string | null;
  performerName: string | null;
  performerType: "partner" | "internal" | null;
  partnerEmail: string | null;
  partnerSchedulingMode: string | null;
  locationId: string | null;
  locationName: string | null;
  resourceId: string | null;
  resourceName: string | null;
  createdAt: string;
  updatedAt: string;
};

export type InventorySchedulingLocationOption = {
  id: string;
  name: string;
  locationType: string;
};

export type InventorySchedulingResourceOption = {
  id: string;
  locationId: string;
  name: string;
  resourceType: string;
};

function numberValue(value: number | string | null | undefined, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function nullableNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function getInventorySchedulingOptions(
  supabase: SupabaseClient,
  companyId: string,
): Promise<{ locations: InventorySchedulingLocationOption[]; resources: InventorySchedulingResourceOption[] }> {
  const { data: locations, error: locationsError } = await supabase
    .from("mindful_inventory_locations")
    .select("id,name,location_type")
    .eq("company_id", companyId)
    .eq("active", true)
    .order("name", { ascending: true });
  if (locationsError) throw new Error(locationsError.message);

  const locationIds = (locations || []).map((row) => row.id);
  const { data: resources, error: resourcesError } = locationIds.length
    ? await supabase
        .from("mindful_inventory_resources")
        .select("id,location_id,name,resource_type")
        .in("location_id", locationIds)
        .eq("active", true)
        .order("name", { ascending: true })
    : { data: [], error: null };
  if (resourcesError) throw new Error(resourcesError.message);

  return {
    locations: (locations || []).map((row) => ({ id: row.id, name: row.name, locationType: row.location_type })),
    resources: (resources || []).map((row) => ({ id: row.id, locationId: row.location_id, name: row.name, resourceType: row.resource_type })),
  };
}

export async function getInventoryActiveWork(
  supabase: SupabaseClient,
  vehicleId: string,
): Promise<InventoryWorkOrderView[]> {
  const { data: vehicle, error: vehicleError } = await supabase
    .from("mindful_inventory_vehicles")
    .select("company_id")
    .eq("id", vehicleId)
    .single();
  if (vehicleError) throw new Error(vehicleError.message);

  const { data, error } = await supabase
    .from("mindful_inventory_work_orders")
    .select("id,vehicle_id,plan_item_id,plan_version_id,title,description,category,classification,status,blocker_reason,estimated_duration_minutes,estimated_labor_minutes,estimated_elapsed_minutes,scheduled_start_at,scheduled_end_at,proposed_start_at,proposed_end_at,partner_confirmation_status,schedule_source,actual_start_at,actual_end_at,approved_budget,current_forecast,actual_cost,assigned_partner_id,assigned_user_id,location_id,resource_id,created_at,updated_at")
    .eq("vehicle_id", vehicleId)
    .order("scheduled_start_at", { ascending: true, nullsFirst: false })
    .order("proposed_start_at", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);

  const partnerIds = Array.from(new Set((data || []).map((row) => row.assigned_partner_id).filter(Boolean))) as string[];
  const locationIds = Array.from(new Set((data || []).map((row) => row.location_id).filter(Boolean))) as string[];
  const resourceIds = Array.from(new Set((data || []).map((row) => row.resource_id).filter(Boolean))) as string[];
  const assignedUserIds = new Set((data || []).map((row) => row.assigned_user_id).filter(Boolean) as string[]);

  const [partnersResult, locationsResult, resourcesResult, membersResult] = await Promise.all([
    partnerIds.length
      ? supabase.from("mindful_inventory_partners").select("id,name,company_name,email,scheduling_mode").in("id", partnerIds)
      : Promise.resolve({ data: [], error: null }),
    locationIds.length ? supabase.from("mindful_inventory_locations").select("id,name").in("id", locationIds) : Promise.resolve({ data: [], error: null }),
    resourceIds.length ? supabase.from("mindful_inventory_resources").select("id,name").in("id", resourceIds) : Promise.resolve({ data: [], error: null }),
    supabase.rpc("get_inventory_company_members", { requested_company_id: vehicle.company_id }),
  ]);

  if (partnersResult.error) throw new Error(partnersResult.error.message);
  if (locationsResult.error) throw new Error(locationsResult.error.message);
  if (resourcesResult.error) throw new Error(resourcesResult.error.message);
  if (membersResult.error) throw new Error(membersResult.error.message);

  const partners = new Map((partnersResult.data || []).map((row) => [row.id, {
    name: row.company_name ? `${row.name} · ${row.company_name}` : row.name,
    email: row.email || null,
    schedulingMode: row.scheduling_mode || null,
  }]));
  const locations = new Map((locationsResult.data || []).map((row) => [row.id, row.name]));
  const resources = new Map((resourcesResult.data || []).map((row) => [row.id, row.name]));
  const members = new Map(
    (membersResult.data || [])
      .filter((row: { user_id: string }) => assignedUserIds.has(row.user_id))
      .map((row: { user_id: string; display_name: string }) => [row.user_id, row.display_name]),
  );

  return (data || []).map((row) => {
    const partner = row.assigned_partner_id ? partners.get(row.assigned_partner_id) || null : null;
    const userName = row.assigned_user_id ? members.get(row.assigned_user_id) || null : null;
    return {
      id: row.id,
      vehicleId: row.vehicle_id,
      planItemId: row.plan_item_id,
      planVersionId: row.plan_version_id,
      title: row.title,
      description: row.description,
      category: row.category,
      classification: row.classification,
      status: row.status as InventoryWorkOrderStatus,
      blockerReason: row.blocker_reason,
      estimatedDurationMinutes: nullableNumber(row.estimated_duration_minutes),
      estimatedLaborMinutes: nullableNumber(row.estimated_labor_minutes),
      estimatedElapsedMinutes: nullableNumber(row.estimated_elapsed_minutes),
      scheduledStartAt: row.scheduled_start_at,
      scheduledEndAt: row.scheduled_end_at,
      proposedStartAt: row.proposed_start_at,
      proposedEndAt: row.proposed_end_at,
      partnerConfirmationStatus: row.partner_confirmation_status as InventoryWorkOrderView["partnerConfirmationStatus"],
      scheduleSource: row.schedule_source as "suggested" | "manual" | null,
      actualStartAt: row.actual_start_at,
      actualEndAt: row.actual_end_at,
      approvedBudget: numberValue(row.approved_budget),
      currentForecast: numberValue(row.current_forecast),
      actualCost: nullableNumber(row.actual_cost),
      assignedPartnerId: row.assigned_partner_id,
      assignedUserId: row.assigned_user_id,
      performerName: partner?.name || userName,
      performerType: partner ? "partner" : userName ? "internal" : null,
      partnerEmail: partner?.email || null,
      partnerSchedulingMode: partner?.schedulingMode || null,
      locationId: row.location_id,
      locationName: row.location_id ? locations.get(row.location_id) || null : null,
      resourceId: row.resource_id,
      resourceName: row.resource_id ? resources.get(row.resource_id) || null : null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  });
}
