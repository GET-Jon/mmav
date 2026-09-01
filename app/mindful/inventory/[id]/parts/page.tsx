import { notFound } from "next/navigation";

import { InventoryPartSuggestionsV2 } from "@/components/mindful-inventory/inventory-part-suggestions-v2";
import { InventoryTransportOnly } from "@/components/mindful-inventory/inventory-transport-only";
import { getMindfulInventoryAccess } from "@/lib/mindful-inventory/access";
import { buildPartSearchSuggestion } from "@/lib/mindful-inventory/part-suggestions";
import { getInventoryPartsTransportData } from "@/lib/mindful-inventory/parts-transport";
import { getInventoryDashboardData } from "@/lib/mindful-inventory/queries";

export default async function InventoryPartsPage({ params }: { params: Promise<{ id: string }> }) {
  const access = await getMindfulInventoryAccess();
  if (!access) notFound();

  const { id } = await params;
  const dashboard = await getInventoryDashboardData(access.supabase, access.company.companyId);
  const vehicle = dashboard.vehicles.find((item) => item.id === id);
  if (!vehicle) notFound();

  const data = await getInventoryPartsTransportData(access.supabase, access.company.companyId, vehicle.id);
  const suggestions = data.workOrders
    .filter((work) => !["complete", "cancelled"].includes(work.status))
    .map((work) => buildPartSearchSuggestion(vehicle, work));

  return (
    <div className="space-y-6">
      <InventoryPartSuggestionsV2 vehicleId={vehicle.id} suggestions={suggestions} parts={data.parts} />
      <InventoryTransportOnly vehicleId={vehicle.id} data={data} />
    </div>
  );
}
