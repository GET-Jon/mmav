import { notFound } from "next/navigation";

import { InventoryVehicleShell } from "@/components/mindful-inventory/inventory-vehicle-shell";
import { AppTopNav } from "@/components/navigation/app-top-nav";
import { getMindfulInventoryAccess } from "@/lib/mindful-inventory/access";
import { getInventoryDashboardData } from "@/lib/mindful-inventory/queries";

export const dynamic = "force-dynamic";

export default async function InventoryVehicleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const access = await getMindfulInventoryAccess();
  if (!access) notFound();

  const { id } = await params;
  const data = await getInventoryDashboardData(access.supabase, access.company.companyId);
  const vehicle = data.vehicles.find((item) => item.id === id);
  if (!vehicle) notFound();

  return (
    <main className="min-h-screen bg-[#f5f7fb] text-slate-950">
      <AppTopNav active="inventory" userEmail={access.userEmail} />
      <InventoryVehicleShell vehicle={vehicle}>{children}</InventoryVehicleShell>
    </main>
  );
}
