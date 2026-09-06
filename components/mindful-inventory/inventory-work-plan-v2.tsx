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

function money(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
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

const inputClass = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none transition focus:border-slate-500";

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

  const findingsById = useMemo(() => new Map(findings.map((finding) => [finding.id, finding])), [findings]);
  const upgradesById = useMemo(() => new Map(upgrades.map((upgrade) => [upgrade.id, upgrade])), [upgrades]);
  const performerById = useMemo(() => new Map(performers.map((performer) => [performer.id, performer])), [performers]);
  const partnerOptions = performers.filter((performer) => performer.type === "partner");
  const activeItems = plan.draftItems.filter((item) => item.decision !== "declined" && item.decision !== "monitor");
  const deferredItems = plan.draftItems.filter((item) => item.decision === "declined" || item.decision === "monitor");
  const laborTotal = activeItems.reduce((sum, item) => sum + (item.estimatedLaborHours || 0), 0);
  const investigationCount = activeItems.filter((item) => item.classification === "investigate" || item.decision === "investigate" || item.managerInvestigationRequired).length;
  const quotePending = activeItems.filter((item) => item.costSource === "unknown" || item.planningAmount <= 0).length;
  const pricedTotal = activeItems.reduce((sum, item) => sum + ((item.costSource === "unknown" || item.planningAmount <= 0) ? 0 : item.planningAmount), 0);

  async function generatePlan() {
    setWorking(true); setMessage("Building Work Plan…");
    try {
      const response = await fetch(`/api/mindful/inventory/vehicles/${vehicleId}/work-plan/generate`, { method: "POST" });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Failed to build Work Plan.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to build Work Plan.");
    } finally { setWorking(false); }
  }

  async function activatePlan() {
    if (!plan.currentDraftVersion) return;
    setWorking(true); setMessage("Creating Active Work…");
    try {
      const response = await fetch(`/api/mindful/inventory/vehicles/${vehicleId}/work-plan/activate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planVersionId: plan.currentDraftVersion.id }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Failed to create Active Work.");
      router.push(`/mindful/inventory/${vehicleId}/work`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to create Active Work.");
      setWorking(false);
    }
  }

  async function quickDecision(item: InventoryPlanItemView, nextDecision: InventoryPlanItemDecision) {
    setWorking(true); setMessage("");
    try {
      const response = await fetch(`/api/mindful/inventory/vehicles/${vehicleId}/car-plan/items`, {
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
          estimatedElapsedHours: item.estimatedElapsedHours ?? item.estimatedDurationHours,
          rationale: item.rationale || "",
          costSource: item.costSource,
          costSourceDetail: item.costSourceDetail || "",
          managerInvestigationRequired: nextDecision === "investigate" ? true : item.managerInvestigationRequired,
          declineReason: nextDecision === "declined" ? (item.declineReason || "Deferred during manager approval") : "",
        }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Failed to update Work Plan item.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to update Work Plan item.");
    } finally { setWorking(false); }
  }

  async function updatePartner(item: InventoryPlanItemView, suggestedPartnerId: string | null) {
    setPartnerSaving(item.id); setMessage("");
    try {
      const response = await fetch(`/api/mindful/inventory/vehicles/${vehicleId}/work-plan/item-routing`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id, suggestedPartnerId }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not update partner.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update partner.");
    } finally { setPartnerSaving(null); }
  }

  function openEdit(item: InventoryPlanItemView) {
    setEditing(item);
    setPlanningAmount(String(item.planningAmount ?? ""));
    setEstimateLow(item.estimatedCostLow == null ? "" : String(item.estimatedCostLow));
    setEstimateHigh(item.estimatedCostHigh == null ? "" : String(item.estimatedCostHigh));
    setCostSource(item.costSource);
    setCostDetail(item.costSourceDetail || "");
  }

  async function saveCost() {
    if (!editing) return;
    setWorking(true); setMessage("");
    try {
      const response = await fetch(`/api/mindful/inventory/vehicles/${vehicleId}/car-plan/items`, {
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
          estimatedElapsedHours: editing.estimatedElapsedHours ?? editing.estimatedDurationHours,
          rationale: editing.rationale || "",
          costSource,
          costSourceDetail: costDetail,
          managerInvestigationRequired: editing.managerInvestigationRequired,
          declineReason: editing.declineReason || "",
        }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not save cost details.");
      setEditing(null);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save cost details.");
    } finally { setWorking(false); }
  }

  if (plan.currentApprovedVersion) {
    return <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 shadow-sm">
      <div className="text-xs font-black uppercase tracking-[0.1em] text-emerald-700">Active Work Plan</div>
      <h2 className="mt-1 text-2xl font-black text-slate-950">Work Plan v{plan.currentApprovedVersion.versionNumber} is authorized</h2>
      <p className="mt-2 text-sm font-medium text-slate-600">Execution, quotes, partner confirmation, parts, and scheduling now continue in Active Work.</p>
      <button type="button" onClick={() => router.push(`/mindful/inventory/${vehicleId}/work`)} className="mt-5 rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white">Open Active Work →</button>
    </section>;
  }

  if (!plan.currentDraftVersion) {
    return <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">Build Work Plan</div>
      <h2 className="mt-1 text-2xl font-black text-slate-950">Build Work Plan</h2>
      {!planningReady ? <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-900">Complete Overview / Intake and Mechanical Inspection first.</div> : <button disabled={working} type="button" onClick={generatePlan} className="mt-5 rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white disabled:opacity-50">{working ? "Building Work Plan…" : "Build Work Plan"}</button>}
    </section>;
  }

  return <div className="space-y-5">
    <section className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">Build Work Plan</div>
          <h2 className="mt-1 text-xl font-black text-slate-950">Final manager approval</h2>
          {plan.currentDraftVersion.aiSummary ? <p className="mt-1.5 max-w-4xl text-sm font-semibold text-slate-600">{plan.currentDraftVersion.aiSummary}</p> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-xl bg-slate-50 px-3 py-2 text-xs font-black text-slate-700">{activeItems.length} included</span>
          <span className="rounded-xl bg-slate-50 px-3 py-2 text-xs font-black text-slate-700">{hours(laborTotal)} labor</span>
          <span className={`rounded-xl px-3 py-2 text-xs font-black ${quotePending ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-800"}`}>{quotePending ? `${quotePending} quote${quotePending === 1 ? "" : "s"} pending` : `${money(pricedTotal)} priced`}</span>
        </div>
      </div>
      {message ? <div className="mt-3 text-sm font-bold text-slate-600">{message}</div> : null}
    </section>

    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-black text-slate-950">Approval Review</h3>
          <p className="mt-1 text-sm text-slate-500">Confirm the scope and the next authorization for each item.</p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-600">v{plan.currentDraftVersion.versionNumber}</span>
      </div>

      <div className="mt-4 space-y-3">
        {activeItems.map((item) => {
          const sourceFindings = item.findingIds.map((id) => findingsById.get(id)).filter(Boolean);
          const sourceUpgrade = item.upgradeId ? upgradesById.get(item.upgradeId) : null;
          const partner = item.suggestedPartnerId ? performerById.get(item.suggestedPartnerId) : null;
          const quoteRequired = item.costSource === "unknown" || item.planningAmount <= 0;
          const investigation = item.classification === "investigate" || item.decision === "investigate" || item.managerInvestigationRequired;
          return <article key={item.id} className={`rounded-xl border p-4 ${quoteRequired || !partner ? "border-amber-200 bg-amber-50/30" : "border-slate-200 bg-white"}`}>
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_220px_220px_auto] xl:items-center">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="font-black text-slate-950">{item.title}</h4>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase text-slate-700">{labelize(item.classification)}</span>
                  {sourceUpgrade ? <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-black uppercase text-blue-700">Upgrade</span> : null}
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-bold text-slate-500">
                  <span>{hours(item.estimatedLaborHours)} labor</span>
                  <span>Priority {item.priority}</span>
                </div>
                {item.description ? <p className="mt-2 text-sm text-slate-600">{item.description}</p> : null}
                {sourceFindings.length ? <div className="mt-2 text-xs font-semibold text-slate-400">Based on: {sourceFindings.map((finding) => finding!.title).join(" · ")}</div> : null}
              </div>

              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-400">Partner</div>
                <select disabled={partnerSaving === item.id} value={item.suggestedPartnerId || ""} onChange={(e) => void updatePartner(item, e.target.value || null)} className={`mt-1 w-full rounded-lg border px-2.5 py-2 text-xs font-black outline-none ${partner ? "border-slate-200 bg-white text-slate-800" : "border-amber-300 bg-amber-50 text-amber-900"}`}>
                  <option value="">Assign in Active Work</option>
                  {partnerOptions.map((option) => <option key={option.id} value={option.id}>{option.displayName}</option>)}
                </select>
              </div>

              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-400">Next authorization</div>
                <div className={`mt-1 text-sm font-black ${quoteRequired ? "text-amber-800" : "text-emerald-700"}`}>
                  {quoteRequired ? (investigation ? "Authorize diagnosis / quote" : "Quote required before repair") : `${money(item.planningAmount)} repair authorization`}
                </div>
                <button type="button" onClick={() => openEdit(item)} className="mt-1 cursor-pointer text-xs font-black text-slate-600 underline decoration-slate-300 underline-offset-2 hover:text-slate-950">{quoteRequired ? "Add / update quote" : "Review cost"}</button>
              </div>

              <div className="flex flex-wrap gap-2 xl:justify-end">
                {item.decision !== "approved" ? <button disabled={working} type="button" onClick={() => void quickDecision(item, "approved")} className="cursor-pointer rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700 hover:bg-emerald-100">Include</button> : <span className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700">Included ✓</span>}
                <button disabled={working} type="button" onClick={() => void quickDecision(item, "declined")} className="cursor-pointer rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600 hover:bg-slate-50">Defer</button>
              </div>
            </div>
          </article>;
        })}
      </div>
    </section>

    {partsReview}

    {deferredItems.length ? <details className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <summary className="cursor-pointer font-black text-slate-800">Deferred / Monitor ({deferredItems.length})</summary>
      <div className="mt-4 space-y-2">{deferredItems.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-4 py-3"><span className="font-black text-slate-700">{item.title}</span><button type="button" onClick={() => void quickDecision(item, "approved")} className="cursor-pointer rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs font-black text-emerald-700">Include</button></div>)}</div>
    </details> : null}

    <section className="rounded-2xl border border-slate-300 bg-slate-50 p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">Final Authorization</div>
          <h3 className="mt-1 text-lg font-black text-slate-950">{activeItems.length} items · {money(pricedTotal)} authorized now{quotePending ? ` · ${quotePending} quote${quotePending === 1 ? "" : "s"} pending` : ""}</h3>
          <p className="mt-1 max-w-3xl text-sm font-medium text-slate-500">Approval creates the next executable work. Quote-only or diagnostic items can move forward without authorizing unknown downstream repair.</p>
        </div>
        <button disabled={working || activeItems.length === 0} type="button" onClick={activatePlan} className="shrink-0 cursor-pointer rounded-xl bg-slate-950 px-6 py-3 text-sm font-black text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300">{working ? "Creating Active Work…" : "Approve & Create Active Work →"}</button>
      </div>
    </section>

    {editing ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setEditing(null); }}>
      <div className="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-3"><div><div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">Cost & quote</div><h3 className="mt-1 text-xl font-black text-slate-950">{editing.title}</h3></div><button type="button" onClick={() => setEditing(null)} className="cursor-pointer rounded-xl border border-slate-200 px-3 py-2 text-sm font-black text-slate-600">Close</button></div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label><div className="mb-1 text-xs font-black uppercase text-slate-500">Planning amount</div><input className={inputClass} inputMode="decimal" value={planningAmount} onChange={(e) => setPlanningAmount(e.target.value)} /></label>
          <label><div className="mb-1 text-xs font-black uppercase text-slate-500">Cost basis</div><select className={inputClass} value={costSource} onChange={(e) => setCostSource(e.target.value as InventoryPlanItemCostSource)}><option value="unknown">Unknown / quote needed</option><option value="known_quote">Known quote</option><option value="historical_actual">Historical actual</option><option value="catalog_parts_cost">Catalog / parts cost</option><option value="comparable_vehicle">Comparable vehicle</option><option value="ai_estimate">AI estimate</option></select></label>
          <label><div className="mb-1 text-xs font-black uppercase text-slate-500">Estimate low</div><input className={inputClass} inputMode="decimal" value={estimateLow} onChange={(e) => setEstimateLow(e.target.value)} /></label>
          <label><div className="mb-1 text-xs font-black uppercase text-slate-500">Estimate high</div><input className={inputClass} inputMode="decimal" value={estimateHigh} onChange={(e) => setEstimateHigh(e.target.value)} /></label>
          <label className="sm:col-span-2"><div className="mb-1 text-xs font-black uppercase text-slate-500">Quote / cost detail</div><input className={inputClass} value={costDetail} onChange={(e) => setCostDetail(e.target.value)} placeholder="Partner, quote reference, or pricing context" /></label>
        </div>
        <div className="mt-5 flex justify-end"><button disabled={working} type="button" onClick={() => void saveCost()} className="cursor-pointer rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white disabled:opacity-50">Save Cost Details</button></div>
      </div>
    </div> : null}
  </div>;
}
