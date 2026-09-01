import { notFound } from "next/navigation";

import { InventoryDetailing } from "@/components/mindful-inventory/inventory-detailing";
import { getMindfulInventoryAccess } from "@/lib/mindful-inventory/access";
import { getInventoryDetailingData } from "@/lib/mindful-inventory/detailing";
import { getInventoryDashboardData } from "@/lib/mindful-inventory/queries";

export default async function InventoryDetailingPage({ params }: { params: Promise<{ id: string }> }) {
  const access = await getMindfulInventoryAccess();
  if (!access) notFound();

  const { id } = await params;
  const dashboard = await getInventoryDashboardData(access.supabase, access.company.companyId);
  const vehicle = dashboard.vehicles.find((item) => item.id === id);
  if (!vehicle) notFound();

  const data = await getInventoryDetailingData(access.supabase, access.company.companyId, vehicle.id);
  return <InventoryDetailing detailing={data.detailing} performers={data.performers} />;
}
