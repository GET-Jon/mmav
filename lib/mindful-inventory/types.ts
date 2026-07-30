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

export type InventoryTitleStatus =
  | "unknown"
  | "awaiting"
  | "received"
  | "issue"
  | "not_applicable";

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
    Pick<
      InventoryWorkItem,
      "status" | "estimatedCost" | "actualCost"
    >
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
