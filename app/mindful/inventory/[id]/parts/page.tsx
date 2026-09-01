import { notFound } from "next/navigation";

import { InventoryPartSuggestions } from "@/components/mindful-inventory/inventory-part-suggestions";
import { InventoryPartsTransport } from "@/components/mindful-inventory/inventory-parts-transport";
import { TrackedPartDetailsEditor } from "@/components/mindful-inventory/tracked-part-details-editor";
import { getMindfulInventoryAccess } from "@/lib/mindful-inventory/access";
import { buildPartSearchSuggestion } from "@/lib/mindful-inventory/part-suggestions";
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

  const suggestions = data.workOrders
    .filter((work) => !["complete", "cancelled"].includes(work.status))
    .map((work) => buildPartSearchSuggestion(vehicle, work));

  return (
    <div className="space-y-6">
      <InventoryPartSuggestions
        vehicleId={vehicle.id}
        suggestions={suggestions}
        parts={data.parts}
      />
      <TrackedPartDetailsEditor vehicleId={vehicle.id} parts={data.parts} />
      <InventoryPartsTransport vehicleId={vehicle.id} data={data} />
    </div>
  );
}
