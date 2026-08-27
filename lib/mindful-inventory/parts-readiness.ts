export type InventoryPartsReadiness =
  | "none"
  | "needed"
  | "ordered"
  | "backordered"
  | "ready"
  | "installed";

export type InventoryPartReadinessRow = {
  work_order_id: string;
  status: string;
  eta_at?: string | null;
};

export type InventoryPartsReadinessSummary = {
  readiness: InventoryPartsReadiness;
  partCount: number;
  pendingPartCount: number;
  latestEtaAt: string | null;
  readyForExecution: boolean;
};

export function summarizePartsReadiness(
  rows: InventoryPartReadinessRow[],
): InventoryPartsReadinessSummary {
  const active = rows.filter((row) => row.status !== "cancelled");
  if (!active.length) {
    return {
      readiness: "none",
      partCount: 0,
      pendingPartCount: 0,
      latestEtaAt: null,
      readyForExecution: true,
    };
  }

  const pending = active.filter(
    (row) => !["received", "installed"].includes(row.status),
  );
  const etaValues = pending
    .map((row) => row.eta_at)
    .filter((value): value is string => Boolean(value))
    .sort();

  let readiness: InventoryPartsReadiness;
  if (active.every((row) => row.status === "installed")) {
    readiness = "installed";
  } else if (pending.length === 0) {
    readiness = "ready";
  } else if (pending.some((row) => row.status === "backordered")) {
    readiness = "backordered";
  } else if (pending.some((row) => row.status === "needed")) {
    readiness = "needed";
  } else {
    readiness = "ordered";
  }

  return {
    readiness,
    partCount: active.length,
    pendingPartCount: pending.length,
    latestEtaAt: etaValues.at(-1) || null,
    readyForExecution: pending.length === 0,
  };
}
