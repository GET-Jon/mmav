import type { SupabaseClient } from "@supabase/supabase-js";

export type InventoryScheduleWork = {
  id: string;
  vehicleId: string;
  vehicleLabel: string;
  inventoryNumber: string;
  title: string;
  category: string;
  classification: string;
  status: string;
  laborMinutes: number | null;
  elapsedMinutes: number | null;
  legacyDurationMinutes: number | null;
  scheduledStartAt: string | null;
  scheduledEndAt: string | null;
  assignedPartnerId: string | null;
  assignedUserId: string | null;
  performerName: string | null;
  locationId: string | null;
  locationName: string | null;
  resourceId: string | null;
  resourceName: string | null;
  scheduleSource: string | null;
};

function nullableNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function getInventorySchedule(
  supabase: SupabaseClient,
  companyId: string,
): Promise<InventoryScheduleWork[]> {
  const [vehiclesResult, workResult, partnersResult, locationsResult, resourcesResult, membersResult] = await Promise.all([
    supabase
      .from("mindful_inventory_vehicles")
      .select("id,stock_number,vin,year,make,model")
      .eq("company_id", companyId),
    supabase
      .from("mindful_inventory_work_orders")
      .select("id,vehicle_id,title,category,classification,status,estimated_duration_minutes,estimated_labor_minutes,estimated_elapsed_minutes,scheduled_start_at,scheduled_end_at,assigned_partner_id,assigned_user_id,location_id,resource_id,schedule_source")
      .neq("status", "cancelled")
      .order("scheduled_start_at", { ascending: true, nullsFirst: false }),
    supabase.from("mindful_inventory_partners").select("id,name").eq("company_id", companyId),
    supabase.from("mindful_inventory_locations").select("id,name").eq("company_id", companyId),
    supabase.from("mindful_inventory_resources").select("id,name,location_id"),
    supabase.rpc("get_inventory_company_members", { requested_company_id: companyId }),
  ]);

  if (vehiclesResult.error) throw new Error(vehiclesResult.error.message);
  if (workResult.error) throw new Error(workResult.error.message);
  if (partnersResult.error) throw new Error(partnersResult.error.message);
  if (locationsResult.error) throw new Error(locationsResult.error.message);
  if (resourcesResult.error) throw new Error(resourcesResult.error.message);
  if (membersResult.error) throw new Error(membersResult.error.message);

  const vehicles = new Map(
    (vehiclesResult.data || []).map((vehicle) => [
      vehicle.id,
      {
        inventoryNumber:
          vehicle.stock_number ||
          (vehicle.vin ? `VIN ${String(vehicle.vin).slice(-6)}` : "Inventory vehicle"),
        label: `${vehicle.year} ${vehicle.make} ${vehicle.model}`,
      },
    ]),
  );
  const partners = new Map((partnersResult.data || []).map((partner) => [partner.id, partner.name]));
  const locations = new Map((locationsResult.data || []).map((location) => [location.id, location.name]));
  const resources = new Map(
    (resourcesResult.data || [])
      .filter((resource) => locations.has(resource.location_id))
      .map((resource) => [resource.id, resource.name]),
  );
  const members = new Map(
    ((membersResult.data || []) as Array<{ user_id: string; display_name?: string | null; email?: string | null }>).map((member) => [
      member.user_id,
      member.display_name || member.email || "Mindful team member",
    ]),
  );

  return (workResult.data || [])
    .filter((work) => vehicles.has(work.vehicle_id))
    .map((work) => {
      const vehicle = vehicles.get(work.vehicle_id)!;
      const assignedPartnerId = work.assigned_partner_id || null;
      const assignedUserId = work.assigned_user_id || null;
      return {
        id: work.id,
        vehicleId: work.vehicle_id,
        vehicleLabel: vehicle.label,
        inventoryNumber: vehicle.inventoryNumber,
        title: work.title,
        category: work.category,
        classification: work.classification,
        status: work.status,
        laborMinutes: nullableNumber(work.estimated_labor_minutes),
        elapsedMinutes: nullableNumber(work.estimated_elapsed_minutes),
        legacyDurationMinutes: nullableNumber(work.estimated_duration_minutes),
        scheduledStartAt: work.scheduled_start_at,
        scheduledEndAt: work.scheduled_end_at,
        assignedPartnerId,
        assignedUserId,
        performerName: assignedPartnerId ? partners.get(assignedPartnerId) || "Partner" : assignedUserId ? members.get(assignedUserId) || "Mindful team member" : null,
        locationId: work.location_id || null,
        locationName: work.location_id ? locations.get(work.location_id) || "Location" : null,
        resourceId: work.resource_id || null,
        resourceName: work.resource_id ? resources.get(work.resource_id) || "Resource" : null,
        scheduleSource: work.schedule_source || null,
      };
    });
}
