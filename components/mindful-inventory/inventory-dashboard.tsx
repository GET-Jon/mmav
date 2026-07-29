"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { InventoryVehicleDrawer } from "@/components/mindful-inventory/inventory-vehicle-drawer";
import type {
  InventoryDashboardData,
  InventoryVehicleView,
  InventoryWorkItemView,
} from "@/lib/mindful-inventory/queries";

type InventoryDashboardProps = {
  data: InventoryDashboardData;
};

const stageOptions = [
  ["purchased", "Purchased"],
  ["awaiting_transport", "Awaiting Transport"],
  ["received", "Received"],
  ["inspection", "Inspection"],
  ["work_scoping", "Work Scoping"],
  ["parts_ordered", "Parts Ordered"],
  ["in_service", "In Service"],
  ["awaiting_detail", "Awaiting Detail"],
  ["ready_for_sale", "Ready for Sale"],
  ["listed", "Listed"],
  ["sale_pending", "Sale Pending"],
  ["sold", "Sold"],
  ["blocked", "Blocked"],
] as const;

const activeWorkStatuses = new Set([
  "not_started",
  "awaiting_approval",
  "approved",
  "scheduled",
  "in_progress",
]);

const workStatusRank: Record<string, number> = {
  in_progress: 0,
  scheduled: 1,
  approved: 2,
  awaiting_approval: 3,
  not_started: 4,
};

const priorityRank: Record<string, number> = {
  required: 0,
  recommended: 1,
  optional: 2,
};

function dateValue(value: string | null) {
  if (!value) {
    return Number.POSITIVE_INFINITY;
  }

  const parsed = new Date(`${value}T12:00:00`).getTime();
  return Number.isFinite(parsed)
    ? parsed
    : Number.POSITIVE_INFINITY;
}

function formatDate(value: string | null) {
  if (!value) {
    return "—";
  }

  return new Date(`${value}T12:00:00`).toLocaleDateString(
    "en-US",
    {
      month: "short",
      day: "numeric",
    },
  );
}

function daysHeld(vehicle: InventoryVehicleView) {
  const startValue =
    vehicle.purchaseDate || vehicle.createdAt.slice(0, 10);

  const start = new Date(`${startValue}T12:00:00`).getTime();

  if (!Number.isFinite(start)) {
    return 0;
  }

  return Math.max(
    0,
    Math.floor((Date.now() - start) / 86_400_000),
  );
}

function getActiveWorkItems(vehicle: InventoryVehicleView) {
  return vehicle.workItems.filter((item) =>
    activeWorkStatuses.has(item.status),
  );
}

function getNextWorkItem(vehicle: InventoryVehicleView) {
  const activeItems = getActiveWorkItems(vehicle);

  return [...activeItems].sort((a, b) => {
    const statusDifference =
      (workStatusRank[a.status] ?? 99) -
      (workStatusRank[b.status] ?? 99);

    if (statusDifference !== 0) {
      return statusDifference;
    }

    const dateDifference =
      dateValue(a.scheduledDate) -
      dateValue(b.scheduledDate);

    if (dateDifference !== 0) {
      return dateDifference;
    }

    return (
      (priorityRank[a.priority] ?? 99) -
      (priorityRank[b.priority] ?? 99)
    );
  })[0] ?? null;
}

function getOperationalStatus(vehicle: InventoryVehicleView) {
  if (vehicle.workItems.length === 0) {
    return {
      label: "Awaiting user input",
      item: null,
      kind: "empty" as const,
    };
  }

  const nextItem = getNextWorkItem(vehicle);

  if (!nextItem) {
    return {
      label: "Ready for sale",
      item: null,
      kind: "ready" as const,
    };
  }

  return {
    label: nextItem.description,
    item: nextItem,
    kind: "active" as const,
  };
}

function isOverdue(item: InventoryWorkItemView | null) {
  if (!item?.scheduledDate) {
    return false;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    new Date(`${item.scheduledDate}T00:00:00`) <
    today
  );
}

