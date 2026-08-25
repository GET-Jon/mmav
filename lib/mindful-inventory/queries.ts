import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  InventoryDashboardData,
  InventoryDashboardSummary,
  InventoryTitleStatus,
  InventoryVehicleGrade,
  InventoryVehicleHealth,
  InventoryVehiclePhase,
  InventoryVehiclePriority,
  InventoryVehicleView,
} from "@/lib/mindful-inventory/types";

type InventoryVehicleRow = {
  id: string;
  company_id: string;
  source_evaluation_id: string | null;
  source_snapshot: Record<string, unknown> | null;
  stock_number: string | null;
  vin: string | null;
  year: number;
  make: string;
  model: string;
  trim: string | null;
  mileage: number | null;
  image_url: string | null;
  project_owner_user_id: string | null;
  phase: InventoryVehiclePhase;
  grade: InventoryVehicleGrade | null;
  priority: InventoryVehiclePriority;
  health: InventoryVehicleHealth;
  current_location_id: string | null;
  next_action: string | null;
  next_action_owner_user_id: string | null;
  next_action_owner_partner_id: string | null;
  next_action_due_at: string | null;
  target_ready_at: string | null;
  forecast_ready_at: string | null;
  hold_active: boolean;
  hold_reason: string | null;
  hold_owner_user_id: string | null;
  hold_follow_up_at: string | null;
  exit_status: string | null;
  exit_reason: string | null;
  exited_at: string | null;
  purchase_date: string | null;
  purchase_price: number | string | null;
  buyer_fees: number | string | null;
  transport_cost: number | string | null;
  other_acquisition_cost: number | string | null;
  expected_sale_price: number | string | null;
  title_status: InventoryTitleStatus;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

type LocationRow = {
  id: string;
  name: string;
};

type PartnerRow = {
  id: string;
  name: string;
};

type WorkForecastRow = {
  vehicle_id: string;
  scheduled_end_at: string | null;
  status: string;
};

function toNumber(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toNullableNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function daysHeld(vehicle: InventoryVehicleRow) {
  const startValue = vehicle.purchase_date || vehicle.created_at;
  const start = new Date(startValue).getTime();

  if (!Number.isFinite(start)) {
    return 0;
  }

  return Math.max(0, Math.floor((Date.now() - start) / 86_400_000));
}

function isOverdue(value: string | null) {
  if (!value) {
    return false;
  }

  const due = new Date(value).getTime();
  return Number.isFinite(due) && due < Date.now();
}

export async function getInventoryDashboardData(
  supabase: SupabaseClient,
  companyId: string,
): Promise<InventoryDashboardData> {
  const { data: vehicleData, error: vehicleError } = await supabase
    .from("mindful_inventory_vehicles")
    .select(
      `
      id,
      company_id,
      source_evaluation_id,
      source_snapshot,
      stock_number,
      vin,
      year,
      make,
      model,
      trim,
      mileage,
      image_url,
      project_owner_user_id,
      phase,
      grade,
      priority,
      health,
      current_location_id,
      next_action,
      next_action_owner_user_id,
      next_action_owner_partner_id,
      next_action_due_at,
      target_ready_at,
      forecast_ready_at,
      hold_active,
      hold_reason,
      hold_owner_user_id,
      hold_follow_up_at,
      exit_status,
      exit_reason,
      exited_at,
      purchase_date,
      purchase_price,
      buyer_fees,
      transport_cost,
      other_acquisition_cost,
      expected_sale_price,
      title_status,
      archived_at,
      created_at,
      updated_at
    `,
    )
    .eq("company_id", companyId)
    .is("archived_at", null)
    .order("priority", { ascending: true })
    .order("updated_at", { ascending: false });

  if (vehicleError) {
    throw new Error(vehicleError.message);
  }

  const vehicleRows = (vehicleData || []) as InventoryVehicleRow[];
  const vehicleIds = vehicleRows.map((vehicle) => vehicle.id);
  const locationIds = [
    ...new Set(
      vehicleRows
        .map((vehicle) => vehicle.current_location_id)
        .filter((value): value is string => Boolean(value)),
    ),
  ];
  const partnerIds = [
    ...new Set(
      vehicleRows
        .map((vehicle) => vehicle.next_action_owner_partner_id)
        .filter((value): value is string => Boolean(value)),
    ),
  ];

  const locationNames = new Map<string, string>();
  const partnerNames = new Map<string, string>();
  const scheduledForecastByVehicle = new Map<string, string>();

  if (locationIds.length > 0) {
    const { data, error } = await supabase
      .from("mindful_inventory_locations")
      .select("id,name")
      .eq("company_id", companyId)
      .in("id", locationIds);

    if (error) {
      throw new Error(error.message);
    }

    for (const row of (data || []) as LocationRow[]) {
      locationNames.set(row.id, row.name);
    }
  }

  if (partnerIds.length > 0) {
    const { data, error } = await supabase
      .from("mindful_inventory_partners")
      .select("id,name")
      .eq("company_id", companyId)
      .in("id", partnerIds);

    if (error) {
      throw new Error(error.message);
    }

    for (const row of (data || []) as PartnerRow[]) {
      partnerNames.set(row.id, row.name);
    }
  }

  if (vehicleIds.length > 0) {
    const { data, error } = await supabase
      .from("mindful_inventory_work_orders")
      .select("vehicle_id,scheduled_end_at,status")
      .in("vehicle_id", vehicleIds)
      .not("scheduled_end_at", "is", null)
      .not("status", "in", '("cancelled")');

    if (error) {
      throw new Error(error.message);
    }

    for (const row of (data || []) as WorkForecastRow[]) {
      if (!row.scheduled_end_at) continue;
      const current = scheduledForecastByVehicle.get(row.vehicle_id);
      if (!current || new Date(row.scheduled_end_at).getTime() > new Date(current).getTime()) {
        scheduledForecastByVehicle.set(row.vehicle_id, row.scheduled_end_at);
      }
    }
  }

  const vehicles: InventoryVehicleView[] = vehicleRows.map((vehicle) => ({
    id: vehicle.id,
    sourceEvaluationId: vehicle.source_evaluation_id,
    stockNumber: vehicle.stock_number,
    vin: vehicle.vin,
    year: vehicle.year,
    make: vehicle.make,
    model: vehicle.model,
    trim: vehicle.trim,
    mileage: vehicle.mileage,
    imageUrl: vehicle.image_url,
    projectOwnerUserId: vehicle.project_owner_user_id,
    phase: vehicle.phase,
    grade: vehicle.grade,
    priority: vehicle.priority,
    health: vehicle.health,
    currentLocationId: vehicle.current_location_id,
    currentLocationName: vehicle.current_location_id
      ? locationNames.get(vehicle.current_location_id) || null
      : null,
    nextAction: vehicle.next_action,
    nextActionOwnerUserId: vehicle.next_action_owner_user_id,
    nextActionOwnerPartnerId: vehicle.next_action_owner_partner_id,
    nextActionOwnerPartnerName: vehicle.next_action_owner_partner_id
      ? partnerNames.get(vehicle.next_action_owner_partner_id) || null
      : null,
    nextActionDueAt: vehicle.next_action_due_at,
    targetReadyAt: vehicle.target_ready_at,
    forecastReadyAt:
      scheduledForecastByVehicle.get(vehicle.id) || vehicle.forecast_ready_at,
    holdActive: vehicle.hold_active,
    holdReason: vehicle.hold_reason,
    holdOwnerUserId: vehicle.hold_owner_user_id,
    holdFollowUpAt: vehicle.hold_follow_up_at,
    exitStatus: vehicle.exit_status,
    exitReason: vehicle.exit_reason,
    exitedAt: vehicle.exited_at,
    purchaseDate: vehicle.purchase_date,
    purchasePrice: toNumber(vehicle.purchase_price),
    buyerFees: toNumber(vehicle.buyer_fees),
    transportCost: toNumber(vehicle.transport_cost),
    otherAcquisitionCost: toNumber(vehicle.other_acquisition_cost),
    expectedSalePrice: toNullableNumber(vehicle.expected_sale_price),
    titleStatus: vehicle.title_status,
    sourceSnapshot: vehicle.source_snapshot || {},
    createdAt: vehicle.created_at,
    updatedAt: vehicle.updated_at,
  }));

  const activeRows = vehicleRows.filter((vehicle) => !vehicle.exited_at);
  const needsAttention = activeRows.filter(
    (vehicle) =>
      vehicle.hold_active ||
      vehicle.health !== "on_track" ||
      isOverdue(vehicle.next_action_due_at),
  ).length;

  const summary: InventoryDashboardSummary = {
    activeVehicles: activeRows.length,
    needsAttention,
    readyVehicles: activeRows.filter((vehicle) => vehicle.phase === "ready").length,
    onHold: activeRows.filter((vehicle) => vehicle.hold_active).length,
    averageDaysHeld:
      activeRows.length === 0
        ? 0
        : Math.round(
            activeRows.reduce((total, vehicle) => total + daysHeld(vehicle), 0) /
              activeRows.length,
          ),
  };

  return { vehicles, summary };
}

export type {
  InventoryDashboardData,
  InventoryDashboardSummary,
  InventoryVehicleView,
} from "@/lib/mindful-inventory/types";
