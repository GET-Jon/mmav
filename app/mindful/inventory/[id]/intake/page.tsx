import { notFound } from "next/navigation";

import { InventoryMechanicalInspection } from "@/components/mindful-inventory/inventory-mechanical-inspection";
import { InventoryMechanicalNextStep } from "@/components/mindful-inventory/inventory-mechanical-next-step";
import { MechanicalInspectorAssignment } from "@/components/mindful-inventory/mechanical-inspector-assignment";
import { getMindfulInventoryAccess } from "@/lib/mindful-inventory/access";
import { getInventoryIntakeInspectionData } from "@/lib/mindful-inventory/intake-inspection";
import { getMechanicalInspectorOptions } from "@/lib/mindful-inventory/mechanical-assignment";
import { getInventoryOverviewIntakeData } from "@/lib/mindful-inventory/overview-intake";
import { getInventoryDashboardData } from "@/lib/mindful-inventory/queries";

export default async function InventoryMechanicalInspectionPage({ params }: { params: Promise<{ id: string }> }) {
  const access = await getMindfulInventoryAccess();
  if (!access) notFound();

  const { id } = await params;
  const dashboard = await getInventoryDashboardData(access.supabase, access.company.companyId);
  const vehicle = dashboard.vehicles.find((item) => item.id === id);
  if (!vehicle) notFound();

  const [inspectionData, overview, inspectorOptions] = await Promise.all([
    getInventoryIntakeInspectionData(access.supabase, vehicle.id),
    getInventoryOverviewIntakeData(access.supabase, access.company.companyId, vehicle.id),
    getMechanicalInspectorOptions(access.supabase, access.company.companyId),
  ]);

  const inspection = inspectionData.mechanicalInspection;
  const partnerInspectionActive = Boolean(
    inspection?.performedByPartnerId && ["assigned", "confirmed", "in_progress", "revision_requested"].includes(inspection.status),
  );

  return (
    <div className="space-y-5">
      <MechanicalInspectorAssignment vehicleId={vehicle.id} options={inspectorOptions} inspection={inspection} />

      {partnerInspectionActive ? (
        <section className="rounded-2xl border border-blue-200 bg-blue-50 px-5 py-5 shadow-sm">
          <div className="text-xs font-black uppercase tracking-[0.1em] text-blue-600">Inspection with partner</div>
          <h2 className="mt-1 text-xl font-black text-slate-950">Waiting for the mechanic to submit</h2>
          <p className="mt-1 text-sm font-medium text-slate-600">Lot Logic findings are locked on the Owner side while the assigned mechanic performs the inspection. When submitted, the findings return here for final Owner validation before Work Plan generation.</p>
        </section>
      ) : (
        <InventoryMechanicalInspection vehicle={vehicle} data={inspectionData} overview={overview} />
      )}

      <InventoryMechanicalNextStep
        vehicleId={vehicle.id}
        inspectionComplete={inspection?.status === "complete"}
      />
    </div>
  );
}
