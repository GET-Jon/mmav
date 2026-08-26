import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  InventoryDashboardData,
  InventoryDashboardSummary,
  InventoryScheduleHealth,
  InventoryTitleStatus,
  InventoryVehicleGrade,
  InventoryVehicleHealth,
  InventoryVehiclePhase,
  InventoryVehiclePriority,
  InventoryVehicleView,
} from "@/lib/mindful-inventory/types";

type InventoryVehicleRow = {
  id: string; company_id: string; source_evaluation_id: string | null; source_snapshot: Record<string, unknown> | null;
  stock_number: string | null; vin: string | null; year: number; make: string; model: string; trim: string | null; mileage: number | null;
  image_url: string | null; project_owner_user_id: string | null; phase: InventoryVehiclePhase; grade: InventoryVehicleGrade | null;
  priority: InventoryVehiclePriority; health: InventoryVehicleHealth; current_location_id: string | null; next_action: string | null;
  next_action_owner_user_id: string | null; next_action_owner_partner_id: string | null; next_action_due_at: string | null;
  target_ready_at: string | null; forecast_ready_at: string | null; hold_active: boolean; hold_reason: string | null;
  hold_owner_user_id: string | null; hold_follow_up_at: string | null; exit_status: string | null; exit_reason: string | null;
  exited_at: string | null; purchase_date: string | null; purchase_price: number | string | null; buyer_fees: number | string | null;
  transport_cost: number | string | null; other_acquisition_cost: number | string | null; expected_sale_price: number | string | null;
  title_status: InventoryTitleStatus; archived_at: string | null; created_at: string; updated_at: string;
};

type LocationRow = { id: string; name: string };
type PartnerRow = { id: string; name: string };
type WorkRow = {
  vehicle_id: string;
  title: string;
  status: string;
  scheduled_start_at: string | null;
  scheduled_end_at: string | null;
  actual_start_at: string | null;
  actual_end_at: string | null;
  estimated_elapsed_minutes: number | string | null;
  estimated_duration_minutes: number | string | null;
};
type CompanyMemberRow = { user_id: string; display_name: string };

type ScheduleHealthRollup = { health: InventoryScheduleHealth; detail: string; count: number; rank: number };

function toNumber(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}
function toNullableNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function daysHeld(vehicle: InventoryVehicleRow) {
  const startValue = vehicle.purchase_date || vehicle.created_at;
  const start = new Date(startValue).getTime();
  if (!Number.isFinite(start)) return 0;
  return Math.max(0, Math.floor((Date.now() - start) / 86_400_000));
}
function isOverdue(value: string | null) {
  if (!value) return false;
  const due = new Date(value).getTime();
  return Number.isFinite(due) && due < Date.now();
}
function minutesLate(now: number, threshold: number) {
  return Math.max(1, Math.round((now - threshold) / 60_000));
}
function formatLag(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round((minutes / 60) * 10) / 10;
  return `${hours} hr`;
}
function workScheduleHealth(row: WorkRow, now: number): Omit<ScheduleHealthRollup, "count"> | null {
  if (["complete", "cancelled"].includes(row.status) || row.actual_end_at) return null;
  const scheduledStart = row.scheduled_start_at ? new Date(row.scheduled_start_at).getTime() : NaN;
  if (!Number.isFinite(scheduledStart)) return null;
  const duration = Number(row.estimated_elapsed_minutes ?? row.estimated_duration_minutes ?? 60);
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 60;

  if (!row.actual_start_at) {
    const lateThreshold = scheduledStart + 30 * 60_000;
    if (now <= lateThreshold) return null;
    const late = minutesLate(now, scheduledStart);
    return { health: "late_start", detail: `${row.title} · ${formatLag(late)} late to start`, rank: 1 };
  }

  const actualStart = new Date(row.actual_start_at).getTime();
  if (!Number.isFinite(actualStart)) return null;
  const expectedFinish = actualStart + safeDuration * 60_000;
  const bufferMinutes = Math.max(30, Math.round(safeDuration * 0.15));
  const runningLateThreshold = expectedFinish + bufferMinutes * 60_000;
  if (now <= runningLateThreshold) return null;
  const overdueThreshold = runningLateThreshold + 60 * 60_000;
  const lag = minutesLate(now, expectedFinish);
  if (now > overdueThreshold) return { health: "overdue", detail: `${row.title} · ${formatLag(lag)} past expected finish`, rank: 3 };
  return { health: "running_late", detail: `${row.title} · ${formatLag(lag)} past expected finish`, rank: 2 };
}

