"use client";

import { useRouter } from "next/navigation";

import type {
  InventoryDashboardData,
  InventoryVehicleView,
} from "@/lib/mindful-inventory/queries";
import type {
  InventoryVehicleHealth,
  InventoryVehiclePhase,
  InventoryVehiclePriority,
} from "@/lib/mindful-inventory/types";

type InventoryDashboardProps = {
  data: InventoryDashboardData;
};

const phaseLabels: Record<InventoryVehiclePhase, string> = {
  purchased: "Purchased",
  intake: "Intake",
  inspection: "Mechanical",
  planning: "Work Plan",
  reconditioning: "Active Work",
  final_qc: "Final QC",
  merchandising: "Media",
  ready: "Ready",
};

const healthLabels: Record<InventoryVehicleHealth, string> = {
  on_track: "On Track",
  at_risk: "At Risk",
  behind: "Behind",
  blocked: "Blocked",
};

const priorityLabels: Record<InventoryVehiclePriority, { label: string; note: string }> = {
  "1": { label: "High", note: "Move first / time-sensitive" },
  "2": { label: "Normal", note: "Standard operating priority" },
  "3": { label: "Low", note: "Can wait behind other work" },
};

const gradeNotes = {
  a: "Light / minimal reconditioning",
  b: "Minor reconditioning",
  c: "Moderate reconditioning",
  d: "Major reconditioning",
  e: "Extensive / complex reconditioning",
} as const;

function formatDate(value: string | null, includeYear = false) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "—";
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(includeYear ? { year: "numeric" } : {}),
  });
}

function daysHeld(vehicle: InventoryVehicleView) {
  const start = new Date(vehicle.purchaseDate || vehicle.createdAt).getTime();
  if (!Number.isFinite(start)) return 0;
  return Math.max(0, Math.floor((Date.now() - start) / 86_400_000));
}

function ownerLabel(vehicle: InventoryVehicleView) {
  if (vehicle.nextActionOwnerPartnerName) return vehicle.nextActionOwnerPartnerName;
  if (vehicle.nextActionOwnerUserId) return "Mindful team";
  return "Unassigned";
}

function acquisitionStamp(vehicle: InventoryVehicleView) {
  return new Date(vehicle.purchaseDate || vehicle.createdAt).getTime();
}

function MetricCard({ label, value, note, emphasis = "neutral" }: { label: string; value: string; note: string; emphasis?: "neutral" | "attention" | "ready" }) {
  const tone = emphasis === "attention"
    ? "border-red-200 bg-red-50/70"
    : emphasis === "ready"
      ? "border-emerald-200 bg-emerald-50/60"
      : "border-slate-200 bg-white";
  const valueTone = emphasis === "attention" ? "text-red-700" : emphasis === "ready" ? "text-emerald-700" : "text-slate-950";
  return (
    <div className={`rounded-2xl border px-4 py-4 shadow-sm ${tone}`}>
      <div className="text-[11px] font-black uppercase tracking-[0.09em] text-slate-500">{label}</div>
      <div className={`mt-1.5 text-2xl font-black tracking-[-0.04em] ${valueTone}`}>{value}</div>
      <div className="mt-1 text-xs font-semibold text-slate-500">{note}</div>
    </div>
  );
}

function PhasePill({ phase }: { phase: InventoryVehiclePhase }) {
  const classes: Record<InventoryVehiclePhase, string> = {
    purchased: "border-slate-200 bg-slate-100 text-slate-700",
    intake: "border-blue-200 bg-blue-50 text-blue-700",
    inspection: "border-cyan-200 bg-cyan-50 text-cyan-700",
    planning: "border-violet-200 bg-violet-50 text-violet-700",
    reconditioning: "border-indigo-200 bg-indigo-50 text-indigo-700",
    final_qc: "border-amber-200 bg-amber-50 text-amber-800",
    merchandising: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700",
    ready: "border-emerald-200 bg-emerald-50 text-emerald-800",
  };
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-black ${classes[phase]}`}>{phaseLabels[phase]}</span>;
}

function HealthPill({ health, holdActive }: { health: InventoryVehicleHealth; holdActive: boolean }) {
  if (holdActive) return <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-black text-amber-800">On Hold</span>;
  const classes: Record<InventoryVehicleHealth, string> = {
    on_track: "border-emerald-200 bg-emerald-50 text-emerald-800",
    at_risk: "border-amber-200 bg-amber-50 text-amber-800",
    behind: "border-orange-200 bg-orange-50 text-orange-800",
    blocked: "border-red-200 bg-red-50 text-red-700",
  };
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-black ${classes[health]}`}>{healthLabels[health]}</span>;
}

function urgencyBorder(vehicle: InventoryVehicleView) {
  if (vehicle.health === "blocked") return "border-l-red-500";
  if (vehicle.holdActive || vehicle.health === "behind" || vehicle.health === "at_risk") return "border-l-amber-400";
  if (vehicle.phase === "ready") return "border-l-emerald-500";
  return "border-l-slate-300";
}

function EmptyInventory() {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center shadow-sm">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-slate-100 text-2xl">🚘</div>
      <h2 className="mt-5 text-xl font-black tracking-[-0.025em] text-slate-950">No vehicles in Inventory yet</h2>
      <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-600">Purchased Lot Logic evaluations will enter Inventory here as a one-time operational snapshot.</p>
    </div>
  );
}

