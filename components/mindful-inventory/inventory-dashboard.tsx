import type {
  InventoryDashboardData,
  InventoryVehicleView,
} from "@/lib/mindful-inventory/queries";

type InventoryDashboardProps = {
  data: InventoryDashboardData;
};

const stageLabels: Record<InventoryVehicleView["stage"], string> = {
  purchased: "Purchased",
  awaiting_transport: "Awaiting Transport",
  received: "Received",
  inspection: "Inspection",
  work_scoping: "Work Scoping",
  parts_ordered: "Parts Ordered",
  in_service: "In Service",
  awaiting_detail: "Awaiting Detail",
  ready_for_sale: "Ready for Sale",
  listed: "Listed",
  sale_pending: "Sale Pending",
  sold: "Sold",
  blocked: "Blocked",
};

function money(value: number | null) {
  if (value === null) {
    return "—";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function stageClass(stage: InventoryVehicleView["stage"]) {
  if (stage === "ready_for_sale" || stage === "listed") {
    return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  }

  if (stage === "blocked") {
    return "bg-red-50 text-red-700 ring-red-200";
  }

  if (
    stage === "in_service" ||
    stage === "parts_ordered" ||
    stage === "inspection"
  ) {
    return "bg-blue-50 text-blue-700 ring-blue-200";
  }

  if (
    stage === "awaiting_detail" ||
    stage === "awaiting_transport" ||
    stage === "work_scoping"
  ) {
    return "bg-amber-50 text-amber-700 ring-amber-200";
  }

  return "bg-slate-100 text-slate-700 ring-slate-200";
}

function MetricCard({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
      <div className="text-xs font-bold uppercase tracking-[0.08em] text-slate-500">
        {label}
      </div>
      <div
        className={[
          "mt-2 text-2xl font-black tracking-[-0.04em]",
          emphasis ? "text-emerald-700" : "text-slate-950",
        ].join(" ")}
      >
        {value}
      </div>
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
        Inventory is ready. The next step will add a vehicle by taking a
        one-time snapshot from an existing Lot Logic evaluation or by entering
        a vehicle manually.
      </p>

      <div className="mt-5 text-xs font-bold uppercase tracking-[0.12em] text-slate-400">
        Inventory does not modify Lot Logic evaluations
      </div>
    </div>
  );
}

export function InventoryDashboard({
  data,
}: InventoryDashboardProps) {
  const { vehicles, summary } = data;

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Active Vehicles"
          value={String(summary.activeVehicles)}
        />
        <MetricCard
          label="Cash Invested"
          value={money(summary.cashInvested)}
        />
        <MetricCard
          label="Remaining Spend"
          value={money(summary.remainingSpend)}
        />
        <MetricCard
          label="Projected All-In"
          value={money(summary.projectedAllIn)}
        />
        <MetricCard
          label="Projected Retail"
          value={money(summary.projectedRetail)}
        />
        <MetricCard
          label="Projected Gross Profit"
          value={money(summary.projectedGrossProfit)}
          emphasis
        />
        <MetricCard
          label="Ready for Sale"
          value={String(summary.readyForSale)}
        />
        <MetricCard
          label="Blocked"
          value={String(summary.blocked)}
        />
      </div>

      <div className="mt-6">
        {vehicles.length === 0 ? (
          <EmptyInventory />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-[1100px] w-full border-collapse">
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
                    <th className="px-4 py-3 text-right text-xs font-black uppercase tracking-[0.08em] text-slate-500">
                      Invested
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-black uppercase tracking-[0.08em] text-slate-500">
                      Remaining
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-black uppercase tracking-[0.08em] text-slate-500">
                      All-In
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-black uppercase tracking-[0.08em] text-slate-500">
                      Expected Sale
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-black uppercase tracking-[0.08em] text-slate-500">
                      Profit
                    </th>
                    <th className="px-4 py-3 text-xs font-black uppercase tracking-[0.08em] text-slate-500">
                      Next Action
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

                    return (
                      <tr
                        key={vehicle.id}
                        className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70"
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
                        </td>

                        <td className="px-4 py-4">
                          <span
                            className={[
                              "inline-flex rounded-full px-2.5 py-1 text-xs font-extrabold ring-1 ring-inset",
                              stageClass(vehicle.stage),
                            ].join(" ")}
                          >
                            {stageLabels[vehicle.stage]}
                          </span>
                        </td>

                        <td className="px-4 py-4 text-sm font-semibold text-slate-700">
                          {vehicle.currentLocation || "—"}
                        </td>

                        <td className="px-4 py-4 text-right text-sm font-bold text-slate-800">
                          {money(
                            vehicle.financials.actualInvestedToDate,
                          )}
                        </td>

                        <td className="px-4 py-4 text-right text-sm font-bold text-slate-800">
                          {money(
                            vehicle.financials.outstandingWorkCost,
                          )}
                        </td>

                        <td className="px-4 py-4 text-right text-sm font-black text-slate-950">
                          {money(
                            vehicle.financials.projectedAllInCost,
                          )}
                        </td>

                        <td className="px-4 py-4 text-right text-sm font-bold text-slate-800">
                          {money(vehicle.expectedSalePrice)}
                        </td>

                        <td className="px-4 py-4 text-right text-sm font-black text-emerald-700">
                          {money(
                            vehicle.financials.projectedGrossProfit,
                          )}
                        </td>

                        <td className="max-w-[220px] px-4 py-4 text-sm font-semibold text-slate-700">
                          {vehicle.nextAction || "No next action"}
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
