import { notFound } from "next/navigation";

import { InventoryCarPlan } from "@/components/mindful-inventory/inventory-car-plan";
import { getMindfulInventoryAccess } from "@/lib/mindful-inventory/access";
import { getInventoryCarPlanData } from "@/lib/mindful-inventory/car-plan";
import { getInventoryIntakeInspectionData } from "@/lib/mindful-inventory/intake-inspection";
import { getInventoryDashboardData } from "@/lib/mindful-inventory/queries";

export default async function InventoryCarPlanPage({ params }: { params: Promise<{ id: string }> }) {
  const access = await getMindfulInventoryAccess();
  if (!access) notFound();

  const { id } = await params;
  const data = await getInventoryDashboardData(access.supabase, access.company.companyId);
  const vehicle = data.vehicles.find((item) => item.id === id);
  if (!vehicle) notFound();

  const [intakeInspection, carPlan] = await Promise.all([
    getInventoryIntakeInspectionData(access.supabase, vehicle.id),
    getInventoryCarPlanData(access.supabase, vehicle.id),
  ]);

  return (
    <InventoryCarPlan
      vehicleId={vehicle.id}
      planningReady={intakeInspection.planningReady}
      plan={carPlan}
      findings={intakeInspection.findings}
    />
  );
}
