import { notFound } from "next/navigation";

import { InventoryVehicleWorkspace } from "@/components/mindful-inventory/inventory-vehicle-workspace";
import { AppTopNav } from "@/components/navigation/app-top-nav";
import { getMindfulInventoryAccess } from "@/lib/mindful-inventory/access";
import { getInventoryDashboardData } from "@/lib/mindful-inventory/queries";

export const dynamic = "force-dynamic";

export default async function MindfulInventoryVehiclePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const access = await getMindfulInventoryAccess();

  if (!access) {
    notFound();
  }

  const { id } = await params;
  const data = await getInventoryDashboardData(
    access.supabase,
    access.company.companyId,
  );
  const vehicle = data.vehicles.find((item) => item.id === id);

  if (!vehicle) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-[#f5f7fb] text-slate-950">
      <AppTopNav active="inventory" userEmail={access.userEmail} />
      <div className="mx-auto w-full max-w-[1480px] px-4 py-5 sm:px-5 lg:px-7">
        <InventoryVehicleWorkspace vehicle={vehicle} />
      </div>
    </main>
  );
}
