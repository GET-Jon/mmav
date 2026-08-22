"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import type { InventoryVehicleView } from "@/lib/mindful-inventory/types";

type Props = {
  vehicle: InventoryVehicleView;
  children: React.ReactNode;
};

const phases = [
  { value: "purchased", label: "Purchased", short: "Purchased" },
  { value: "intake", label: "Overview / Intake", short: "Intake" },
  { value: "inspection", label: "Mechanical Inspection", short: "Mechanical" },
  { value: "planning", label: "Work Plan Review", short: "Plan" },
  { value: "reconditioning", label: "Active Work", short: "Work" },
  { value: "final_qc", label: "Final Quality Check", short: "QC" },
  { value: "merchandising", label: "Merchandising", short: "Merchandise" },
  { value: "ready", label: "Ready for Sale", short: "Ready" },
] as const;

const phaseDescriptions: Record<string, string> = {
  purchased: "Review the Lot Logic snapshot, assign an Owner, complete Intake, and add desired upgrades.",
  intake: "Complete the received-condition record and hand the car to Mechanical.",
  inspection: "Mechanical validates the known issues, intake notes, and requested upgrades.",
  planning: "Review any material changes before the preliminary plan becomes active work.",
  reconditioning: "Execute the active Work Plan through partner work, parts, and scheduling.",
  final_qc: "Verify completed work before the vehicle moves to merchandising.",
  merchandising: "Prepare the vehicle and sales materials for market.",
  ready: "The vehicle has completed the operating workflow and is ready for sale.",
};

export function InventoryVehicleShell({ vehicle, children }: Props) {
  const pathname = usePathname();
  const base = `/mindful/inventory/${vehicle.id}`;
  const vehicleName = [vehicle.year, vehicle.make, vehicle.model, vehicle.trim]
    .filter(Boolean)
    .join(" ");
  const currentPhaseIndex = Math.max(0, phases.findIndex((phase) => phase.value === vehicle.phase));

  const sections = [
    { label: "Overview / Intake", href: base },
    { label: "Mechanical Inspection", href: `${base}/intake` },
    { label: "Work Plan", href: `${base}/car-plan` },
    { label: "Active Work", href: `${base}/work` },
    { label: "Parts / Transport", href: `${base}/parts` },
    { label: "QC", href: `${base}/qc` },
    { label: "Media", href: `${base}/media` },
    { label: "History", href: `${base}/history` },
  ];

  return (
    <div className="mx-auto w-full max-w-[1480px] space-y-4 px-4 py-5 sm:px-5 lg:px-7">
      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="px-5 py-4 sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-400">Inventory Vehicle</div>
              <h1 className="mt-1 truncate text-2xl font-black tracking-[-0.03em] text-slate-950 sm:text-3xl">{vehicleName}</h1>
              <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold text-slate-500">
                <span>{vehicle.stockNumber ? `Stock # ${vehicle.stockNumber}` : "No stock number"}</span>
                {vehicle.vin ? <span>{vehicle.vin}</span> : null}
                {vehicle.mileage !== null ? <span>{vehicle.mileage.toLocaleString()} mi</span> : null}
              </div>
            </div>

            <Link
              href="/mindful/inventory"
              className="self-start rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700 hover:bg-slate-50"
            >
              ← Inventory Board
            </Link>
          </div>

          <div className="mt-4 overflow-x-auto pb-1">
            <div className="flex min-w-[760px] items-start">
              {phases.map((phase, index) => {
                const complete = index < currentPhaseIndex;
                const active = index === currentPhaseIndex;
                return (
                  <div key={phase.value} className="flex min-w-0 flex-1 items-start">
                    <div className="min-w-0 flex-1 text-center">
                      <div className={`mx-auto flex h-7 w-7 items-center justify-center rounded-full text-xs font-black ${complete ? "bg-emerald-600 text-white" : active ? "bg-slate-950 text-white ring-4 ring-slate-200" : "bg-slate-100 text-slate-400"}`}>
                        {complete ? "✓" : index + 1}
                      </div>
                      <div className={`mt-2 truncate px-1 text-[11px] font-black ${active ? "text-slate-950" : complete ? "text-emerald-700" : "text-slate-400"}`}>{phase.short}</div>
                    </div>
                    {index < phases.length - 1 ? <div className={`mt-3.5 h-0.5 w-5 shrink-0 ${index < currentPhaseIndex ? "bg-emerald-500" : "bg-slate-200"}`} /> : null}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-2 text-center text-sm font-semibold text-slate-500">
            <span className="font-black text-slate-900">Current: {phases[currentPhaseIndex]?.label || "Vehicle workflow"}.</span>{" "}
            {phaseDescriptions[vehicle.phase] || "Review the vehicle and determine what should happen next."}
          </div>
        </div>

        <div className="border-t border-slate-200 bg-slate-50/70 px-2 py-2">
          <nav className="flex gap-1 overflow-x-auto">
            {sections.map((section) => {
              const active = section.href === base ? pathname === base : pathname === section.href || pathname.startsWith(`${section.href}/`);
              return (
                <Link
                  key={section.href}
                  href={section.href}
                  className={`whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-black transition ${active ? "bg-slate-950 text-white shadow-sm" : "text-slate-500 hover:bg-white hover:text-slate-900"}`}
                >
                  {section.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </section>

      <div>{children}</div>
    </div>
  );
}
