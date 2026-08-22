"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import type { InventoryCarPlanData } from "@/lib/mindful-inventory/car-plan";
import type { InventoryFindingView } from "@/lib/mindful-inventory/intake-inspection";
import type { InventoryUpgradeView } from "@/lib/mindful-inventory/overview-intake";

function money(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function labelize(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function InventoryWorkPlan({
  vehicleId,
  planningReady,
  plan,
  findings,
  upgrades,
}: {
  vehicleId: string;
  planningReady: boolean;
  plan: InventoryCarPlanData;
  findings: InventoryFindingView[];
  upgrades: InventoryUpgradeView[];
}) {
  const router = useRouter();
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");

  const findingsById = useMemo(() => new Map(findings.map((finding) => [finding.id, finding])), [findings]);
  const upgradesById = useMemo(() => new Map(upgrades.map((upgrade) => [upgrade.id, upgrade])), [upgrades]);
  const investigationCount = plan.draftItems.filter((item) => item.classification === "investigate" || item.managerInvestigationRequired).length;

  async function generatePlan() {
    setWorking(true);
    setMessage("Building Preliminary Work Plan…");
    try {
      const response = await fetch(`/api/mindful/inventory/vehicles/${vehicleId}/work-plan/generate`, { method: "POST" });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Failed to generate Preliminary Work Plan.");
      setMessage("Preliminary Work Plan ready.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to generate Preliminary Work Plan.");
    } finally {
      setWorking(false);
    }
  }

  async function activatePlan() {
    if (!plan.currentDraftVersion) return;
    setWorking(true);
    setMessage("Approving plan and creating Active Work…");
    try {
      const response = await fetch(`/api/mindful/inventory/vehicles/${vehicleId}/work-plan/activate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planVersionId: plan.currentDraftVersion.id }),
      });
      const payload = (await response.json()) as { error?: string; workOrdersCreated?: number };
      if (!response.ok) throw new Error(payload.error || "Failed to activate Work Plan.");
      setMessage(`Work Plan active. ${payload.workOrdersCreated || 0} Work Orders created.`);
      router.push(`/mindful/inventory/${vehicleId}/work`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to activate Work Plan.");
      setWorking(false);
    }
  }

  if (plan.currentApprovedVersion) {
    return (
      <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 shadow-sm">
        <div className="text-xs font-black uppercase tracking-[0.1em] text-emerald-700">Active Work Plan</div>
        <h2 className="mt-1 text-2xl font-black text-slate-950">Work Plan v{plan.currentApprovedVersion.versionNumber} is authorized</h2>
        <p className="mt-2 text-sm font-medium text-slate-600">The approved snapshot is immutable. Execution is now managed through Active Work.</p>
        <button type="button" onClick={() => router.push(`/mindful/inventory/${vehicleId}/work`)} className="mt-5 rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white">Open Active Work →</button>
      </section>
    );
  }

  if (!plan.currentDraftVersion) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">Work Plan</div>
        <h2 className="mt-1 text-2xl font-black text-slate-950">Preliminary Work Plan</h2>
        <p className="mt-2 max-w-3xl text-sm font-medium text-slate-500">Lot Logic turns the completed Intake and Mechanical evidence into a traceable proposed scope before anything becomes authorized work.</p>
        {!planningReady ? (
          <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-900">Complete Overview / Intake and Mechanical Inspection first.</div>
        ) : (
          <button disabled={working} type="button" onClick={generatePlan} className="mt-5 rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white disabled:opacity-50">{working ? "Building Work Plan…" : "Build Preliminary Work Plan"}</button>
        )}
        {message ? <div className="mt-3 text-sm font-bold text-slate-600">{message}</div> : null}
      </section>
    );
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">Preliminary Work Plan</div>
            <h2 className="mt-1 text-2xl font-black text-slate-950">Review what we intend to do</h2>
            <p className="mt-2 max-w-3xl text-sm font-medium leading-6 text-slate-500">Generated from Lot Logic issues, Intake, requested upgrades, and the completed Mechanical Inspection. This is still proposed scope until you activate it.</p>
            {plan.currentDraftVersion.aiSummary ? <p className="mt-3 max-w-4xl text-sm font-semibold text-slate-700">{plan.currentDraftVersion.aiSummary}</p> : null}
          </div>
          <div className="grid min-w-[300px] grid-cols-3 gap-2">
            <div className="rounded-xl bg-slate-50 px-3 py-3"><div className="text-[10px] font-black uppercase text-slate-400">Version</div><div className="mt-1 text-lg font-black">v{plan.currentDraftVersion.versionNumber}</div></div>
            <div className="rounded-xl bg-slate-50 px-3 py-3"><div className="text-[10px] font-black uppercase text-slate-400">Items</div><div className="mt-1 text-lg font-black">{plan.draftItems.length}</div></div>
            <div className="rounded-xl bg-slate-950 px-3 py-3 text-white"><div className="text-[10px] font-black uppercase text-slate-400">Plan</div><div className="mt-1 text-lg font-black">{money(plan.currentDraftVersion.planningTotal)}</div></div>
          </div>
        </div>

        {investigationCount > 0 ? (
          <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
            {investigationCount} item{investigationCount === 1 ? "" : "s"} include investigation or uncertainty. Activating the plan authorizes those as diagnostic/investigative work—not as permission to perform an unknown downstream repair without a later change approval.
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="space-y-3">
          {plan.draftItems.map((item) => {
            const sourceFindings = item.findingIds.map((id) => findingsById.get(id)).filter(Boolean);
            const sourceUpgrade = item.upgradeId ? upgradesById.get(item.upgradeId) : null;
            return (
              <details key={item.id} className="rounded-2xl border border-slate-200" open={plan.draftItems.length <= 5}>
                <summary className="flex cursor-pointer list-none flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-slate-700">{labelize(item.classification)}</span>
                      {item.managerInvestigationRequired ? <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-amber-800">Needs investigation</span> : null}
                      {sourceUpgrade ? <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-blue-700">Owner upgrade</span> : null}
                    </div>
                    <h3 className="mt-2 font-black text-slate-950">{item.title}</h3>
                  </div>
                  <div className="text-left sm:text-right"><div className="text-[10px] font-black uppercase text-slate-400">Planning amount</div><div className="mt-1 text-lg font-black text-slate-950">{money(item.planningAmount)}</div></div>
                </summary>
                <div className="border-t border-slate-100 px-4 py-4">
                  {item.description ? <p className="text-sm leading-6 text-slate-600">{item.description}</p> : null}
                  {item.rationale ? <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm font-semibold text-slate-600"><strong>Why:</strong> {item.rationale}</div> : null}
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div><div className="text-[10px] font-black uppercase text-slate-400">Estimate</div><div className="mt-1 font-bold text-slate-700">{money(item.estimatedCostLow)}–{money(item.estimatedCostHigh)}</div></div>
                    <div><div className="text-[10px] font-black uppercase text-slate-400">Time</div><div className="mt-1 font-bold text-slate-700">{item.estimatedDurationHours === null ? "—" : `${item.estimatedDurationHours} hr`}</div></div>
                    <div><div className="text-[10px] font-black uppercase text-slate-400">Cost basis</div><div className="mt-1 font-bold text-slate-700">{labelize(item.costSource)}</div></div>
                    <div><div className="text-[10px] font-black uppercase text-slate-400">Priority</div><div className="mt-1 font-bold text-slate-700">{item.priority}</div></div>
                  </div>
                  {(sourceFindings.length > 0 || sourceUpgrade) ? (
                    <div className="mt-4 border-t border-slate-100 pt-4">
                      <div className="text-[10px] font-black uppercase text-slate-400">Source evidence</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {sourceFindings.map((finding) => <span key={finding!.id} className="rounded-full border border-slate-200 px-2.5 py-1 text-xs font-bold text-slate-600">{finding!.title}</span>)}
                        {sourceUpgrade ? <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">Upgrade: {sourceUpgrade.title}</span> : null}
                      </div>
                    </div>
                  ) : null}
                </div>
              </details>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-300 bg-slate-50 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">Authorization Boundary</div>
            <h3 className="mt-1 text-lg font-black text-slate-950">Ready to put this plan into motion?</h3>
            <p className="mt-1 max-w-3xl text-sm font-medium text-slate-500">Approve & Activate freezes this version as the authorized Work Plan and creates planned Work Orders. Later discoveries will require a versioned change rather than rewriting this snapshot.</p>
            {message ? <div className="mt-2 text-sm font-bold text-slate-700">{message}</div> : null}
          </div>
          <button disabled={working || plan.draftItems.length === 0} type="button" onClick={activatePlan} className="shrink-0 rounded-xl bg-slate-950 px-6 py-3 text-sm font-black text-white disabled:bg-slate-300">{working ? "Activating…" : "Approve & Activate →"}</button>
        </div>
      </section>
    </div>
  );
}