function MetricCard({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
      <div className="text-xs font-bold uppercase tracking-[0.08em] text-slate-500">
        {label}
      </div>

      <div className="mt-2 text-2xl font-black tracking-[-0.04em] text-slate-950">
        {value}
      </div>

      {note ? (
        <div className="mt-1 text-xs font-semibold text-slate-500">
          {note}
        </div>
      ) : null}
    </div>
  );
}

function EmptyInventory() {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center shadow-sm">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-slate-100 text-2xl">
        🚘
      </div>

      <h2 className="mt-5 text-xl font-black tracking-[-0.025em] text-slate-950">
        No vehicles in Inventory yet
      </h2>

      <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-600">
        Mark a vehicle as purchased in the Deal Pipeline to
        add its one-time snapshot to Mindful Inventory.
      </p>
    </div>
  );
}

export function InventoryDashboard({
  data,
}: InventoryDashboardProps) {
  const { vehicles } = data;
  const router = useRouter();

  const [selectedVehicle, setSelectedVehicle] =
    useState<InventoryVehicleView | null>(null);
  const [savingVehicleId, setSavingVehicleId] =
    useState<string | null>(null);
  const [completingItemId, setCompletingItemId] =
    useState<string | null>(null);
  const [error, setError] = useState("");

  const activeVehicles = vehicles.filter(
    (vehicle) => vehicle.stage !== "sold",
  );

  const needsAttention = activeVehicles.filter((vehicle) => {
    const operationalStatus = getOperationalStatus(vehicle);

    return (
      vehicle.stage === "blocked" ||
      operationalStatus.kind === "empty" ||
      isOverdue(operationalStatus.item) ||
      operationalStatus.item?.status === "awaiting_approval"
    );
  });

  const readyOrListed = activeVehicles.filter((vehicle) =>
    [
      "ready_for_sale",
      "listed",
      "sale_pending",
    ].includes(vehicle.stage),
  );

  const averageDaysHeld =
    activeVehicles.length === 0
      ? 0
      : Math.round(
          activeVehicles.reduce(
            (total, vehicle) =>
              total + daysHeld(vehicle),
            0,
          ) / activeVehicles.length,
        );

  async function updateVehicleStage(
    vehicle: InventoryVehicleView,
    nextStage: InventoryVehicleView["stage"],
  ) {
    setSavingVehicleId(vehicle.id);
    setError("");

    try {
      const response = await fetch(
        `/api/mindful/inventory/vehicles/${vehicle.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            purchasePrice: vehicle.purchasePrice,
            buyerFees: vehicle.buyerFees,
            transportCost: vehicle.transportCost,
            otherAcquisitionCost:
              vehicle.otherAcquisitionCost,
            stage: nextStage,
            currentLocation:
              vehicle.currentLocation || "",
            titleStatus: vehicle.titleStatus,
            targetReadyDate:
              vehicle.targetReadyDate || "",
            expectedSalePrice:
              vehicle.expectedSalePrice ?? "",
            nextAction: vehicle.nextAction || "",
            nextActionOwner:
              vehicle.nextActionOwner || "",
            nextActionDueDate:
              vehicle.nextActionDueDate || "",
            notes: vehicle.notes || "",
          }),
        },
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error || "Vehicle stage could not be updated.",
        );
      }

      router.refresh();
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Vehicle stage could not be updated.",
      );
    } finally {
      setSavingVehicleId(null);
    }
  }

  async function markWorkItemComplete(
    vehicle: InventoryVehicleView,
    item: InventoryWorkItemView,
  ) {
    setCompletingItemId(item.id);
    setError("");

    try {
      const completedDate = new Date()
        .toISOString()
        .slice(0, 10);

      const response = await fetch(
        `/api/mindful/inventory/work-items/${item.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            description: item.description,
            category: item.category,
            priority: item.priority,
            status: "complete",
            vendor: item.vendor || "",
            estimatedCost: item.estimatedCost,
            actualCost: item.actualCost ?? "",
            scheduledDate: item.scheduledDate || "",
            completedDate,
            requiresApproval: item.requiresApproval,
            notes: item.notes || "",
          }),
        },
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error || "Work item could not be completed.",
        );
      }

      const remainingActiveItems = getActiveWorkItems(
        vehicle,
      ).filter((activeItem) => activeItem.id !== item.id);

      if (
        remainingActiveItems.length === 0 &&
        vehicle.workItems.length > 0 &&
        ![
          "listed",
          "sale_pending",
          "sold",
        ].includes(vehicle.stage)
      ) {
        await updateVehicleStage(
          vehicle,
          "ready_for_sale",
        );
      } else {
        router.refresh();
      }
    } catch (completeError) {
      setError(
        completeError instanceof Error
          ? completeError.message
          : "Work item could not be completed.",
      );
    } finally {
      setCompletingItemId(null);
    }
  }

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Active Inventory"
          value={String(activeVehicles.length)}
          note="Vehicles currently in process"
        />

        <MetricCard
          label="Needs Attention"
          value={String(needsAttention.length)}
          note="Blocked, overdue, or missing a plan"
        />

        <MetricCard
          label="Ready / Listed"
          value={String(readyOrListed.length)}
          note="Ready for sale through sale pending"
        />

        <MetricCard
          label="Average Days Held"
          value={String(averageDaysHeld)}
          note="Across active inventory"
        />
      </div>

      {error ? (
        <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </div>
      ) : null}

      <div className="mt-6">
        {vehicles.length === 0 ? (
          <EmptyInventory />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80 text-left">
                    <th className="px-4 py-3 text-xs font-black uppercase tracking-[0.08em] text-slate-500">
                      Vehicle
                    </th>

                    <th className="px-4 py-3 text-xs font-black uppercase tracking-[0.08em] text-slate-500">
                      Stage
                    </th>

                    <th className="px-4 py-3 text-xs font-black uppercase tracking-[0.08em] text-slate-500">
                      Location
                    </th>

                    <th className="px-4 py-3 text-center text-xs font-black uppercase tracking-[0.08em] text-slate-500">
                      Days Held
                    </th>

                    <th className="px-4 py-3 text-xs font-black uppercase tracking-[0.08em] text-slate-500">
                      Next Action
                    </th>

                    <th className="px-4 py-3 text-xs font-black uppercase tracking-[0.08em] text-slate-500">
                      Work Progress
                    </th>

                    <th className="px-4 py-3 text-xs font-black uppercase tracking-[0.08em] text-slate-500">
                      Target Ready
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {vehicles.map((vehicle) => {
                    const vehicleName = [
                      vehicle.year,
                      vehicle.make,
                      vehicle.model,
                      vehicle.trim,
                    ]
                      .filter(Boolean)
                      .join(" ");

                    const operationalStatus =
                      getOperationalStatus(vehicle);

                    const completedItems =
                      vehicle.workItems.filter(
                        (item) =>
                          item.status === "complete",
                      ).length;

                    const relevantItems =
                      vehicle.workItems.filter(
                        (item) =>
                          item.status !== "cancelled",
                      ).length;

                    const progress =
                      relevantItems === 0
                        ? 0
                        : Math.round(
                            (completedItems /
                              relevantItems) *
                              100,
                          );

                    return (
                      <tr
                        key={vehicle.id}
                        tabIndex={0}
                        role="button"
                        onClick={() =>
                          setSelectedVehicle(vehicle)
                        }
                        onKeyDown={(event) => {
                          if (
                            event.key === "Enter" ||
                            event.key === " "
                          ) {
                            event.preventDefault();
                            setSelectedVehicle(vehicle);
                          }
                        }}
                        className="cursor-pointer border-b border-slate-100 outline-none last:border-0 hover:bg-slate-50/70 focus:bg-slate-50"
                      >
                        <td className="px-4 py-4">
                          <div className="font-extrabold text-slate-950">
                            {vehicleName}
                          </div>

                          <div className="mt-1 text-xs font-medium text-slate-500">
                            {vehicle.stockNumber
                              ? `Stock # ${vehicle.stockNumber}`
                              : vehicle.vin ||
                                "No stock number"}
                          </div>
                        </td>

                        <td
                          className="px-4 py-4"
                          onClick={(event) =>
                            event.stopPropagation()
                          }
                        >
                          <select
                            value={vehicle.stage}
                            disabled={
                              savingVehicleId === vehicle.id
                            }
                            onChange={(event) =>
                              void updateVehicleStage(
                                vehicle,
                                event.target
                                  .value as InventoryVehicleView["stage"],
                              )
                            }
                            className="w-full min-w-[145px] rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-extrabold text-slate-700 outline-none focus:border-slate-400 disabled:opacity-60"
                            aria-label={`Stage for ${vehicleName}`}
                          >
                            {stageOptions.map(
                              ([value, label]) => (
                                <option
                                  key={value}
                                  value={value}
                                >
                                  {label}
                                </option>
                              ),
                            )}
                          </select>
                        </td>

                        <td className="px-4 py-4 text-sm font-semibold text-slate-700">
                          {vehicle.currentLocation || "—"}
                        </td>

                        <td className="px-4 py-4 text-center text-sm font-black text-slate-800">
                          {daysHeld(vehicle)}
                        </td>

                        <td className="max-w-[280px] px-4 py-4">
                          <div
                            className={[
                              "text-sm font-extrabold",
                              operationalStatus.kind ===
                              "ready"
                                ? "text-emerald-700"
                                : operationalStatus.kind ===
                                    "empty"
                                  ? "text-amber-700"
                                  : "text-slate-900",
                            ].join(" ")}
                          >
                            {operationalStatus.label}
                          </div>

                          {operationalStatus.item ? (
                            <div className="mt-1 flex flex-wrap items-center gap-2">
                              <span
                                className={[
                                  "text-xs font-semibold",
                                  isOverdue(
                                    operationalStatus.item,
                                  )
                                    ? "text-red-700"
                                    : "text-slate-500",
                                ].join(" ")}
                              >
                                {operationalStatus.item
                                  .scheduledDate
                                  ? `${
                                      isOverdue(
                                        operationalStatus.item,
                                      )
                                        ? "Overdue"
                                        : "Due"
                                    } ${formatDate(
                                      operationalStatus.item
                                        .scheduledDate,
                                    )}`
                                  : "No date scheduled"}
                              </span>

                              <button
                                type="button"
                                disabled={
                                  completingItemId ===
                                  operationalStatus.item.id
                                }
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void markWorkItemComplete(
                                    vehicle,
                                    operationalStatus.item!,
                                  );
                                }}
                                className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-extrabold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-60"
                              >
                                {completingItemId ===
                                operationalStatus.item.id
                                  ? "Completing..."
                                  : "Mark complete"}
                              </button>
                            </div>
                          ) : null}
                        </td>

                        <td className="min-w-[175px] px-4 py-4">
                          <div className="flex items-center justify-between gap-3 text-xs font-bold text-slate-600">
                            <span>
                              {completedItems} of{" "}
                              {relevantItems} complete
                            </span>
                            <span>{progress}%</span>
                          </div>

                          <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className="h-full rounded-full bg-slate-800 transition-all"
                              style={{
                                width: `${progress}%`,
                              }}
                            />
                          </div>
                        </td>

                        <td className="px-4 py-4 text-sm font-bold text-slate-700">
                          {formatDate(
                            vehicle.targetReadyDate,
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <InventoryVehicleDrawer
        vehicle={selectedVehicle}
        onClose={() => setSelectedVehicle(null)}
        onSaved={() => {
          setSelectedVehicle(null);
          router.refresh();
        }}
      />
    </>
  );
}
