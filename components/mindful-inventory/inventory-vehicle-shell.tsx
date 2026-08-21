"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import type { InventoryVehicleView } from "@/lib/mindful-inventory/types";

type Props = {
  vehicle: InventoryVehicleView;
  children: React.ReactNode;
};

const phaseLabels: Record<string, string> = {
  purchased: "Purchased",
  intake: "Intake",
  inspection: "Inspection",
  planning: "Planning",
  reconditioning: "Reconditioning",
  final_qc: "Final QC",
  merchandising: "Merchandising",
  ready: "Ready",
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-[105px] border-l border-slate-200 pl-4 first:border-l-0 first:pl-0">
      <div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">{label}</div>
      <div className="mt-1 text-sm font-black text-slate-900">{value}</div>
    </div>
  );
}

export function InventoryVehicleShell({ vehicle, children }: Props) {
  const pathname = usePathname();
  const base = `/mindful/inventory/${vehicle.id}`;
  const vehicleName = [vehicle.year, vehicle.make, vehicle.model, vehicle.trim]
    .filter(Boolean)
    .join(" ");

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
        <div className="flex flex-col gap-5 px-5 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-400">Vehicle Workspace</div>
            <h1 className="mt-1 truncate text-2xl font-black tracking-[-0.03em] text-slate-950 sm:text-3xl">{vehicleName}</h1>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold text-slate-500">
              <span>{vehicle.stockNumber ? `Stock # ${vehicle.stockNumber}` : "No stock number"}</span>
              {vehicle.vin ? <span>{vehicle.vin}</span> : null}
              {vehicle.mileage !== null ? <span>{vehicle.mileage.toLocaleString()} mi</span> : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <Stat label="Phase" value={phaseLabels[vehicle.phase] || vehicle.phase} />
            <Stat label="Health" value={healthLabels[vehicle.health] || vehicle.health} />
            <Stat label="Grade" value={vehicle.grade ? vehicle.grade.toUpperCase() : "—"} />
            <Stat label="Priority" value={`P${vehicle.priority}`} />
            <Stat label="Days Held" value={String(daysHeld(vehicle))} />
            <Stat label="Hold" value={vehicle.holdActive ? "Active" : "No"} />
          </div>
        </div>

        <div className="border-t border-slate-200 bg-slate-50/70 px-2 py-2">
          <nav className="flex gap-1 overflow-x-auto">
            {sections.map((section) => {
              const active =
                section.href === base
                  ? pathname === base
                  : pathname === section.href || pathname.startsWith(`${section.href}/`);

              return (
                <Link
                  key={section.href}
                  href={section.href}
                  className={`whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-black transition ${
                    active
                      ? "bg-slate-950 text-white shadow-sm"
                      : "text-slate-500 hover:bg-white hover:text-slate-900"
                  }`}
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
