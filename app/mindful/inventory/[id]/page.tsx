import { notFound } from "next/navigation";

import { InventoryVehicleWorkspace } from "@/components/mindful-inventory/inventory-vehicle-workspace";
import { getMindfulInventoryAccess } from "@/lib/mindful-inventory/access";
import { getInventoryDashboardData } from "@/lib/mindful-inventory/queries";

export default async function MindfulInventoryVehiclePage({ params }: { params: Promise<{ id: string }> }) {
  const access = await getMindfulInventoryAccess();
  if (!access) notFound();

  const { id } = await params;
  const data = await getInventoryDashboardData(access.supabase, access.company.companyId);
  const vehicle = data.vehicles.find((item) => item.id === id);
  if (!vehicle) notFound();

  return <InventoryVehicleWorkspace vehicle={vehicle} />;
}
