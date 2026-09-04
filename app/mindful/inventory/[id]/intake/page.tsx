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
import { getInventoryPerformerOptions } from "@/lib/mindful-inventory/performers";
import { getInventoryDashboardData } from "@/lib/mindful-inventory/queries";

export default async function InventoryMechanicalInspectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mode?: string }>;
}) {
  const access = await getMindfulInventoryAccess();
  if (!access) notFound();

  const [{ id }, query] = await Promise.all([params, searchParams]);
  const ownerInspectionMode = query.mode === "owner";
  const dashboard = await getInventoryDashboardData(access.supabase, access.company.companyId);
  const vehicle = dashboard.vehicles.find((item) => item.id === id);
  if (!vehicle) notFound();

  const [inspectionData, overview, inspectorOptions, performerOptions] = await Promise.all([
    getInventoryIntakeInspectionData(access.supabase, vehicle.id),
    getInventoryOverviewIntakeData(access.supabase, access.company.companyId, vehicle.id),
    getMechanicalInspectorOptions(access.supabase, access.company.companyId),
    getInventoryPerformerOptions(access.supabase, access.company.companyId),
  ]);

  const inspection = inspectionData.mechanicalInspection;
  const partnerFlowStatus = Boolean(
    inspection?.performedByPartnerId && ["assigned", "confirmed", "in_progress", "revision_requested", "submitted"].includes(inspection.status),
  );
  const submittedForOwner = Boolean(inspection?.performedByPartnerId && inspection.status === "submitted");
  const submittedFindings = inspectionData.findings.filter((finding) => finding.status === "open" || finding.mechanicalOwnerReviewStatus === "dismissed");
  const pendingFindingReviews = submittedFindings.filter((finding) => finding.status === "open" && (!finding.mechanicalOwnerReviewStatus || finding.mechanicalOwnerReviewStatus === "clarification_requested")).length;
  const pendingUpgradeReviews = overview.upgrades.filter((upgrade) => upgrade.status === "proposed" && upgrade.mechanicalValidationStatus === "pending").length;
  const ownerReviewPartners = performerOptions
    .filter((option) => option.type === "partner")
    .map((option) => ({ id: option.id, displayName: option.displayName, secondaryLabel: option.secondaryLabel }));

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
      {!ownerInspectionMode && !submittedForOwner && partnerFlowStatus ? inspectorAssignment : null}

      {submittedForOwner ? (
        <>
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">Inspection Findings</div>
            <h2 className="mt-1 text-xl font-black text-slate-950">Review the mechanic&apos;s findings</h2>
            <p className="mt-1 max-w-3xl text-sm text-slate-500">Resolve the open findings below. If the inspector cannot perform the work, choose who should handle it before moving on.</p>
            <MechanicalOwnerFindingReview
              vehicleId={vehicle.id}
              findings={submittedFindings}
              partnerOptions={ownerReviewPartners}
              inspectorPartnerId={inspection?.performedByPartnerId || null}
            />
          </section>
          <MechanicalOwnerUpgradeReview upgrades={overview.upgrades} />
          {inspectorAssignment}
        </>
      ) : null}

      {partnerFlowStatus ? (
        !submittedForOwner ? <section className="rounded-2xl border border-blue-200 bg-blue-50 px-5 py-5 shadow-sm">
          <div className="text-xs font-black uppercase tracking-[0.1em] text-blue-600">Inspection with partner</div>
          <h2 className="mt-1 text-xl font-black text-slate-950">Waiting for the mechanic to submit</h2>
          <p className="mt-1 text-sm font-medium text-slate-600">The inspection scope is locked on the Owner side while the assigned mechanic performs the inspection. Their findings return here for final Owner review.</p>
        </section> : null
      ) : ownerInspectionMode ? (
        <InventoryMechanicalInspection vehicle={vehicle} data={inspectionData} overview={overview} />
      ) : (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
          <h2 className="text-lg font-black text-slate-950">Mechanical inspector not selected</h2>
          <p className="mt-1 text-sm font-medium text-slate-600">Return to Intake and select an inspector, or explicitly choose Owner mechanical inspection.</p>
          <a href={`/mindful/inventory/${vehicle.id}`} className="mt-4 inline-flex rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white">Back to Intake</a>
        </section>
      )}

      {(partnerFlowStatus || ownerInspectionMode || inspection?.status === "complete") ? <InventoryMechanicalNextStep
        vehicleId={vehicle.id}
        inspectionComplete={inspection?.status === "complete"}
        planningReady={inspectionData.planningReady}
      /> : null}
    </div>
  );
}
