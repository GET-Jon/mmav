export type InventoryVehiclePhase =
  | "purchased"
  | "intake"
  | "inspection"
  | "planning"
  | "reconditioning"
  | "final_qc"
  | "merchandising"
  | "ready";

export type InventoryVehicleGrade = "a" | "b" | "c" | "d" | "e";

export type InventoryVehiclePriority = "1" | "2" | "3";

export type InventoryVehicleHealth =
  | "on_track"
  | "at_risk"
  | "behind"
  | "blocked";

export type InventoryTitleStatus =
  | "unknown"
  | "awaiting"
  | "received"
  | "issue"
  | "not_applicable";

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
  projectOwnerUserId: string | null;
  phase: InventoryVehiclePhase;
  grade: InventoryVehicleGrade | null;
  priority: InventoryVehiclePriority;
  health: InventoryVehicleHealth;
  currentLocationId: string | null;
  currentLocationName: string | null;
  nextAction: string | null;
  nextActionOwnerUserId: string | null;
  nextActionOwnerPartnerId: string | null;
  nextActionOwnerPartnerName: string | null;
  nextActionDueAt: string | null;
  targetReadyAt: string | null;
  forecastReadyAt: string | null;
  holdActive: boolean;
  holdReason: string | null;
  holdOwnerUserId: string | null;
  holdFollowUpAt: string | null;
  exitStatus: string | null;
  exitReason: string | null;
  exitedAt: string | null;
  purchaseDate: string | null;
  purchasePrice: number;
  buyerFees: number;
  otherAcquisitionCost: number;
  expectedSalePrice: number | null;
  titleStatus: InventoryTitleStatus;
  sourceSnapshot: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type InventoryDashboardSummary = {
  activeVehicles: number;
  needsAttention: number;
  readyVehicles: number;
  onHold: number;
  averageDaysHeld: number;
};

export type InventoryDashboardData = {
  vehicles: InventoryVehicleView[];
  summary: InventoryDashboardSummary;
};

// Legacy prototype types remain temporarily so the old mutation routes continue
// to compile until their conversion in the next Inventory application slice.
export type InventoryVehicleStage =
  | "purchased"
  | "awaiting_transport"
  | "received"
  | "inspection"
  | "work_scoping"
  | "parts_ordered"
  | "in_service"
  | "awaiting_detail"
  | "ready_for_sale"
  | "listed"
  | "sale_pending"
  | "sold"
  | "blocked";

export type InventoryWorkItemStatus =
  | "not_started"
  | "awaiting_approval"
  | "approved"
  | "scheduled"
  | "in_progress"
  | "complete"
  | "cancelled";

export type InventoryWorkItem = {
  id: string;
  inventoryVehicleId: string;
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

export type InventoryFinancialInputs = {
  purchasePrice: number;
  buyerFees: number;
  transportCost: number;
  otherAcquisitionCost: number;
  expectedSalePrice: number | null;
  workItems: Array<
    Pick<InventoryWorkItem, "status" | "estimatedCost" | "actualCost">
  >;
};

export type InventoryFinancialSummary = {
  acquisitionCost: number;
  completedWorkCost: number;
  outstandingWorkCost: number;
  actualInvestedToDate: number;
  projectedAllInCost: number;
  projectedGrossProfit: number | null;
};
