import type { SupabaseClient } from "@supabase/supabase-js";

import { calculateInventoryFinancials } from "@/lib/mindful-inventory/financials";
import type {
  InventoryVehicleStage,
  InventoryTitleStatus,
  InventoryWorkItemStatus,
} from "@/lib/mindful-inventory/types";

type InventoryVehicleRow = {
  id: string;
  company_id: string;
  source_evaluation_id: string | null;
  stock_number: string | null;
  vin: string | null;
  year: number;
  make: string;
  model: string;
  trim: string | null;
  mileage: number | null;
  image_url: string | null;
  purchase_date: string | null;
  purchase_price: number | string | null;
  buyer_fees: number | string | null;
  transport_cost: number | string | null;
  other_acquisition_cost: number | string | null;
  stage: InventoryVehicleStage;
  current_location: string | null;
  title_status: InventoryTitleStatus;
  target_ready_date: string | null;
  expected_sale_price: number | string | null;
  actual_sale_price: number | string | null;
  sold_date: string | null;
  next_action: string | null;
  next_action_owner: string | null;
  next_action_due_date: string | null;
  notes: string | null;
  source_snapshot: Record<string, unknown> | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

type InventoryWorkItemRow = {
  id: string;
  inventory_vehicle_id: string;
  description: string;
  category: string;
  priority: "required" | "recommended" | "optional";
  status: InventoryWorkItemStatus;
  vendor: string | null;
  estimated_cost: number | string | null;
  actual_cost: number | string | null;
  scheduled_date: string | null;
  completed_date: string | null;
  requires_approval: boolean;
  notes: string | null;
};

export type InventoryWorkItemView = {
  id: string;
  description: string;
  category: string;
  priority: "required" | "recommended" | "optional";
  status: InventoryWorkItemStatus;
  vendor: string | null;
  estimatedCost: number;
  actualCost: number | null;
  scheduledDate: string | null;
  completedDate: string | null;
  requiresApproval: boolean;
  notes: string | null;
};

export type InventoryVehicleView = {
  id: string;
  sourceEvaluationId: string | null;
  stockNumber: string | null;
  vin: string | null;
  year: number;
  make: string;
  model: string;
  trim: string | null;
  mileage: number | null;
  imageUrl: string | null;
  purchaseDate: string | null;
  purchasePrice: number;
  buyerFees: number;
  transportCost: number;
  otherAcquisitionCost: number;
  stage: InventoryVehicleStage;
  currentLocation: string | null;
  titleStatus: InventoryTitleStatus;
  targetReadyDate: string | null;
  expectedSalePrice: number | null;
  actualSalePrice: number | null;
  soldDate: string | null;
  nextAction: string | null;
  nextActionOwner: string | null;
  nextActionDueDate: string | null;
  notes: string | null;
  sourceSnapshot: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  workItems: InventoryWorkItemView[];
  financials: {
    acquisitionCost: number;
    completedWorkCost: number;
    outstandingWorkCost: number;
    actualInvestedToDate: number;
    projectedAllInCost: number;
    projectedGrossProfit: number | null;
  };
};

export type InventoryDashboardSummary = {
  activeVehicles: number;
  cashInvested: number;
  remainingSpend: number;
  projectedAllIn: number;
  projectedRetail: number;
  projectedGrossProfit: number;
  readyForSale: number;
  blocked: number;
};

export type InventoryDashboardData = {
  vehicles: InventoryVehicleView[];
  summary: InventoryDashboardSummary;
};

function toNumber(value: number | string | null | undefined) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toNullableNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
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
      stock_number,
      vin,
      year,
      make,
      model,
      trim,
      mileage,
      image_url,
      purchase_date,
      purchase_price,
      buyer_fees,
      transport_cost,
      other_acquisition_cost,
      stage,
      current_location,
      title_status,
      target_ready_date,
      expected_sale_price,
      actual_sale_price,
      sold_date,
      next_action,
      next_action_owner,
      next_action_due_date,
      notes,
      source_snapshot,
      archived_at,
      created_at,
      updated_at
    `,
    )
    .eq("company_id", companyId)
    .is("archived_at", null)
    .order("updated_at", { ascending: false });

  if (vehicleError) {
    throw new Error(vehicleError.message);
  }

  const vehicleRows = (vehicleData || []) as InventoryVehicleRow[];
  const vehicleIds = vehicleRows.map((vehicle) => vehicle.id);

  let workItemRows: InventoryWorkItemRow[] = [];

  if (vehicleIds.length > 0) {
    const { data: workItemData, error: workItemError } = await supabase
      .from("mindful_inventory_work_items")
      .select(
        `
        id,
        inventory_vehicle_id,
        description,
        category,
        priority,
        status,
        vendor,
        estimated_cost,
        actual_cost,
        scheduled_date,
        completed_date,
        requires_approval,
        notes
      `,
      )
      .in("inventory_vehicle_id", vehicleIds)
      .order("created_at", { ascending: true });

    if (workItemError) {
      throw new Error(workItemError.message);
    }

    workItemRows = (workItemData || []) as InventoryWorkItemRow[];
  }

  const workItemsByVehicle = new Map<string, InventoryWorkItemView[]>();

  for (const item of workItemRows) {
    const current = workItemsByVehicle.get(item.inventory_vehicle_id) || [];

    current.push({
      id: item.id,
      description: item.description,
      category: item.category,
      priority: item.priority,
      status: item.status,
      vendor: item.vendor,
      estimatedCost: toNumber(item.estimated_cost),
      actualCost: toNullableNumber(item.actual_cost),
      scheduledDate: item.scheduled_date,
      completedDate: item.completed_date,
      requiresApproval: item.requires_approval,
      notes: item.notes,
    });

    workItemsByVehicle.set(item.inventory_vehicle_id, current);
  }

  const vehicles: InventoryVehicleView[] = vehicleRows.map((vehicle) => {
    const workItems = workItemsByVehicle.get(vehicle.id) || [];

    const financials = calculateInventoryFinancials({
      purchasePrice: toNumber(vehicle.purchase_price),
      buyerFees: toNumber(vehicle.buyer_fees),
      transportCost: toNumber(vehicle.transport_cost),
      otherAcquisitionCost: toNumber(vehicle.other_acquisition_cost),
      expectedSalePrice: toNullableNumber(vehicle.expected_sale_price),
      workItems: workItems.map((item) => ({
        status: item.status,
        estimatedCost: item.estimatedCost,
        actualCost: item.actualCost,
      })),
    });

    return {
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
      purchaseDate: vehicle.purchase_date,
      purchasePrice: toNumber(vehicle.purchase_price),
      buyerFees: toNumber(vehicle.buyer_fees),
      transportCost: toNumber(vehicle.transport_cost),
      otherAcquisitionCost: toNumber(
        vehicle.other_acquisition_cost,
      ),
      stage: vehicle.stage,
      currentLocation: vehicle.current_location,
      titleStatus: vehicle.title_status,
      targetReadyDate: vehicle.target_ready_date,
      expectedSalePrice: toNullableNumber(vehicle.expected_sale_price),
      actualSalePrice: toNullableNumber(vehicle.actual_sale_price),
      soldDate: vehicle.sold_date,
      nextAction: vehicle.next_action,
      nextActionOwner: vehicle.next_action_owner,
      nextActionDueDate: vehicle.next_action_due_date,
      notes: vehicle.notes,
      sourceSnapshot: vehicle.source_snapshot || {},
      createdAt: vehicle.created_at,
      updatedAt: vehicle.updated_at,
      workItems,
      financials,
    };
  });

  const activeVehicles = vehicles.filter(
    (vehicle) => vehicle.stage !== "sold",
  );

  const summary: InventoryDashboardSummary = {
    activeVehicles: activeVehicles.length,
    cashInvested: activeVehicles.reduce(
      (total, vehicle) =>
        total + vehicle.financials.actualInvestedToDate,
      0,
    ),
    remainingSpend: activeVehicles.reduce(
      (total, vehicle) =>
        total + vehicle.financials.outstandingWorkCost,
      0,
    ),
    projectedAllIn: activeVehicles.reduce(
      (total, vehicle) =>
        total + vehicle.financials.projectedAllInCost,
      0,
    ),
    projectedRetail: activeVehicles.reduce(
      (total, vehicle) =>
        total + (vehicle.expectedSalePrice || 0),
      0,
    ),
    projectedGrossProfit: activeVehicles.reduce(
      (total, vehicle) =>
        total + (vehicle.financials.projectedGrossProfit || 0),
      0,
    ),
    readyForSale: activeVehicles.filter(
      (vehicle) => vehicle.stage === "ready_for_sale",
    ).length,
    blocked: activeVehicles.filter(
      (vehicle) => vehicle.stage === "blocked",
    ).length,
  };

  return {
    vehicles,
    summary,
  };
}
