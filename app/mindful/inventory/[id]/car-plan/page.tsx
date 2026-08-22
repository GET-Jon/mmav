import { notFound } from "next/navigation";

import { InventoryWorkPlan } from "@/components/mindful-inventory/inventory-work-plan";
import { getMindfulInventoryAccess } from "@/lib/mindful-inventory/access";
import { getInventoryCarPlanData } from "@/lib/mindful-inventory/car-plan";
import { getInventoryIntakeInspectionData } from "@/lib/mindful-inventory/intake-inspection";
import { getInventoryOverviewIntakeData } from "@/lib/mindful-inventory/overview-intake";
import { getInventoryDashboardData } from "@/lib/mindful-inventory/queries";

export default async function InventoryCarPlanPage({ params }: { params: Promise<{ id: string }> }) {
  const access = await getMindfulInventoryAccess();
  if (!access) notFound();

  const { id } = await params;
  const data = await getInventoryDashboardData(access.supabase, access.company.companyId);
  const vehicle = data.vehicles.find((item) => item.id === id);
  if (!vehicle) notFound();

  const [intakeInspection, carPlan, overview] = await Promise.all([
    getInventoryIntakeInspectionData(access.supabase, vehicle.id),
    getInventoryCarPlanData(access.supabase, vehicle.id),
    getInventoryOverviewIntakeData(access.supabase, access.company.companyId, vehicle.id),
  ]);

  return (
    <InventoryWorkPlan
      vehicleId={vehicle.id}
      planningReady={intakeInspection.planningReady}
      plan={carPlan}
      findings={intakeInspection.findings}
      upgrades={overview.upgrades}
    />
  );
}
