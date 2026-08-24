"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import type {
  InventoryCarPlanData,
  InventoryPlanItemClassification,
  InventoryPlanItemCostSource,
  InventoryPlanItemDecision,
  InventoryPlanItemView,
} from "@/lib/mindful-inventory/car-plan";
import type { InventoryFindingView } from "@/lib/mindful-inventory/intake-inspection";
import type { InventoryUpgradeView } from "@/lib/mindful-inventory/overview-intake";

const inputClass = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none transition focus:border-slate-500";

function money(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function labelize(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function hourLabel(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return `${Math.round(value * 10) / 10} hr`;
}

function numberOrNull(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <div className="mb-1.5 text-xs font-black uppercase tracking-[0.08em] text-slate-500">{children}</div>;
}

const classifications: Array<{ value: InventoryPlanItemClassification; label: string }> = [
  { value: "required", label: "Required" },
  { value: "recommended", label: "Recommended" },
  { value: "optional", label: "Optional" },
  { value: "upgrade", label: "Upgrade" },
  { value: "investigate", label: "Investigate" },
];

const decisions: Array<{ value: InventoryPlanItemDecision; label: string }> = [
  { value: "approved", label: "Include in Plan" },
  { value: "investigate", label: "Investigate First" },
  { value: "monitor", label: "Monitor / No Work Now" },
  { value: "declined", label: "Defer / Exclude" },
];

const costSources: Array<{ value: InventoryPlanItemCostSource; label: string }> = [
  { value: "known_quote", label: "Known Quote" },
  { value: "historical_actual", label: "Historical Actual" },
  { value: "catalog_parts_cost", label: "Catalog / Parts Cost" },
  { value: "comparable_vehicle", label: "Comparable Vehicle" },
  { value: "ai_estimate", label: "AI Estimate" },
  { value: "unknown", label: "Unknown / Investigate" },
];

export function InventoryWorkPlan({ vehicleId, planningReady, plan, findings, upgrades }: {
  vehicleId: string;
  planningReady: boolean;
  plan: InventoryCarPlanData;
  findings: InventoryFindingView[];
  upgrades: InventoryUpgradeView[];
}) {
  const router = useRouter();
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [editingItem, setEditingItem] = useState<InventoryPlanItemView | null>(null);
  const [addingItem, setAddingItem] = useState(false);
  const [savingItem, setSavingItem] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("mechanical");
  const [classification, setClassification] = useState<InventoryPlanItemClassification>("recommended");
  const [decision, setDecision] = useState<InventoryPlanItemDecision>("approved");
  const [priority, setPriority] = useState<"1" | "2" | "3">("2");
  const [planningAmount, setPlanningAmount] = useState("");
  const [estimatedCostLow, setEstimatedCostLow] = useState("");
  const [estimatedCostHigh, setEstimatedCostHigh] = useState("");
  const [laborHours, setLaborHours] = useState("");
  const [turnaroundHours, setTurnaroundHours] = useState("");
  const [rationale, setRationale] = useState("");
  const [costSource, setCostSource] = useState<InventoryPlanItemCostSource>("unknown");
  const [costSourceDetail, setCostSourceDetail] = useState("");
  const [investigationRequired, setInvestigationRequired] = useState(false);
  const [deferReason, setDeferReason] = useState("");

  const findingsById = useMemo(() => new Map(findings.map((finding) => [finding.id, finding])), [findings]);
  const upgradesById = useMemo(() => new Map(upgrades.map((upgrade) => [upgrade.id, upgrade])), [upgrades]);
  const activeItems = plan.draftItems.filter((item) => item.decision !== "declined" && item.decision !== "monitor");
  const deferredItems = plan.draftItems.filter((item) => item.decision === "declined" || item.decision === "monitor");
  const investigationCount = activeItems.filter((item) => item.classification === "investigate" || item.managerInvestigationRequired || item.decision === "investigate").length;
  const laborTotal = activeItems.reduce((sum, item) => sum + (item.estimatedLaborHours || 0), 0);
  const maxTurnaround = activeItems.reduce((max, item) => Math.max(max, item.estimatedElapsedHours ?? item.estimatedDurationHours ?? 0), 0);

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
      router.push(`/mindful/inventory/${vehicleId}/work`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to activate Work Plan.");
      setWorking(false);
    }
  }

  function resetEditor() {
    setEditingItem(null);
    setAddingItem(false);
    setTitle(""); setDescription(""); setCategory("mechanical"); setClassification("recommended"); setDecision("approved");
    setPriority("2"); setPlanningAmount(""); setEstimatedCostLow(""); setEstimatedCostHigh(""); setLaborHours(""); setTurnaroundHours("");
    setRationale(""); setCostSource("unknown"); setCostSourceDetail(""); setInvestigationRequired(false); setDeferReason("");
  }

  function openEdit(item: InventoryPlanItemView) {
    setEditingItem(item); setAddingItem(false);
    setTitle(item.title); setDescription(item.description || ""); setCategory(item.category); setClassification(item.classification); setDecision(item.decision);
    setPriority(item.priority); setPlanningAmount(String(item.planningAmount ?? "")); setEstimatedCostLow(item.estimatedCostLow === null ? "" : String(item.estimatedCostLow));
    setEstimatedCostHigh(item.estimatedCostHigh === null ? "" : String(item.estimatedCostHigh)); setLaborHours(item.estimatedLaborHours === null ? "" : String(item.estimatedLaborHours));
    setTurnaroundHours(item.estimatedElapsedHours === null ? (item.estimatedDurationHours === null ? "" : String(item.estimatedDurationHours)) : String(item.estimatedElapsedHours));
    setRationale(item.rationale || ""); setCostSource(item.costSource); setCostSourceDetail(item.costSourceDetail || ""); setInvestigationRequired(item.managerInvestigationRequired); setDeferReason(item.declineReason || "");
  }

  function openAdd() {
    resetEditor();
    setAddingItem(true);
    setDecision("approved");
  }

  async function savePlanItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingItem(true);
    setMessage("");
    try {
      const response = await fetch(`/api/mindful/inventory/vehicles/${vehicleId}/car-plan/items`, {
        method: editingItem ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId: editingItem?.id,
          title,
          description,
          category,
          classification,
          decision,
          priority,
          planningAmount: numberOrNull(planningAmount),
          estimatedCostLow: numberOrNull(estimatedCostLow),
          estimatedCostHigh: numberOrNull(estimatedCostHigh),
          estimatedLaborHours: numberOrNull(laborHours),
          estimatedElapsedHours: numberOrNull(turnaroundHours),
          rationale,
          costSource,
          costSourceDetail,
          managerInvestigationRequired: investigationRequired,
          declineReason: decision === "declined" ? deferReason : "",
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Failed to save Plan Item.");
      resetEditor();
      setMessage(editingItem ? "Plan Item updated." : "Manager Plan Item added.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to save Plan Item.");
    } finally {
      setSavingItem(false);
    }
  }

  if (plan.currentApprovedVersion) {
    return (
      <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 shadow-sm">
        <div className="text-xs font-black uppercase tracking-[0.1em] text-emerald-700">Active Work Plan</div>
        <h2 className="mt-1 text-2xl font-black text-slate-950">Work Plan v{plan.currentApprovedVersion.versionNumber} is authorized</h2>
        <p className="mt-2 text-sm font-medium text-slate-600">The approved snapshot is immutable. Execution and scheduling are now managed through Active Work.</p>
        <button type="button" onClick={() => router.push(`/mindful/inventory/${vehicleId}/work`)} className="mt-5 rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white">Open Active Work →</button>
      </section>
    );
  }

  if (!plan.currentDraftVersion) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">Work Plan</div>
        <h2 className="mt-1 text-2xl font-black text-slate-950">Preliminary Work Plan</h2>
        <p className="mt-2 max-w-3xl text-sm font-medium text-slate-500">Build the proposed scope from Intake, Mechanical, Lot Logic and requested upgrades. Nothing becomes authorized work until you approve the Draft.</p>
        {!planningReady ? <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-900">Complete Overview / Intake and Mechanical Inspection first.</div> : <button disabled={working} type="button" onClick={generatePlan} className="mt-5 rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white disabled:opacity-50">{working ? "Building Work Plan…" : "Build Preliminary Work Plan"}</button>}
      </section>
    );
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">Preliminary Work Plan</div>
            <h2 className="mt-1 text-2xl font-black text-slate-950">Decide what Mindful will actually do</h2>
            <p className="mt-2 max-w-3xl text-sm font-medium leading-6 text-slate-500">Mechanical established what is true. This Draft is the manager decision layer: edit scope, budget and timing; defer work; or add work before authorization.</p>
            {plan.currentDraftVersion.aiSummary ? <p className="mt-3 max-w-4xl text-sm font-semibold text-slate-700">{plan.currentDraftVersion.aiSummary}</p> : null}
          </div>
          <div className="grid min-w-[460px] grid-cols-5 gap-2">
            <div className="rounded-xl bg-slate-50 px-3 py-3"><div className="text-[10px] font-black uppercase text-slate-400">Version</div><div className="mt-1 text-lg font-black">v{plan.currentDraftVersion.versionNumber}</div></div>
            <div className="rounded-xl bg-slate-50 px-3 py-3"><div className="text-[10px] font-black uppercase text-slate-400">Included</div><div className="mt-1 text-lg font-black">{activeItems.length}</div></div>
            <div className="rounded-xl bg-blue-50 px-3 py-3"><div className="text-[10px] font-black uppercase text-blue-500">Labor</div><div className="mt-1 text-lg font-black text-blue-800">{hourLabel(laborTotal)}</div></div>
            <div className="rounded-xl bg-violet-50 px-3 py-3"><div className="text-[10px] font-black uppercase text-violet-500">Longest Job</div><div className="mt-1 text-lg font-black text-violet-800">{hourLabel(maxTurnaround)}</div></div>
            <div className="rounded-xl bg-slate-950 px-3 py-3 text-white"><div className="text-[10px] font-black uppercase text-slate-400">Plan</div><div className="mt-1 text-lg font-black">{money(plan.currentDraftVersion.planningTotal)}</div></div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button type="button" onClick={openAdd} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700">+ Add Manager Work Item</button>
          {investigationCount > 0 ? <span className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-black text-amber-800">{investigationCount} unresolved investigation{investigationCount === 1 ? "" : "s"}</span> : null}
          {deferredItems.length > 0 ? <span className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-600">{deferredItems.length} deferred / monitored</span> : null}
          {message ? <span className="text-sm font-bold text-slate-600">{message}</span> : null}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between"><div><h3 className="font-black text-slate-950">Included Scope</h3><p className="mt-1 text-sm text-slate-500">These items will become authorized work if the plan is activated.</p></div></div>
        <div className="mt-4 space-y-2">
          {activeItems.map((item) => {
            const sourceFindings = item.findingIds.map((id) => findingsById.get(id)).filter(Boolean);
            const sourceUpgrade = item.upgradeId ? upgradesById.get(item.upgradeId) : null;
            const turnaround = item.estimatedElapsedHours ?? item.estimatedDurationHours;
            return (
              <article key={item.id} className="rounded-xl border border-slate-200 px-4 py-3">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase text-slate-700">{labelize(item.classification)}</span>{item.managerInvestigationRequired || item.decision === "investigate" ? <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-black uppercase text-amber-800">Needs investigation</span> : null}{sourceUpgrade ? <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-black uppercase text-blue-700">Owner upgrade</span> : null}<h4 className="font-black text-slate-950">{item.title}</h4></div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-bold text-slate-500"><span>{labelize(item.category)}</span><span>{money(item.planningAmount)}</span><span>Labor {hourLabel(item.estimatedLaborHours)}</span><span>Turnaround {hourLabel(turnaround)}</span><span>Priority {item.priority}</span></div>
                    {item.description ? <p className="mt-2 text-sm text-slate-600">{item.description}</p> : null}
                    {sourceFindings.length > 0 ? <div className="mt-2 text-xs font-semibold text-slate-400">Based on: {sourceFindings.map((finding) => finding!.title).join(" · ")}</div> : null}
                  </div>
                  <button type="button" onClick={() => openEdit(item)} className="shrink-0 rounded-xl border border-slate-200 px-4 py-2 text-sm font-black text-slate-700">Edit</button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {deferredItems.length > 0 ? (
        <details className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <summary className="cursor-pointer font-black text-slate-800">Deferred / Monitor ({deferredItems.length})</summary>
          <div className="mt-4 space-y-2">{deferredItems.map((item) => <div key={item.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3"><div><div className="font-black text-slate-700">{item.title}</div><div className="mt-1 text-xs font-bold text-slate-400">{item.decision === "declined" ? `Deferred${item.declineReason ? ` — ${item.declineReason}` : ""}` : "Monitor / no work now"}</div></div><button type="button" onClick={() => openEdit(item)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700">Edit</button></div>)}</div>
        </details>
      ) : null}

      <section className="rounded-2xl border border-slate-300 bg-slate-50 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div><div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">Authorization Boundary</div><h3 className="mt-1 text-lg font-black text-slate-950">Ready to put this plan into motion?</h3><p className="mt-1 max-w-3xl text-sm font-medium text-slate-500">Approve & Activate freezes this Draft as the authorized baseline and creates Work Orders only from included/approved scope. Later material changes require a new version.</p></div><button disabled={working || activeItems.length === 0} type="button" onClick={activatePlan} className="shrink-0 rounded-xl bg-slate-950 px-6 py-3 text-sm font-black text-white disabled:bg-slate-300">{working ? "Activating…" : "Approve & Activate →"}</button></div>
      </section>

      {(editingItem || addingItem) ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4" role="dialog" aria-modal="true" onMouseDown={(e) => { if (e.target === e.currentTarget) resetEditor(); }}>
          <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-3xl bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-200 bg-white px-6 py-4"><div><div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">Work Plan Editor</div><h3 className="mt-1 text-xl font-black text-slate-950">{editingItem ? "Edit Plan Item" : "Add Manager Work Item"}</h3><p className="mt-1 text-sm text-slate-500">Change the intended scope without altering the underlying Mechanical finding.</p></div><button type="button" onClick={resetEditor} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-black text-slate-600">Close</button></div>
            <form onSubmit={savePlanItem} className="grid gap-4 p-6 md:grid-cols-2 lg:grid-cols-4">
              <label className="md:col-span-2 lg:col-span-3"><FieldLabel>Work Item</FieldLabel><input required className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} /></label>
              <label><FieldLabel>Category</FieldLabel><input className={inputClass} value={category} onChange={(e) => setCategory(e.target.value)} /></label>
              <label><FieldLabel>Classification</FieldLabel><select className={inputClass} value={classification} onChange={(e) => setClassification(e.target.value as InventoryPlanItemClassification)}>{classifications.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}</select></label>
              <label><FieldLabel>Plan Decision</FieldLabel><select className={inputClass} value={decision} onChange={(e) => setDecision(e.target.value as InventoryPlanItemDecision)}>{decisions.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}</select></label>
              <label><FieldLabel>Priority</FieldLabel><select className={inputClass} value={priority} onChange={(e) => setPriority(e.target.value as "1" | "2" | "3")}><option value="1">1 — High</option><option value="2">2 — Normal</option><option value="3">3 — Low</option></select></label>
              <label><FieldLabel>Planning Budget</FieldLabel><input className={inputClass} inputMode="decimal" value={planningAmount} onChange={(e) => setPlanningAmount(e.target.value)} /></label>
              <label><FieldLabel>Estimate Low</FieldLabel><input className={inputClass} inputMode="decimal" value={estimatedCostLow} onChange={(e) => setEstimatedCostLow(e.target.value)} /></label>
              <label><FieldLabel>Estimate High</FieldLabel><input className={inputClass} inputMode="decimal" value={estimatedCostHigh} onChange={(e) => setEstimatedCostHigh(e.target.value)} /></label>
              <label><FieldLabel>Hands-on Labor Hours</FieldLabel><input className={inputClass} inputMode="decimal" value={laborHours} onChange={(e) => setLaborHours(e.target.value)} /></label>
              <label><FieldLabel>Turnaround Hours</FieldLabel><input className={inputClass} inputMode="decimal" value={turnaroundHours} onChange={(e) => setTurnaroundHours(e.target.value)} /></label>
              <label><FieldLabel>Cost Basis</FieldLabel><select className={inputClass} value={costSource} onChange={(e) => setCostSource(e.target.value as InventoryPlanItemCostSource)}>{costSources.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}</select></label>
              <label className="md:col-span-2"><FieldLabel>Cost Basis Detail</FieldLabel><input className={inputClass} value={costSourceDetail} onChange={(e) => setCostSourceDetail(e.target.value)} placeholder="Quote/vendor/source notes" /></label>
              <label className="md:col-span-2 lg:col-span-4"><FieldLabel>Description / Scope</FieldLabel><textarea className={`${inputClass} min-h-20 resize-y`} value={description} onChange={(e) => setDescription(e.target.value)} /></label>
              <label className="md:col-span-2 lg:col-span-4"><FieldLabel>Manager Rationale / Notes</FieldLabel><textarea className={`${inputClass} min-h-20 resize-y`} value={rationale} onChange={(e) => setRationale(e.target.value)} /></label>
              <label className="flex items-center text-sm font-black text-slate-700"><input type="checkbox" className="mr-2 h-4 w-4" checked={investigationRequired} onChange={(e) => setInvestigationRequired(e.target.checked)} />Investigation required before downstream repair</label>
              {decision === "declined" ? <label className="md:col-span-2 lg:col-span-3"><FieldLabel>Why Defer / Exclude?</FieldLabel><input required className={inputClass} value={deferReason} onChange={(e) => setDeferReason(e.target.value)} /></label> : null}
              <div className="md:col-span-2 lg:col-span-4 flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" onClick={resetEditor} className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-black text-slate-700">Cancel</button><button disabled={savingItem} className="rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-black text-white disabled:bg-slate-300">{savingItem ? "Saving…" : editingItem ? "Save Changes" : "Add to Plan"}</button></div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
