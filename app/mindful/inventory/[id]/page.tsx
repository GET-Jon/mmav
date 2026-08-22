import { notFound } from "next/navigation";

import { InventoryOverviewIntake } from "@/components/mindful-inventory/inventory-overview-intake";
import { getMindfulInventoryAccess } from "@/lib/mindful-inventory/access";
import { getInventoryIntakeInspectionData } from "@/lib/mindful-inventory/intake-inspection";
import { getInventoryOverviewIntakeData } from "@/lib/mindful-inventory/overview-intake";
import { getInventoryDashboardData } from "@/lib/mindful-inventory/queries";

export default async function MindfulInventoryVehiclePage({ params }: { params: Promise<{ id: string }> }) {
  const access = await getMindfulInventoryAccess();
  if (!access) notFound();

  const { id } = await params;
  const data = await getInventoryDashboardData(access.supabase, access.company.companyId);
  const vehicle = data.vehicles.find((item) => item.id === id);
  if (!vehicle) notFound();

  const [overview, intakeData] = await Promise.all([
    getInventoryOverviewIntakeData(access.supabase, access.company.companyId, vehicle.id),
    getInventoryIntakeInspectionData(access.supabase, vehicle.id),
  ]);

  return <InventoryOverviewIntake vehicle={vehicle} overview={overview} intakeData={intakeData} />;
}
