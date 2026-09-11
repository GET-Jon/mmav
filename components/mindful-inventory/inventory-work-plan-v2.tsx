"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import type {
  InventoryCarPlanData,
  InventoryPlanItemCostSource,
  InventoryPlanItemDecision,
  InventoryPlanItemView,
} from "@/lib/mindful-inventory/car-plan";
import type { InventoryFindingView } from "@/lib/mindful-inventory/intake-inspection";
import type { InventoryUpgradeView } from "@/lib/mindful-inventory/overview-intake";
import type { InventoryPerformerOption } from "@/lib/mindful-inventory/performers";

// WORK_PLAN_SETUP_V2: upstream Owner decisions carry forward; this screen only resolves remaining setup.

function money(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function hours(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return `${Math.round(value * 10) / 10} hr`;
}

function labelize(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function numberOrNull(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none transition focus:border-slate-500";

export function InventoryWorkPlanV2({
  vehicleId,
  planningReady,
  plan,
  findings,
  upgrades,
  performers,
  partsReview,
}: {
  vehicleId: string;
  planningReady: boolean;
  plan: InventoryCarPlanData;
  findings: InventoryFindingView[];
  upgrades: InventoryUpgradeView[];
  performers: InventoryPerformerOption[];
  partsReview?: React.ReactNode;
}) {
  const router = useRouter();
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState<InventoryPlanItemView | null>(null);
  const [planningAmount, setPlanningAmount] = useState("");
  const [estimateLow, setEstimateLow] = useState("");
  const [estimateHigh, setEstimateHigh] = useState("");
  const [costSource, setCostSource] = useState<InventoryPlanItemCostSource>("unknown");
  const [costDetail, setCostDetail] = useState("");
  const [partnerSaving, setPartnerSaving] = useState<string | null>(null);
  const [changingDecision, setChangingDecision] = useState<Record<string, boolean>>({});

  const findingsById = useMemo(
    () => new Map(findings.map((finding) => [finding.id, finding])),
    [findings],
  );
  const upgradesById = useMemo(
    () => new Map(upgrades.map((upgrade) => [upgrade.id, upgrade])),
    [upgrades],
  );
  const performerById = useMemo(
    () => new Map(performers.map((performer) => [performer.id, performer])),
    [performers],
  );
  const partnerOptions = performers.filter((performer) => performer.type === "partner");

  const includedItems = plan.draftItems.filter((item) => item.decision === "approved");
  const unresolvedItems = plan.draftItems.filter(
    (item) => item.decision === "suggested" || item.decision === "investigate",
  );
  const deferredItems = plan.draftItems.filter(
    (item) => item.decision === "declined" || item.decision === "monitor",
  );
  const includedLaborHours = includedItems.reduce(
    (sum, item) => sum + (item.estimatedLaborHours || 0),
    0,
  );
  const quotePending = includedItems.filter(
    (item) =>
      item.costSource === "unknown" ||
      item.costSource === "ai_estimate" ||
      item.planningAmount <= 0,
  ).length;

  async function generatePlan() {
    setWorking(true);
    setMessage("Building Work Plan…");
    try {
      const response = await fetch(
        `/api/mindful/inventory/vehicles/${vehicleId}/work-plan/generate`,
        { method: "POST" },
      );
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Failed to build Work Plan.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to build Work Plan.");
    } finally {
      setWorking(false);
    }
  }

  async function activatePlan() {
    if (!plan.currentDraftVersion) return;
    setWorking(true);
    setMessage("Creating Active Work…");
    try {
      const response = await fetch(
        `/api/mindful/inventory/vehicles/${vehicleId}/work-plan/activate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ planVersionId: plan.currentDraftVersion.id }),
        },
      );
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Failed to create Active Work.");
      router.push(`/mindful/inventory/${vehicleId}/work`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to create Active Work.");
      setWorking(false);
    }
  }

  async function quickDecision(
    item: InventoryPlanItemView,
    nextDecision: InventoryPlanItemDecision,
  ) {
    setWorking(true);
    setMessage("");
    try {
      const response = await fetch(
        `/api/mindful/inventory/vehicles/${vehicleId}/car-plan/items`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            itemId: item.id,
            title: item.title,
            description: item.description || "",
            category: item.category,
            classification: item.classification,
            decision: nextDecision,
            priority: item.priority,
            planningAmount: item.planningAmount,
            estimatedCostLow: item.estimatedCostLow,
            estimatedCostHigh: item.estimatedCostHigh,
            estimatedLaborHours: item.estimatedLaborHours,
            estimatedElapsedHours:
              item.estimatedElapsedHours ?? item.estimatedDurationHours,
            rationale: item.rationale || "",
            costSource: item.costSource,
            costSourceDetail: item.costSourceDetail || "",
            managerInvestigationRequired:
              nextDecision === "investigate" ? true : item.managerInvestigationRequired,
            declineReason:
              nextDecision === "declined"
                ? item.declineReason || "Deferred after prior authorization"
                : "",
          }),
        },
      );
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Failed to update Work Plan item.");
      setChangingDecision((current) => ({ ...current, [item.id]: false }));
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to update Work Plan item.");
    } finally {
      setWorking(false);
    }
  }

  async function updatePartner(
    item: InventoryPlanItemView,
    suggestedPartnerId: string | null,
  ) {
    setPartnerSaving(item.id);
    setMessage("");
    try {
      const response = await fetch(
        `/api/mindful/inventory/vehicles/${vehicleId}/work-plan/item-routing`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itemId: item.id, suggestedPartnerId }),
        },
      );
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not update partner.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update partner.");
    } finally {
      setPartnerSaving(null);
    }
  }

  function openEdit(item: InventoryPlanItemView) {
    setEditing(item);
    setPlanningAmount(String(item.planningAmount ?? ""));
    setEstimateLow(item.estimatedCostLow == null ? "" : String(item.estimatedCostLow));
    setEstimateHigh(item.estimatedCostHigh == null ? "" : String(item.estimatedCostHigh));
    setCostSource(item.costSource);
    setCostDetail(item.costSource === "unknown" ? "" : item.costSourceDetail || "");
  }

  async function saveCost() {
    if (!editing) return;
    setWorking(true);
    setMessage("");
    try {
      const response = await fetch(
        `/api/mindful/inventory/vehicles/${vehicleId}/car-plan/items`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            itemId: editing.id,
            title: editing.title,
            description: editing.description || "",
            category: editing.category,
            classification: editing.classification,
            decision: editing.decision,
            priority: editing.priority,
            planningAmount: numberOrNull(planningAmount),
            estimatedCostLow: numberOrNull(estimateLow),
            estimatedCostHigh: numberOrNull(estimateHigh),
            estimatedLaborHours: editing.estimatedLaborHours,
            estimatedElapsedHours:
              editing.estimatedElapsedHours ?? editing.estimatedDurationHours,
            rationale: editing.rationale || "",
            costSource,
            costSourceDetail:
              costDetail.trim() ||
              (costSource === "unknown" ? editing.costSourceDetail || "" : ""),
            managerInvestigationRequired: editing.managerInvestigationRequired,
            declineReason: editing.declineReason || "",
          }),
        },
      );
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not save pricing details.");
      setEditing(null);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save pricing details.");
    } finally {
      setWorking(false);
    }
  }

  if (plan.currentApprovedVersion) {
    return (
      <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 shadow-sm">
        <div className="text-xs font-black uppercase tracking-[0.1em] text-emerald-700">
          Active Work Plan
        </div>
        <h2 className="mt-1 text-2xl font-black text-slate-950">
          Work Plan v{plan.currentApprovedVersion.versionNumber} is active
        </h2>
        <p className="mt-2 text-sm font-medium text-slate-600">
          Execution, quotes, Partner coordination, parts, and scheduling continue in Active Work.
        </p>
        <button
          type="button"
          onClick={() => router.push(`/mindful/inventory/${vehicleId}/work`)}
          className="mt-5 rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white"
        >
          Open Active Work →
        </button>
      </section>
    );
  }

  if (!plan.currentDraftVersion) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">
          Work Plan Setup
        </div>
        <h2 className="mt-1 text-2xl font-black text-slate-950">Assemble Work Plan</h2>
        {!planningReady ? (
          <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-900">
            Complete Overview / Intake and accept the Mechanical Inspection first.
          </div>
        ) : (
          <button
            disabled={working}
            type="button"
            onClick={generatePlan}
            className="mt-5 rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white disabled:opacity-50"
          >
            {working ? "Building Work Plan…" : "Assemble Work Plan"}
          </button>
        )}
      </section>
    );
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">
              Work Plan Setup
            </div>
            <h2 className="mt-1 text-xl font-black text-slate-950">Finalize the executable plan</h2>
            <p className="mt-1.5 max-w-4xl text-sm font-semibold text-slate-600">
              Approved repairs and upgrades carry forward automatically. Resolve only the execution details Lot Logic still needs.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700">
              {includedItems.length} approved item{includedItems.length === 1 ? "" : "s"}
            </span>
            <span className="rounded-xl bg-slate-50 px-3 py-2 text-xs font-black text-slate-700">
              {hours(includedLaborHours)} planned labor
            </span>
            {unresolvedItems.length ? (
              <span className="rounded-xl bg-amber-100 px-3 py-2 text-xs font-black text-amber-900">
                {unresolvedItems.length} scope decision{unresolvedItems.length === 1 ? "" : "s"} needed
              </span>
            ) : quotePending ? (
              <span className="rounded-xl bg-slate-50 px-3 py-2 text-xs font-black text-slate-600">
                {quotePending} final quote{quotePending === 1 ? "" : "s"} later
              </span>
            ) : (
              <span className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700">
                Scope ready ✓
              </span>
            )}
          </div>
        </div>
        {message ? <div className="mt-3 text-sm font-bold text-slate-600">{message}</div> : null}
      </section>

      {unresolvedItems.length ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50/20 p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.1em] text-amber-700">
                Needs your decision
              </div>
              <h3 className="mt-1 font-black text-slate-950">Resolve new or changed scope</h3>
              <p className="mt-1 text-sm text-slate-600">
                These items were not already authorized upstream, so Lot Logic needs an explicit Include or Defer decision.
              </p>
            </div>
            <span className="rounded-full bg-amber-100 px-3 py-1.5 text-xs font-black text-amber-900">
              {unresolvedItems.length}
            </span>
          </div>
          <div className="mt-4 space-y-2.5">
            {unresolvedItems.map((item) => {
              const sourceUpgrade = item.upgradeId ? upgradesById.get(item.upgradeId) : null;
              return (
                <article key={item.id} className="rounded-xl border border-amber-200 bg-white p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="font-black text-slate-950">{item.title}</h4>
                        {sourceUpgrade ? (
                          <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-black uppercase text-blue-700">
                            Upgrade
                          </span>
                        ) : null}
                      </div>
                      {item.description ? (
                        <p className="mt-1 text-sm text-slate-600">{item.description}</p>
                      ) : null}
                      <div className="mt-1 text-xs font-semibold text-slate-500">
                        {hours(item.estimatedLaborHours)} labor · {money(item.planningAmount)} planning amount
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button
                        disabled={working}
                        type="button"
                        onClick={() => void quickDecision(item, "approved")}
                        className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-black text-white disabled:opacity-40"
                      >
                        Include
                      </button>
                      <button
                        disabled={working}
                        type="button"
                        onClick={() => void quickDecision(item, "declined")}
                        className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-black text-slate-600 disabled:opacity-40"
                      >
                        Defer
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.1em] text-emerald-700">
              Approved Scope
            </div>
            <h3 className="mt-1 font-black text-slate-950">Already authorized</h3>
            <p className="mt-1 text-sm text-slate-500">
              These decisions came from Intake and Mechanical Review. You do not need to approve them again.
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-600">
            v{plan.currentDraftVersion.versionNumber}
          </span>
        </div>

        <div className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-200">
          {includedItems.map((item) => {
            const sourceFindings = item.findingIds
              .map((id) => findingsById.get(id))
              .filter(Boolean);
            const sourceUpgrade = item.upgradeId ? upgradesById.get(item.upgradeId) : null;
            const partner = item.suggestedPartnerId
              ? performerById.get(item.suggestedPartnerId)
              : null;
            const quoteRequired =
              item.costSource === "unknown" ||
              item.costSource === "ai_estimate" ||
              item.planningAmount <= 0;
            const changing = Boolean(changingDecision[item.id]);

            return (
              <article key={item.id} className="px-4 py-3.5">
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_190px] lg:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-emerald-600">✓</span>
                      <h4 className="font-black text-slate-950">{item.title}</h4>
                      {sourceUpgrade ? (
                        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[9px] font-black uppercase text-blue-700">
                          Upgrade
                        </span>
                      ) : (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-black uppercase text-emerald-700">
                          Authorized
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-xs font-semibold text-slate-500">
                      <span>{hours(item.estimatedLaborHours)} labor</span>
                      <span>·</span>
                      <span>{money(item.planningAmount)}{quoteRequired ? " planning amount" : " authorized / quoted"}</span>
                      {sourceFindings.length ? (
                        <><span>·</span><span>Based on {sourceFindings.map((finding) => finding!.title).join(", ")}</span></>
                      ) : null}
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-400">
                      Performer
                    </div>
                    <select
                      disabled={partnerSaving === item.id}
                      value={item.suggestedPartnerId || ""}
                      onChange={(event) => void updatePartner(item, event.target.value || null)}
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-black text-slate-800 outline-none"
                    >
                      <option value="">Assign later in Active Work</option>
                      {partnerOptions.map((option) => (
                        <option key={option.id} value={option.id}>{option.displayName}</option>
                      ))}
                    </select>
                    {partner ? null : (
                      <div className="mt-1 text-[10px] font-semibold text-slate-400">Optional at this stage</div>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-3 lg:justify-end">
                    <button
                      type="button"
                      onClick={() => openEdit(item)}
                      className="text-xs font-bold text-slate-500 hover:text-slate-900"
                    >
                      {quoteRequired ? "Pricing details" : "View pricing"}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setChangingDecision((current) => ({ ...current, [item.id]: !changing }))
                      }
                      className="text-xs font-black text-slate-500 hover:text-slate-900"
                    >
                      {changing ? "Cancel" : "Change decision"}
                    </button>
                  </div>
                </div>
                {changing ? (
                  <div className="mt-3 flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
                    <span className="mr-auto text-xs font-semibold text-slate-500">
                      This changes a decision that was already authorized upstream.
                    </span>
                    <button
                      disabled={working}
                      type="button"
                      onClick={() => void quickDecision(item, "declined")}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-black text-slate-700 disabled:opacity-40"
                    >
                      Defer this work
                    </button>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>

      {partsReview}

      {deferredItems.length ? (
        <details className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <summary className="cursor-pointer font-black text-slate-800">
            Deferred / Monitor ({deferredItems.length})
          </summary>
          <div className="mt-4 space-y-2">
            {deferredItems.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-4 py-3"
              >
                <span className="font-black text-slate-700">{item.title}</span>
                <button
                  type="button"
                  onClick={() => void quickDecision(item, "approved")}
                  className="rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs font-black text-emerald-700"
                >
                  Restore to plan
                </button>
              </div>
            ))}
          </div>
        </details>
      ) : null}

      <section className="rounded-2xl border border-slate-300 bg-slate-50 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">
              Finalize Work Plan
            </div>
            <h3 className="mt-1 text-lg font-black text-slate-950">
              {includedItems.length} approved item{includedItems.length === 1 ? "" : "s"}
              {unresolvedItems.length
                ? ` · ${unresolvedItems.length} scope decision${unresolvedItems.length === 1 ? "" : "s"} remaining`
                : " · ready to create Active Work"}
            </h3>
            <p className="mt-1 max-w-3xl text-sm font-medium text-slate-500">
              Creating Active Work turns the authorized scope into Work Orders. Quotes, unresolved sourcing, locations, and scheduling can continue there.
            </p>
          </div>
          <button
            disabled={working || includedItems.length === 0 || unresolvedItems.length > 0}
            type="button"
            onClick={activatePlan}
            className="shrink-0 rounded-xl bg-slate-950 px-6 py-3 text-sm font-black text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {working
              ? "Creating Active Work…"
              : unresolvedItems.length
                ? `Resolve ${unresolvedItems.length} scope decision${unresolvedItems.length === 1 ? "" : "s"}`
                : "Create Active Work →"}
          </button>
        </div>
      </section>

      {editing ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setEditing(null);
          }}
        >
          <div className="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">
                  Pricing details
                </div>
                <h3 className="mt-1 text-xl font-black text-slate-950">{editing.title}</h3>
              </div>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-black text-slate-600"
              >
                Close
              </button>
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label>
                <div className="mb-1 text-xs font-black uppercase text-slate-500">Authorized / quoted total</div>
                <input
                  className={inputClass}
                  inputMode="decimal"
                  value={planningAmount}
                  onChange={(event) => setPlanningAmount(event.target.value)}
                  placeholder="Total amount when sufficiently known"
                />
              </label>
              <label>
                <div className="mb-1 text-xs font-black uppercase text-slate-500">Cost basis</div>
                <select
                  className={inputClass}
                  value={costSource}
                  onChange={(event) => setCostSource(event.target.value as InventoryPlanItemCostSource)}
                >
                  <option value="unknown">Unknown / quote needed</option>
                  <option value="known_quote">Known quote</option>
                  <option value="historical_actual">Historical actual</option>
                  <option value="catalog_parts_cost">Catalog / parts cost</option>
                  <option value="comparable_vehicle">Comparable vehicle</option>
                  <option value="ai_estimate">AI estimate</option>
                </select>
              </label>
              <label>
                <div className="mb-1 text-xs font-black uppercase text-slate-500">Estimate low</div>
                <input className={inputClass} inputMode="decimal" value={estimateLow} onChange={(event) => setEstimateLow(event.target.value)} />
              </label>
              <label>
                <div className="mb-1 text-xs font-black uppercase text-slate-500">Estimate high</div>
                <input className={inputClass} inputMode="decimal" value={estimateHigh} onChange={(event) => setEstimateHigh(event.target.value)} />
              </label>
              <label className="sm:col-span-2">
                <div className="mb-1 text-xs font-black uppercase text-slate-500">Formal quote / pricing detail</div>
                <input
                  className={inputClass}
                  value={costDetail}
                  onChange={(event) => setCostDetail(event.target.value)}
                  placeholder="Partner quote, quote reference, or manager pricing context"
                />
              </label>
            </div>
            <div className="mt-5 flex justify-end">
              <button
                disabled={working}
                type="button"
                onClick={() => void saveCost()}
                className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white disabled:opacity-50"
              >
                Save Pricing Details
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
