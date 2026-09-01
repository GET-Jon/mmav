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
  const partnerFlowStatus = Boolean(
    inspection?.performedByPartnerId && ["assigned", "confirmed", "in_progress", "revision_requested", "submitted"].includes(inspection.status),
  );
  const submittedForOwner = Boolean(inspection?.performedByPartnerId && inspection.status === "submitted");

  return (
    <div className="space-y-5">
      <MechanicalInspectorAssignment vehicleId={vehicle.id} options={inspectorOptions} inspection={inspection} />

      {submittedForOwner ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">Inspection Findings</div>
          <h2 className="mt-1 text-xl font-black text-slate-950">Review what the mechanic submitted</h2>
          <p className="mt-1 text-sm text-slate-500">This is the final Owner validation checkpoint. If any finding is unclear or incorrect, request a revision above. Accepting the inspection completes Mechanical but does not assign any repair work.</p>
          <div className="mt-4 space-y-3">
            {inspectionData.findings.filter((finding) => finding.status === "open").map((finding) => (
              <div key={finding.id} className="rounded-xl border border-slate-200 px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div><div className="font-black text-slate-900">{finding.title}</div>{finding.description ? <div className="mt-1 text-sm text-slate-600">{finding.description}</div> : null}</div>
                  <div className="flex flex-wrap gap-2"><span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black uppercase text-slate-500">{finding.source}</span><span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-black uppercase text-blue-700">{finding.mechanicalValidationStatus.replaceAll("_", " ")}</span></div>
                </div>
                {finding.mechanicalValidationNotes ? <div className="mt-2 text-sm font-semibold text-slate-500">Mechanic notes: {finding.mechanicalValidationNotes}</div> : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {partnerFlowStatus ? (
        !submittedForOwner ? <section className="rounded-2xl border border-blue-200 bg-blue-50 px-5 py-5 shadow-sm">
          <div className="text-xs font-black uppercase tracking-[0.1em] text-blue-600">Inspection with partner</div>
          <h2 className="mt-1 text-xl font-black text-slate-950">Waiting for the mechanic to submit</h2>
          <p className="mt-1 text-sm font-medium text-slate-600">Lot Logic findings are locked on the Owner side while the assigned mechanic performs the inspection. When submitted, the findings return here for final Owner validation before Work Plan generation.</p>
        </section> : null
      ) : (
        <InventoryMechanicalInspection vehicle={vehicle} data={inspectionData} overview={overview} />
      )}

      <InventoryMechanicalNextStep vehicleId={vehicle.id} inspectionComplete={inspection?.status === "complete"} />
    </div>
  );
}
