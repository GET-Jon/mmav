import { notFound } from "next/navigation";

import { InventoryPartsTransport } from "@/components/mindful-inventory/inventory-parts-transport";
import { getMindfulInventoryAccess } from "@/lib/mindful-inventory/access";
import { getInventoryPartsTransportData } from "@/lib/mindful-inventory/parts-transport";
import { getInventoryDashboardData } from "@/lib/mindful-inventory/queries";

export default async function InventoryPartsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const access = await getMindfulInventoryAccess();
  if (!access) notFound();

  const { id } = await params;

  const dashboard = await getInventoryDashboardData(
    access.supabase,
    access.company.companyId,
  );

  const vehicle = dashboard.vehicles.find((item) => item.id === id);
  if (!vehicle) notFound();

  const data = await getInventoryPartsTransportData(
    access.supabase,
    access.company.companyId,
    vehicle.id,
  );

  return <InventoryPartsTransport vehicleId={vehicle.id} data={data} />;
}