export async function getInventoryDashboardData(supabase: SupabaseClient, companyId: string): Promise<InventoryDashboardData> {
  const { data: vehicleData, error: vehicleError } = await supabase
    .from("mindful_inventory_vehicles")
    .select(`id, company_id, source_evaluation_id, source_snapshot, stock_number, vin, year, make, model, trim, mileage, image_url, project_owner_user_id, phase, grade, priority, health, current_location_id, next_action, next_action_owner_user_id, next_action_owner_partner_id, next_action_due_at, target_ready_at, forecast_ready_at, hold_active, hold_reason, hold_owner_user_id, hold_follow_up_at, exit_status, exit_reason, exited_at, purchase_date, purchase_price, buyer_fees, transport_cost, other_acquisition_cost, expected_sale_price, title_status, archived_at, created_at, updated_at`)
    .eq("company_id", companyId).is("archived_at", null).order("priority", { ascending: true }).order("updated_at", { ascending: false });
  if (vehicleError) throw new Error(vehicleError.message);

  const vehicleRows = (vehicleData || []) as InventoryVehicleRow[];
  const vehicleIds = vehicleRows.map((vehicle) => vehicle.id);
  const locationIds = [...new Set(vehicleRows.map((vehicle) => vehicle.current_location_id).filter((value): value is string => Boolean(value)))];
  const partnerIds = [...new Set(vehicleRows.map((vehicle) => vehicle.next_action_owner_partner_id).filter((value): value is string => Boolean(value)))];
  const locationNames = new Map<string, string>();
  const partnerNames = new Map<string, string>();
  const ownerNames = new Map<string, string>();
  const scheduledForecastByVehicle = new Map<string, string>();
  const scheduleHealthByVehicle = new Map<string, ScheduleHealthRollup>();

  const { data: members, error: membersError } = await supabase.rpc("get_inventory_company_members", { requested_company_id: companyId });
  if (membersError) throw new Error(membersError.message);
  for (const row of (members || []) as CompanyMemberRow[]) ownerNames.set(row.user_id, row.display_name);

  if (locationIds.length) {
    const { data, error } = await supabase.from("mindful_inventory_locations").select("id,name").eq("company_id", companyId).in("id", locationIds);
    if (error) throw new Error(error.message);
    for (const row of (data || []) as LocationRow[]) locationNames.set(row.id, row.name);
  }
  if (partnerIds.length) {
    const { data, error } = await supabase.from("mindful_inventory_partners").select("id,name").eq("company_id", companyId).in("id", partnerIds);
    if (error) throw new Error(error.message);
    for (const row of (data || []) as PartnerRow[]) partnerNames.set(row.id, row.name);
  }

  if (vehicleIds.length) {
    const { data, error } = await supabase.from("mindful_inventory_work_orders")
      .select("vehicle_id,title,status,scheduled_start_at,scheduled_end_at,actual_start_at,actual_end_at,estimated_elapsed_minutes,estimated_duration_minutes")
      .in("vehicle_id", vehicleIds).neq("status", "cancelled");
    if (error) throw new Error(error.message);
    const now = Date.now();
    for (const row of (data || []) as WorkRow[]) {
      if (row.status !== "complete" && row.scheduled_end_at) {
        const current = scheduledForecastByVehicle.get(row.vehicle_id);
        if (!current || new Date(row.scheduled_end_at).getTime() > new Date(current).getTime()) scheduledForecastByVehicle.set(row.vehicle_id, row.scheduled_end_at);
      }
      const health = workScheduleHealth(row, now);
      if (!health) continue;
      const current = scheduleHealthByVehicle.get(row.vehicle_id);
      if (!current) scheduleHealthByVehicle.set(row.vehicle_id, { ...health, count: 1 });
      else scheduleHealthByVehicle.set(row.vehicle_id, { ...(health.rank > current.rank ? health : current), count: current.count + 1 });
    }
  }

  const vehicles: InventoryVehicleView[] = vehicleRows.map((vehicle) => {
    const schedule = scheduleHealthByVehicle.get(vehicle.id);
    return {
      id: vehicle.id, sourceEvaluationId: vehicle.source_evaluation_id, stockNumber: vehicle.stock_number, vin: vehicle.vin,
      year: vehicle.year, make: vehicle.make, model: vehicle.model, trim: vehicle.trim, mileage: vehicle.mileage, imageUrl: vehicle.image_url,
      projectOwnerUserId: vehicle.project_owner_user_id, projectOwnerName: vehicle.project_owner_user_id ? ownerNames.get(vehicle.project_owner_user_id) || null : null,
      phase: vehicle.phase, grade: vehicle.grade, priority: vehicle.priority, health: vehicle.health,
      scheduleHealth: schedule?.health || null, scheduleHealthDetail: schedule?.detail || null, behindScheduleCount: schedule?.count || 0,
      currentLocationId: vehicle.current_location_id, currentLocationName: vehicle.current_location_id ? locationNames.get(vehicle.current_location_id) || null : null,
      nextAction: vehicle.next_action, nextActionOwnerUserId: vehicle.next_action_owner_user_id, nextActionOwnerPartnerId: vehicle.next_action_owner_partner_id,
      nextActionOwnerPartnerName: vehicle.next_action_owner_partner_id ? partnerNames.get(vehicle.next_action_owner_partner_id) || null : null,
      nextActionDueAt: vehicle.next_action_due_at, targetReadyAt: vehicle.target_ready_at, forecastReadyAt: scheduledForecastByVehicle.get(vehicle.id) || vehicle.forecast_ready_at,
      holdActive: vehicle.hold_active, holdReason: vehicle.hold_reason, holdOwnerUserId: vehicle.hold_owner_user_id, holdFollowUpAt: vehicle.hold_follow_up_at,
      exitStatus: vehicle.exit_status, exitReason: vehicle.exit_reason, exitedAt: vehicle.exited_at, purchaseDate: vehicle.purchase_date,
      purchasePrice: toNumber(vehicle.purchase_price), buyerFees: toNumber(vehicle.buyer_fees), transportCost: toNumber(vehicle.transport_cost), otherAcquisitionCost: toNumber(vehicle.other_acquisition_cost),
      expectedSalePrice: toNullableNumber(vehicle.expected_sale_price), titleStatus: vehicle.title_status, sourceSnapshot: vehicle.source_snapshot || {}, createdAt: vehicle.created_at, updatedAt: vehicle.updated_at,
    };
  });

  const activeVehicles = vehicles.filter((vehicle) => !vehicle.exitedAt);
  const needsAttention = activeVehicles.filter((vehicle) => vehicle.holdActive || vehicle.health !== "on_track" || Boolean(vehicle.scheduleHealth) || isOverdue(vehicle.nextActionDueAt)).length;
  const summary: InventoryDashboardSummary = {
    activeVehicles: activeVehicles.length,
    needsAttention,
    readyVehicles: activeVehicles.filter((vehicle) => vehicle.phase === "ready").length,
    onHold: activeVehicles.filter((vehicle) => vehicle.holdActive).length,
    averageDaysHeld: activeVehicles.length === 0 ? 0 : Math.round(activeVehicles.reduce((total, vehicle) => {
      const row = vehicleRows.find((candidate) => candidate.id === vehicle.id);
      return total + (row ? daysHeld(row) : 0);
    }, 0) / activeVehicles.length),
  };
  return { vehicles, summary };
}

export type { InventoryDashboardData, InventoryDashboardSummary, InventoryVehicleView } from "@/lib/mindful-inventory/types";
