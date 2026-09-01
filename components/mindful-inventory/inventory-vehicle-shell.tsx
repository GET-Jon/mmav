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
  { value: "detailing", label: "Detailing", short: "Detail" },
  { value: "final_qc", label: "Final Quality Check", short: "QC" },
  { value: "merchandising", label: "Merchandising", short: "Merchandise" },
  { value: "ready", label: "Ready for Sale", short: "Ready" },
] as const;

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
    { label: "Detailing", href: `${base}/detailing` },
    { label: "QC", href: `${base}/qc` },
    { label: "Media", href: `${base}/media` },
    { label: "History", href: `${base}/history` },
  ];

  return (
    <div className="mx-auto w-full max-w-[1480px] space-y-4 px-4 py-4 sm:px-5 lg:px-7">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="px-5 py-3.5 sm:px-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <h1 className="truncate text-2xl font-black tracking-[-0.03em] text-slate-950">{vehicleName}</h1>
                <span className="rounded-full bg-slate-950 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-white">{phases[currentPhaseIndex]?.short || "Inventory"}</span>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs font-semibold text-slate-500">
                <span>{vehicle.stockNumber ? `Stock # ${vehicle.stockNumber}` : "No stock number"}</span>
                {vehicle.vin ? <span>{vehicle.vin}</span> : null}
                {vehicle.mileage !== null ? <span>{vehicle.mileage.toLocaleString()} mi</span> : null}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 overflow-x-auto rounded-xl bg-slate-50 px-2 py-1.5">
                {phases.map((phase, index) => {
                  const complete = index < currentPhaseIndex;
                  const active = index === currentPhaseIndex;
                  return (
                    <div key={phase.value} className="flex items-center gap-1">
                      <span className={`whitespace-nowrap rounded-lg px-2 py-1 text-[10px] font-black ${active ? "bg-slate-950 text-white" : complete ? "bg-emerald-50 text-emerald-700" : "text-slate-400"}`}>
                        {complete ? "✓ " : ""}{phase.short}
                      </span>
                      {index < phases.length - 1 ? <span className="text-[10px] font-black text-slate-300">→</span> : null}
                    </div>
                  );
                })}
              </div>
              <Link href="/mindful/inventory" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50">← Inventory</Link>
            </div>
          </div>
        </div>

        <div className="border-t border-slate-200 bg-slate-50/70 px-2 py-1.5">
          <nav className="flex gap-1 overflow-x-auto">
            {sections.map((section) => {
              const active = section.href === base ? pathname === base : pathname === section.href || pathname.startsWith(`${section.href}/`);
              return (
                <Link key={section.href} href={section.href} className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-black transition ${active ? "bg-slate-950 text-white shadow-sm" : "text-slate-500 hover:bg-white hover:text-slate-900"}`}>
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
