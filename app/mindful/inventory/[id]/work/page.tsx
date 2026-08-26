import { notFound } from "next/navigation";

import { InventoryActiveWork } from "@/components/mindful-inventory/inventory-active-work";
import { getMindfulInventoryAccess } from "@/lib/mindful-inventory/access";
import { getInventoryActiveWork, getInventorySchedulingOptions } from "@/lib/mindful-inventory/active-work";
import { getInventoryPerformerOptions } from "@/lib/mindful-inventory/performers";
import { getInventoryDashboardData } from "@/lib/mindful-inventory/queries";

export default async function InventoryWorkPage({ params }: { params: Promise<{ id: string }> }) {
  const access = await getMindfulInventoryAccess();
  if (!access) notFound();

  const { id } = await params;
  const dashboard = await getInventoryDashboardData(access.supabase, access.company.companyId);
  const vehicle = dashboard.vehicles.find((item) => item.id === id);
  if (!vehicle) notFound();

  const [workOrders, performerOptions, schedulingOptions] = await Promise.all([
    getInventoryActiveWork(access.supabase, vehicle.id),
    getInventoryPerformerOptions(access.supabase, access.company.companyId),
    getInventorySchedulingOptions(access.supabase, access.company.companyId),
  ]);

  return (
    <InventoryActiveWork
      vehicleId={vehicle.id}
      vehicle={{
        year: vehicle.year,
        make: vehicle.make,
        model: vehicle.model,
        trim: vehicle.trim,
        vin: vehicle.vin,
        stockNumber: vehicle.stockNumber,
      }}
      workOrders={workOrders}
      performerOptions={performerOptions}
      locationOptions={schedulingOptions.locations}
      resourceOptions={schedulingOptions.resources}
    />
  );
}
