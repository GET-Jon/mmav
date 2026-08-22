import { notFound } from "next/navigation";

import { InventoryMechanicalInspection } from "@/components/mindful-inventory/inventory-mechanical-inspection";
import { InventoryMechanicalNextStep } from "@/components/mindful-inventory/inventory-mechanical-next-step";
import { getMindfulInventoryAccess } from "@/lib/mindful-inventory/access";
import { getInventoryIntakeInspectionData } from "@/lib/mindful-inventory/intake-inspection";
import { getInventoryOverviewIntakeData } from "@/lib/mindful-inventory/overview-intake";
import { getInventoryDashboardData } from "@/lib/mindful-inventory/queries";

export default async function InventoryMechanicalInspectionPage({ params }: { params: Promise<{ id: string }> }) {
  const access = await getMindfulInventoryAccess();
  if (!access) notFound();

  const { id } = await params;
  const dashboard = await getInventoryDashboardData(access.supabase, access.company.companyId);
  const vehicle = dashboard.vehicles.find((item) => item.id === id);
  if (!vehicle) notFound();

  const [inspectionData, overview] = await Promise.all([
    getInventoryIntakeInspectionData(access.supabase, vehicle.id),
    getInventoryOverviewIntakeData(access.supabase, access.company.companyId, vehicle.id),
  ]);

  return (
    <div className="space-y-5">
      <InventoryMechanicalInspection vehicle={vehicle} data={inspectionData} overview={overview} />
      <InventoryMechanicalNextStep
        vehicleId={vehicle.id}
        inspectionComplete={inspectionData.mechanicalInspection?.status === "complete"}
      />
    </div>
  );
}
