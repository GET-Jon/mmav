import Link from "next/link";
import { notFound } from "next/navigation";

import { InventoryActiveWork } from "@/components/mindful-inventory/inventory-active-work";
import { getMindfulInventoryAccess } from "@/lib/mindful-inventory/access";
import { getInventoryActiveWork, getInventorySchedulingOptions, type InventoryWorkOrderView } from "@/lib/mindful-inventory/active-work";
import { getInventoryPerformerOptions } from "@/lib/mindful-inventory/performers";
import { getInventoryDashboardData } from "@/lib/mindful-inventory/queries";

function partsLabel(value: string) {
  if (value === "backordered") return "Backordered";
  if (value === "ordered") return "Ordered / in transit";
  return "Parts needed";
}

function lateLabel(work: InventoryWorkOrderView, nowMs: number) {
  if (!work.scheduledStartAt || ["complete", "cancelled"].includes(work.status)) return null;

  const durationMinutes = Math.max(1, work.estimatedElapsedMinutes ?? work.estimatedDurationMinutes ?? 60);

  if (work.status === "in_progress" && work.actualStartAt) {
    const actualStartMs = new Date(work.actualStartAt).getTime();
    if (!Number.isFinite(actualStartMs)) return null;
    const expectedFinishMs = actualStartMs + durationMinutes * 60_000;
    const bufferMinutes = Math.max(30, Math.round(durationMinutes * 0.15));
    const lateMinutes = Math.floor((nowMs - expectedFinishMs) / 60_000);
    if (lateMinutes <= bufferMinutes) return null;
    const displayMinutes = Math.max(1, lateMinutes);
    return displayMinutes >= 60
      ? `${Math.round((displayMinutes / 60) * 10) / 10} hr past expected finish`
      : `${displayMinutes} min past expected finish`;
  }

  if (work.status !== "in_progress" && !work.actualStartAt) {
    const startMs = new Date(work.scheduledStartAt).getTime();
    if (!Number.isFinite(startMs)) return null;
    const lateMinutes = Math.floor((nowMs - startMs) / 60_000);
    if (lateMinutes <= 30) return null;
    return lateMinutes >= 60
      ? `${Math.round((lateMinutes / 60) * 10) / 10} hr late to start`
      : `${lateMinutes} min late to start`;
  }

  return null;
}

export default async function InventoryWorkPage({ params }: { params: Promise<{ id: string }> }) {
  const access = await getMindfulInventoryAccess();
  if (!access) notFound();

  const { id } = await params;
  const dashboard = await getInventoryDashboardData(access.supabase, access.company.companyId);
  const vehicle = dashboard.vehicles.find((item) => item.id === id);
  if (!vehicle) notFound();

  const [workOrders, performerOptions, schedulingOptions] = await Promise.all([
    getInventoryActiveWork(access.supabase, vehicle.id),
    getInventoryPerformerOptions(access.supabase, access.company.companyId),
    getInventorySchedulingOptions(access.supabase, access.company.companyId),
  ]);

  const waitingOnParts = workOrders.filter(
    (work) =>
      !["complete", "cancelled"].includes(work.status) &&
      !work.partsReadyForExecution,
  );

  const nowMs = Date.now();
  const behindSchedule = workOrders
    .map((work) => ({ work, label: lateLabel(work, nowMs) }))
    .filter((item): item is { work: InventoryWorkOrderView; label: string } => Boolean(item.label));

  return (
    <div className="space-y-4">
      {behindSchedule.length ? (
        <section className="rounded-2xl border-2 border-red-300 bg-red-50 px-4 py-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.1em] text-red-700">
                Behind schedule
              </div>
              <div className="mt-0.5 text-sm font-black text-slate-950">
                {behindSchedule.length} Work Order{behindSchedule.length === 1 ? " is" : "s are"} behind schedule.
              </div>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-red-800">
                {behindSchedule.map(({ work, label }) => (
                  <span key={work.id}>
                    <span className="font-black">{work.title}</span> · {label}
                  </span>
                ))}
              </div>
            </div>
            <Link
              href="/mindful/inventory/schedule"
              className="shrink-0 rounded-xl bg-red-700 px-4 py-2 text-xs font-black text-white"
            >
              Open Schedule →
            </Link>
          </div>
        </section>
      ) : null}

      {waitingOnParts.length ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.1em] text-amber-700">
                Parts readiness
              </div>
              <div className="mt-0.5 text-sm font-black text-slate-950">
                {waitingOnParts.length} Work Order{waitingOnParts.length === 1 ? " is" : "s are"} waiting on parts.
              </div>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-slate-600">
                {waitingOnParts.slice(0, 4).map((work) => (
                  <span key={work.id}>
                    <span className="font-black">{work.title}</span> · {partsLabel(work.partsReadiness)}
                    {work.pendingPartCount ? ` (${work.pendingPartCount})` : ""}
                    {work.partsLatestEtaAt
                      ? ` · ETA ${new Date(work.partsLatestEtaAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
                      : ""}
                  </span>
                ))}
              </div>
            </div>
            <Link
              href={`/mindful/inventory/${vehicle.id}/parts`}
              className="shrink-0 rounded-xl bg-amber-900 px-4 py-2 text-xs font-black text-white"
            >
              Manage Parts →
            </Link>
          </div>
        </section>
      ) : null}

      <InventoryActiveWork
        vehicleId={vehicle.id}
        vehicle={{
          year: vehicle.year,
          make: vehicle.make,
          model: vehicle.model,
          trim: vehicle.trim,
          vin: vehicle.vin,
          stockNumber: vehicle.stockNumber,
        }}
        workOrders={workOrders}
        performerOptions={performerOptions}
        locationOptions={schedulingOptions.locations}
        resourceOptions={schedulingOptions.resources}
      />
    </div>
  );
}