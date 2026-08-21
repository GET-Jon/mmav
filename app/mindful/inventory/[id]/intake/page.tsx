import { notFound } from "next/navigation";

import { InventoryIntakeInspection } from "@/components/mindful-inventory/inventory-intake-inspection";
import { getMindfulInventoryAccess } from "@/lib/mindful-inventory/access";
import { getInventoryIntakeInspectionData } from "@/lib/mindful-inventory/intake-inspection";
import { getInventoryDashboardData } from "@/lib/mindful-inventory/queries";

export default async function InventoryIntakePage({ params }: { params: Promise<{ id: string }> }) {
  const access = await getMindfulInventoryAccess();
  if (!access) notFound();

  const { id } = await params;
  const data = await getInventoryDashboardData(access.supabase, access.company.companyId);
  const vehicle = data.vehicles.find((item) => item.id === id);
  if (!vehicle) notFound();

  const intakeInspection = await getInventoryIntakeInspectionData(access.supabase, vehicle.id);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-slate-950 px-5 py-4 text-white shadow-sm">
        <div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">Assessment</div>
        <h2 className="mt-1 text-xl font-black">Intake & Inspection</h2>
        <p className="mt-1 text-sm font-medium text-slate-300">Capture purchaser intake, mechanical inspection, and observational Findings before planning begins.</p>
      </div>
      <InventoryIntakeInspection vehicleId={vehicle.id} data={intakeInspection} />
    </div>
  );
}
