import { notFound } from "next/navigation";

import { InventoryQc } from "@/components/mindful-inventory/inventory-qc";
import { getMindfulInventoryAccess } from "@/lib/mindful-inventory/access";
import { getInventoryDashboardData } from "@/lib/mindful-inventory/queries";
import { getInventoryQcData } from "@/lib/mindful-inventory/qc";

export default async function InventoryQcPage({
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

  const data = await getInventoryQcData(
    access.supabase,
    vehicle.id,
  );

  return (
    <InventoryQc
      vehicleId={vehicle.id}
      data={data}
    />
  );
}
