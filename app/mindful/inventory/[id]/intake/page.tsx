import { notFound } from "next/navigation";

import { InventoryMechanicalInspection } from "@/components/mindful-inventory/inventory-mechanical-inspection";
import { InventoryMechanicalNextStep } from "@/components/mindful-inventory/inventory-mechanical-next-step";
import { MechanicalInspectorAssignment } from "@/components/mindful-inventory/mechanical-inspector-assignment";
import { MechanicalOwnerFindingReview } from "@/components/mindful-inventory/mechanical-owner-finding-review";
import { MechanicalOwnerUpgradeReview } from "@/components/mindful-inventory/mechanical-owner-upgrade-review";
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
  const submittedFindings = inspectionData.findings.filter((finding) => finding.status === "open" || finding.mechanicalOwnerReviewStatus === "dismissed");
  const pendingFindingReviews = submittedFindings.filter((finding) => finding.status === "open" && (!finding.mechanicalOwnerReviewStatus || finding.mechanicalOwnerReviewStatus === "clarification_requested")).length;
  const pendingUpgradeReviews = overview.upgrades.filter((upgrade) => upgrade.status === "proposed" && upgrade.mechanicalValidationStatus === "pending").length;

  const inspectorAssignment = (
    <MechanicalInspectorAssignment
      vehicleId={vehicle.id}
      options={inspectorOptions}
      inspection={inspection}
      pendingFindingReviews={pendingFindingReviews}
      pendingUpgradeReviews={pendingUpgradeReviews}
    />
  );

  return (
    <div className="space-y-5">
      {!submittedForOwner ? inspectorAssignment : null}

      {submittedForOwner ? (
        <>
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">Inspection Findings</div>
            <h2 className="mt-1 text-xl font-black text-slate-950">Validate the mechanic&apos;s findings</h2>
            <p className="mt-1 text-sm text-slate-500">Accept, request clarification, or dismiss each finding before accepting the inspection. Accepting the diagnosis does not assign the resulting repair to the inspector.</p>
            <MechanicalOwnerFindingReview vehicleId={vehicle.id} findings={submittedFindings} />
          </section>
          <MechanicalOwnerUpgradeReview upgrades={overview.upgrades} />
          {inspectorAssignment}
        </>
      ) : null}

      {partnerFlowStatus ? (
        !submittedForOwner ? <section className="rounded-2xl border border-blue-200 bg-blue-50 px-5 py-5 shadow-sm">
          <div className="text-xs font-black uppercase tracking-[0.1em] text-blue-600">Inspection with partner</div>
          <h2 className="mt-1 text-xl font-black text-slate-950">Waiting for the mechanic to submit</h2>
          <p className="mt-1 text-sm font-medium text-slate-600">Lot Logic findings and requested upgrades are locked on the Owner side while the assigned mechanic performs the inspection. When submitted, both return here for final Owner review before Work Plan generation.</p>
        </section> : null
      ) : (
        <InventoryMechanicalInspection vehicle={vehicle} data={inspectionData} overview={overview} />
      )}

      <InventoryMechanicalNextStep vehicleId={vehicle.id} inspectionComplete={inspection?.status === "complete"} />
    </div>
  );
}
