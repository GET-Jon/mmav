import type {
  InventoryDashboardData,
  InventoryVehicleView,
} from "@/lib/mindful-inventory/queries";
import type {
  InventoryVehicleHealth,
  InventoryVehiclePhase,
} from "@/lib/mindful-inventory/types";

type InventoryDashboardProps = {
  data: InventoryDashboardData;
};

const phaseLabels: Record<InventoryVehiclePhase, string> = {
  purchased: "Purchased",
  intake: "Intake",
  inspection: "Inspection",
  planning: "Planning",
  reconditioning: "Reconditioning",
  final_qc: "Final QC",
  merchandising: "Merchandising",
  ready: "Ready",
};

const healthLabels: Record<InventoryVehicleHealth, string> = {
  on_track: "On Track",
  at_risk: "At Risk",
  behind: "Behind",
  blocked: "Blocked",
};

function formatDate(value: string | null) {
  if (!value) {
    return "—";
  }

  const parsed = new Date(value);

  if (!Number.isFinite(parsed.getTime())) {
    return "—";
  }

  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function daysHeld(vehicle: InventoryVehicleView) {
  const start = new Date(vehicle.purchaseDate || vehicle.createdAt).getTime();

  if (!Number.isFinite(start)) {
    return 0;
  }

  return Math.max(0, Math.floor((Date.now() - start) / 86_400_000));
}

function ownerLabel(vehicle: InventoryVehicleView) {
  if (vehicle.nextActionOwnerPartnerName) {
    return vehicle.nextActionOwnerPartnerName;
  }

  if (vehicle.nextActionOwnerUserId) {
    return "Internal user";
  }

  return "Unassigned";
}

function MetricCard({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
      <div className="text-xs font-bold uppercase tracking-[0.08em] text-slate-500">
        {label}
      </div>
      <div className="mt-2 text-2xl font-black tracking-[-0.04em] text-slate-950">
        {value}
      </div>
      <div className="mt-1 text-xs font-semibold text-slate-500">{note}</div>
    </div>
  );
}

function PhasePill({ phase }: { phase: InventoryVehiclePhase }) {
  return (
    <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-extrabold text-slate-700">
      {phaseLabels[phase]}
    </span>
  );
}

function HealthPill({ health }: { health: InventoryVehicleHealth }) {
  const attention = health !== "on_track";

  return (
    <span
      className={
        attention
          ? "inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-extrabold text-amber-800"
          : "inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-extrabold text-emerald-800"
      }
    >
      {healthLabels[health]}
    </span>
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
        Purchased Lot Logic evaluations will enter Inventory here as a one-time
        operational snapshot.
      </p>
    </div>
  );
}

export function InventoryDashboard({ data }: InventoryDashboardProps) {
  const { vehicles, summary } = data;

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          label="Active Inventory"
          value={String(summary.activeVehicles)}
          note="Vehicles still in process"
        />
        <MetricCard
          label="Needs Attention"
          value={String(summary.needsAttention)}
          note="Risk, blocker, hold, or overdue action"
        />
        <MetricCard
          label="Ready"
          value={String(summary.readyVehicles)}
          note="Operationally ready vehicles"
        />
        <MetricCard
          label="On Hold"
          value={String(summary.onHold)}
          note="Active hold overlays"
        />
        <MetricCard
          label="Average Days Held"
          value={String(summary.averageDaysHeld)}
          note="Across active inventory"
        />
      </div>

      <div className="mt-6">
        {vehicles.length === 0 ? (
          <EmptyInventory />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-4 py-4 sm:px-5">
              <h2 className="text-base font-black tracking-[-0.02em] text-slate-950">
                Vehicle Operations Board
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Current phase, ownership, next action, location, and readiness.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[1320px] border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80 text-left">
                    {[
                      "Vehicle",
                      "Phase",
                      "Grade / Priority",
                      "Health",
                      "Project Owner",
                      "Location",
                      "Next Action",
                      "Next Owner",
                      "Due",
                      "Target Ready",
                      "Forecast Ready",
                      "Days Held",
                    ].map((label) => (
                      <th
                        key={label}
                        className="px-4 py-3 text-xs font-black uppercase tracking-[0.08em] text-slate-500"
                      >
                        {label}
                      </th>
                    ))}
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

                    return (
                      <tr
                        key={vehicle.id}
                        className="border-b border-slate-100 align-top last:border-0 hover:bg-slate-50/60"
                      >
                        <td className="px-4 py-4">
                          <div className="font-extrabold text-slate-950">
                            {vehicleName}
                          </div>
                          <div className="mt-1 text-xs font-medium text-slate-500">
                            {vehicle.stockNumber
                              ? `Stock # ${vehicle.stockNumber}`
                              : vehicle.vin || "No stock number"}
                          </div>
                          {vehicle.mileage !== null ? (
                            <div className="mt-1 text-xs text-slate-400">
                              {vehicle.mileage.toLocaleString()} mi
                            </div>
                          ) : null}
                        </td>

                        <td className="px-4 py-4">
                          <PhasePill phase={vehicle.phase} />
                          {vehicle.holdActive ? (
                            <div className="mt-2 text-xs font-bold text-amber-700">
                              HOLD{vehicle.holdReason ? `: ${vehicle.holdReason}` : ""}
                            </div>
                          ) : null}
                        </td>

                        <td className="px-4 py-4 text-sm font-semibold text-slate-700">
                          <div>{vehicle.grade ? vehicle.grade.toUpperCase() : "—"}</div>
                          <div className="mt-1 text-xs text-slate-500">
                            Priority {vehicle.priority}
                          </div>
                        </td>

                        <td className="px-4 py-4">
                          <HealthPill health={vehicle.health} />
                        </td>

                        <td className="px-4 py-4 text-sm font-semibold text-slate-700">
                          {vehicle.projectOwnerUserId ? "Assigned" : "Unassigned"}
                        </td>

                        <td className="px-4 py-4 text-sm font-semibold text-slate-700">
                          {vehicle.currentLocationName || "—"}
                        </td>

                        <td className="max-w-[260px] px-4 py-4 text-sm font-semibold text-slate-800">
                          {vehicle.nextAction || "No next action set"}
                        </td>

                        <td className="px-4 py-4 text-sm font-semibold text-slate-700">
                          {ownerLabel(vehicle)}
                        </td>

                        <td className="px-4 py-4 text-sm font-semibold text-slate-700">
                          {formatDate(vehicle.nextActionDueAt)}
                        </td>

                        <td className="px-4 py-4 text-sm font-semibold text-slate-700">
                          {formatDate(vehicle.targetReadyAt)}
                        </td>

                        <td className="px-4 py-4 text-sm font-semibold text-slate-700">
                          {formatDate(vehicle.forecastReadyAt)}
                        </td>

                        <td className="px-4 py-4 text-center text-sm font-black text-slate-800">
                          {daysHeld(vehicle)}
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
    </>
  );
}
