import type {
  InventoryFinancialInputs,
  InventoryFinancialSummary,
} from "@/lib/mindful-inventory/types";

function safeMoney(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, value);
}

export function calculateInventoryFinancials(
  inputs: InventoryFinancialInputs
): InventoryFinancialSummary {
  const acquisitionCost =
    safeMoney(inputs.purchasePrice) +
    safeMoney(inputs.buyerFees) +
    safeMoney(inputs.transportCost) +
    safeMoney(inputs.otherAcquisitionCost);

  let completedWorkCost = 0;
  let outstandingWorkCost = 0;

  for (const item of inputs.workItems) {
    if (item.status === "cancelled") {
      continue;
    }

    if (item.status === "complete") {
      completedWorkCost += safeMoney(
        item.actualCost ?? item.estimatedCost
      );
      continue;
    }

    outstandingWorkCost += safeMoney(
      item.actualCost ?? item.estimatedCost
    );
  }

  const actualInvestedToDate =
    acquisitionCost + completedWorkCost;

  const projectedAllInCost =
    actualInvestedToDate + outstandingWorkCost;

  const projectedGrossProfit =
    inputs.expectedSalePrice == null
      ? null
      : safeMoney(inputs.expectedSalePrice) -
        projectedAllInCost;

  return {
    acquisitionCost,
    completedWorkCost,
    outstandingWorkCost,
    actualInvestedToDate,
    projectedAllInCost,
    projectedGrossProfit,
  };
}
