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
  const [vehiclesResult, workResult] = await Promise.all([
    supabase
      .from("mindful_inventory_vehicles")
      .select("id,inventory_number,year,make,model")
      .eq("company_id", companyId),
    supabase
      .from("mindful_inventory_work_orders")
      .select("id,vehicle_id,title,category,classification,status,estimated_duration_minutes,estimated_labor_minutes,estimated_elapsed_minutes,scheduled_start_at,scheduled_end_at,assigned_partner_id")
      .neq("status", "cancelled")
      .order("scheduled_start_at", { ascending: true, nullsFirst: false }),
  ]);

  if (vehiclesResult.error) throw new Error(vehiclesResult.error.message);
  if (workResult.error) throw new Error(workResult.error.message);

  const vehicles = new Map(
    (vehiclesResult.data || []).map((vehicle) => [
      vehicle.id,
      {
        inventoryNumber: vehicle.inventory_number,
        label: `${vehicle.year} ${vehicle.make} ${vehicle.model}`,
      },
    ]),
  );

  return (workResult.data || [])
    .filter((work) => vehicles.has(work.vehicle_id))
    .map((work) => {
      const vehicle = vehicles.get(work.vehicle_id)!;
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
        assignedPartnerId: work.assigned_partner_id,
      };
    });
}
