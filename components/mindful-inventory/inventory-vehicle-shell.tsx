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
  { value: "intake", label: "Purchaser Intake", short: "Intake" },
  { value: "inspection", label: "Mechanical Inspection", short: "Inspection" },
  { value: "planning", label: "Car Plan", short: "Plan" },
  { value: "reconditioning", label: "Work in Progress", short: "Work" },
  { value: "final_qc", label: "Final Quality Check", short: "QC" },
  { value: "merchandising", label: "Merchandising", short: "Merchandise" },
  { value: "ready", label: "Ready for Sale", short: "Ready" },
] as const;

const phaseDescriptions: Record<string, string> = {
  purchased: "The vehicle has been acquired. Confirm ownership, location, and complete purchaser intake.",
  intake: "Record how the vehicle arrived: mileage, keys, visible damage, and initial observations.",
  inspection: "Complete the mechanical inspection and record Findings. Findings are observations, not authorized repairs.",
  planning: "Review the Findings and decide what belongs in the Car Plan before any work is authorized.",
  reconditioning: "The approved Car Plan is being executed through Work Orders.",
  final_qc: "Verify completed work and decide whether the vehicle is ready to move forward.",
  merchandising: "Prepare photography, listing information, presentation, and sale materials.",
  ready: "The vehicle has completed the operating workflow and is ready for sale.",
};

const healthLabels: Record<string, string> = {
  on_track: "On Track",
  at_risk: "At Risk",
  behind: "Behind",
  blocked: "Blocked",
};

function daysHeld(vehicle: InventoryVehicleView) {
  const start = new Date(vehicle.purchaseDate || vehicle.createdAt).getTime();
  if (!Number.isFinite(start)) return 0;
  return Math.max(0, Math.floor((Date.now() - start) / 86_400_000));
}

export function InventoryVehicleShell({ vehicle, children }: Props) {
  const pathname = usePathname();
  const base = `/mindful/inventory/${vehicle.id}`;
  const vehicleName = [vehicle.year, vehicle.make, vehicle.model, vehicle.trim]
    .filter(Boolean)
    .join(" ");
  const currentPhaseIndex = Math.max(0, phases.findIndex((phase) => phase.value === vehicle.phase));
  const currentPhase = phases[currentPhaseIndex] || phases[0];

  const sections = [
    { label: "Overview", href: base },
    { label: "Intake & Inspection", href: `${base}/intake` },
    { label: "Car Plan", href: `${base}/car-plan` },
    { label: "Work", href: `${base}/work` },
    { label: "Parts / Transport", href: `${base}/parts` },
    { label: "QC", href: `${base}/qc` },
    { label: "Media", href: `${base}/media` },
    { label: "History", href: `${base}/history` },
  ];

  return (
    <div className="mx-auto w-full max-w-[1480px] space-y-5 px-4 py-5 sm:px-5 lg:px-7">
      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="px-5 py-5 sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-400">Inventory Vehicle</div>
              <h1 className="mt-1 truncate text-2xl font-black tracking-[-0.03em] text-slate-950 sm:text-3xl">{vehicleName}</h1>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold text-slate-500">
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

          <div className="mt-5 rounded-2xl bg-slate-950 p-4 text-white sm:p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Current Step</div>
                <div className="mt-1 text-xl font-black">{currentPhase.label}</div>
                <p className="mt-1 max-w-3xl text-sm font-medium leading-6 text-slate-300">
                  {phaseDescriptions[vehicle.phase] || "Review the vehicle status and determine the next action."}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-x-7 gap-y-3 text-sm sm:grid-cols-4">
                <div><div className="text-[10px] font-black uppercase text-slate-500">Health</div><div className="mt-1 font-black">{healthLabels[vehicle.health] || vehicle.health}</div></div>
                <div><div className="text-[10px] font-black uppercase text-slate-500">Priority</div><div className="mt-1 font-black">P{vehicle.priority}</div></div>
                <div><div className="text-[10px] font-black uppercase text-slate-500">Days Held</div><div className="mt-1 font-black">{daysHeld(vehicle)}</div></div>
                <div><div className="text-[10px] font-black uppercase text-slate-500">On Hold</div><div className="mt-1 font-black">{vehicle.holdActive ? "Yes" : "No"}</div></div>
              </div>
            </div>
          </div>

          <div className="mt-5 overflow-x-auto pb-1">
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
