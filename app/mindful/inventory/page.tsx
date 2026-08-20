import { notFound } from "next/navigation";

import { InventoryDashboard } from "@/components/mindful-inventory/inventory-dashboard";
import { AppTopNav } from "@/components/navigation/app-top-nav";
import { getMindfulInventoryAccess } from "@/lib/mindful-inventory/access";
import {
  getInventoryDashboardData,
  type InventoryDashboardData,
} from "@/lib/mindful-inventory/queries";

export const dynamic = "force-dynamic";

const emptyDashboard: InventoryDashboardData = {
  vehicles: [],
  summary: {
    activeVehicles: 0,
    needsAttention: 0,
    readyVehicles: 0,
    onHold: 0,
    averageDaysHeld: 0,
  },
};

export default async function MindfulInventoryPage() {
  const access = await getMindfulInventoryAccess();

  if (!access) {
    notFound();
  }

  let data = emptyDashboard;
  let loadError: string | null = null;

  try {
    data = await getInventoryDashboardData(
      access.supabase,
      access.company.companyId,
    );
  } catch (error) {
    loadError =
      error instanceof Error
        ? error.message
        : "Inventory failed to load.";
  }

  return (
    <main className="min-h-screen bg-[#f5f7fb] text-slate-950">
      <AppTopNav active="inventory" userEmail={access.userEmail} />

      <div className="mx-auto w-full max-w-[1480px] px-4 py-5 sm:px-5 lg:px-7">
        <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <div className="mb-2 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
              Mindful Motor Co. internal
            </div>

            <h1 className="text-[28px] font-black tracking-[-0.035em] text-slate-950">
              Inventory Operations
            </h1>

            <p className="mt-1 text-slate-600">
              Move every purchased vehicle from intake through ready status with
              clear ownership, next actions, and blockers.
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600 shadow-sm">
            Lot Logic purchase snapshot → Inventory Operations
          </div>
        </div>

        {loadError ? (
          <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            Inventory could not load: {loadError}
          </div>
        ) : null}

        <InventoryDashboard data={data} />
      </div>
    </main>
  );
}
