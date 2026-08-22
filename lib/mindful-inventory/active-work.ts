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
  /** Legacy/back-compat elapsed estimate. */
  estimatedDurationMinutes: number | null;
  estimatedLaborMinutes: number | null;
  estimatedElapsedMinutes: number | null;
  scheduledStartAt: string | null;
  scheduledEndAt: string | null;
  actualStartAt: string | null;
  actualEndAt: string | null;
  approvedBudget: number;
  currentForecast: number;
  actualCost: number | null;
  assignedPartnerId: string | null;
  createdAt: string;
  updatedAt: string;
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

export async function getInventoryActiveWork(
  supabase: SupabaseClient,
  vehicleId: string,
): Promise<InventoryWorkOrderView[]> {
  const { data, error } = await supabase
    .from("mindful_inventory_work_orders")
    .select("id,vehicle_id,plan_item_id,plan_version_id,title,description,category,classification,status,blocker_reason,estimated_duration_minutes,estimated_labor_minutes,estimated_elapsed_minutes,scheduled_start_at,scheduled_end_at,actual_start_at,actual_end_at,approved_budget,current_forecast,actual_cost,assigned_partner_id,created_at,updated_at")
    .eq("vehicle_id", vehicleId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);

  return (data || []).map((row) => ({
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
    actualStartAt: row.actual_start_at,
    actualEndAt: row.actual_end_at,
    approvedBudget: numberValue(row.approved_budget),
    currentForecast: numberValue(row.current_forecast),
    actualCost: nullableNumber(row.actual_cost),
    assignedPartnerId: row.assigned_partner_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}