export function InventoryDashboard({ data }: InventoryDashboardProps) {
  const router = useRouter();
  const { vehicles, summary } = data;
  const orderedVehicles = [...vehicles].sort((a, b) => acquisitionStamp(b) - acquisitionStamp(a));

  function openVehicle(vehicleId: string) {
    router.push(`/mindful/inventory/${vehicleId}`);
  }

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Active Inventory" value={String(summary.activeVehicles)} note="Vehicles still moving through operations" />
        <MetricCard label="Needs Attention" value={String(summary.needsAttention)} note="Risk, blocker, hold, or overdue action" emphasis={summary.needsAttention > 0 ? "attention" : "neutral"} />
        <MetricCard label="Ready" value={String(summary.readyVehicles)} note="Operationally ready vehicles" emphasis={summary.readyVehicles > 0 ? "ready" : "neutral"} />
        <MetricCard label="On Hold" value={String(summary.onHold)} note="Active hold overlays" emphasis={summary.onHold > 0 ? "attention" : "neutral"} />
        <MetricCard label="Average Days Held" value={String(summary.averageDaysHeld)} note="Across active inventory" />
      </div>

      <div className="mt-6">
        {vehicles.length === 0 ? (
          <EmptyInventory />
        ) : (
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-4 sm:flex-row sm:items-end sm:justify-between sm:px-5">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Inventory at a glance</div>
                <h2 className="mt-1 text-lg font-black tracking-[-0.025em] text-slate-950">Vehicle Operations</h2>
                <p className="mt-1 text-sm text-slate-500">Newest acquisitions first. Open a vehicle for its full operating workspace.</p>
              </div>
              <div className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-black text-slate-600">{vehicles.length} vehicles</div>
            </div>

            <div className="divide-y divide-slate-200">
              {orderedVehicles.map((vehicle) => {
                const vehicleName = [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(" ");
                const held = daysHeld(vehicle);
                const priority = priorityLabels[vehicle.priority];
                return (
                  <article
                    key={vehicle.id}
                    role="link"
                    tabIndex={0}
                    onClick={() => openVehicle(vehicle.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openVehicle(vehicle.id);
                      }
                    }}
                    className={`grid cursor-pointer gap-4 border-l-4 px-4 py-4 outline-none transition hover:bg-slate-50/80 focus:bg-slate-50 focus:ring-2 focus:ring-inset focus:ring-slate-300 md:grid-cols-[minmax(250px,1.4fr)_180px_minmax(260px,1.4fr)_180px] md:items-center sm:px-5 ${urgencyBorder(vehicle)}`}
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-black tracking-[-0.015em] text-slate-950">{vehicleName}</h3>
                        <HealthPill health={vehicle.health} holdActive={vehicle.holdActive} />
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs font-semibold text-slate-500">
                        <span>{vehicle.stockNumber ? `Stock #${vehicle.stockNumber}` : vehicle.vin || "No VIN"}</span>
                        {vehicle.mileage !== null ? <span>{vehicle.mileage.toLocaleString()} mi</span> : null}
                        {vehicle.currentLocationName ? <span>{vehicle.currentLocationName}</span> : null}
                      </div>
                      <div className="mt-2 text-xs font-bold text-slate-500">
                        Acquired {formatDate(vehicle.purchaseDate || vehicle.createdAt, true)} · <span className={held >= 30 ? "text-red-700" : held >= 14 ? "text-amber-700" : "text-slate-700"}>{held} day{held === 1 ? "" : "s"} held</span>
                      </div>
                      {vehicle.grade ? (
                        <div className="mt-1 text-[11px] font-semibold text-slate-500">
                          Condition Grade {vehicle.grade.toUpperCase()} · {gradeNotes[vehicle.grade]}
                        </div>
                      ) : null}
                    </div>

                    <div>
                      <div className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">Current Step</div>
                      <div className="mt-1.5"><PhasePill phase={vehicle.phase} /></div>
                    </div>

                    <div className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3">
                      <div className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">Next Action</div>
                      <div className="mt-1 text-sm font-black leading-5 text-slate-900">{vehicle.nextAction || "No next action set"}</div>
                      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-semibold text-slate-500">
                        <span>Owner: {ownerLabel(vehicle)}</span>
                        {vehicle.nextActionDueAt ? <span>Due {formatDate(vehicle.nextActionDueAt)}</span> : null}
                      </div>
                      {vehicle.holdActive && vehicle.holdReason ? <div className="mt-2 text-xs font-bold text-amber-700">Hold: {vehicle.holdReason}</div> : null}
                    </div>

                    <div className="grid grid-cols-2 gap-2 md:grid-cols-1">
                      <div className="rounded-xl bg-slate-50 px-3 py-2.5">
                        <div className="text-[9px] font-black uppercase tracking-[0.09em] text-slate-400">Forecast Ready</div>
                        <div className="mt-1 text-sm font-black text-slate-900">
                          {vehicle.forecastReadyAt ? formatDate(vehicle.forecastReadyAt) : vehicle.phase === "ready" ? "Ready now" : "Pending schedule"}
                        </div>
                        {vehicle.targetReadyAt ? <div className="mt-0.5 text-[10px] font-semibold text-slate-500">Target {formatDate(vehicle.targetReadyAt)}</div> : null}
                      </div>
                      <div className="rounded-xl bg-slate-50 px-3 py-2.5">
                        <div className="text-[9px] font-black uppercase tracking-[0.09em] text-slate-400">Urgency</div>
                        <div className="mt-1 text-sm font-black text-slate-900">{priority.label}</div>
                        <div className="mt-0.5 text-[10px] font-semibold text-slate-500">P{vehicle.priority} · {priority.note}</div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </>
  );
}
