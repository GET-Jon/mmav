"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import type {
  InventoryCarPlanData,
  InventoryPlanItemClassification,
  InventoryPlanItemCostSource,
  InventoryPlanItemDecision,
} from "@/lib/mindful-inventory/car-plan";
import type { InventoryFindingView } from "@/lib/mindful-inventory/intake-inspection";

type Props = {
  vehicleId: string;
  planningReady: boolean;
  plan: InventoryCarPlanData;
  findings: InventoryFindingView[];
};

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none transition focus:border-slate-500";

const classifications: Array<{ value: InventoryPlanItemClassification; label: string }> = [
  { value: "required", label: "Required" },
  { value: "recommended", label: "Recommended" },
  { value: "optional", label: "Optional" },
  { value: "upgrade", label: "Upgrade" },
  { value: "investigate", label: "Investigate" },
];

const decisions: Array<{ value: InventoryPlanItemDecision; label: string }> = [
  { value: "approved", label: "Approved" },
  { value: "declined", label: "Declined" },
  { value: "investigate", label: "Investigate" },
  { value: "monitor", label: "Monitor" },
];

const costSources: Array<{ value: InventoryPlanItemCostSource; label: string }> = [
  { value: "known_quote", label: "Known Quote" },
  { value: "historical_actual", label: "Historical Actual" },
  { value: "catalog_parts_cost", label: "Catalog / Parts Cost" },
  { value: "comparable_vehicle", label: "Comparable Vehicle" },
  { value: "ai_estimate", label: "AI Estimate" },
  { value: "unknown", label: "Unknown / Investigate" },
];

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1.5 text-xs font-black uppercase tracking-[0.08em] text-slate-500">
      {children}
    </div>
  );
}

function money(value: number | null) {
  if (value === null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function labelize(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function numberOrNull(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function InventoryCarPlan({ vehicleId, planningReady, plan, findings }: Props) {
  const router = useRouter();
  const [creatingDraft, setCreatingDraft] = useState(false);
  const [savingItem, setSavingItem] = useState(false);
  const [status, setStatus] = useState("");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("mechanical");
  const [classification, setClassification] =
    useState<InventoryPlanItemClassification>("recommended");
  const [decision, setDecision] = useState<InventoryPlanItemDecision>("investigate");
  const [priority, setPriority] = useState<"1" | "2" | "3">("2");
  const [rationale, setRationale] = useState("");
  const [estimatedCostLow, setEstimatedCostLow] = useState("");
  const [estimatedCostHigh, setEstimatedCostHigh] = useState("");
  const [planningAmount, setPlanningAmount] = useState("");
  const [estimatedDurationHours, setEstimatedDurationHours] = useState("");
  const [confidence, setConfidence] = useState("");
  const [costSource, setCostSource] = useState<InventoryPlanItemCostSource>("unknown");
  const [costSourceDetail, setCostSourceDetail] = useState("");
  const [managerInvestigationRequired, setManagerInvestigationRequired] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [findingIds, setFindingIds] = useState<string[]>([]);

  const openFindings = useMemo(
    () => findings.filter((finding) => finding.status === "open"),
    [findings],
  );
  const findingsById = useMemo(
    () => new Map(findings.map((finding) => [finding.id, finding])),
    [findings],
  );

  const linkedFindingIds = useMemo(
    () => new Set(plan.draftItems.flatMap((item) => item.findingIds)),
    [plan.draftItems],
  );

  async function createDraft() {
    setCreatingDraft(true);
    setStatus("");
    try {
      const response = await fetch(`/api/mindful/inventory/vehicles/${vehicleId}/car-plan`, {
        method: "POST",
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Failed to create Draft Car Plan.");
      setStatus("Draft Car Plan ready.");
      router.refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to create Draft Car Plan.");
    } finally {
      setCreatingDraft(false);
    }
  }

  function toggleFinding(findingId: string) {
    setFindingIds((current) =>
      current.includes(findingId)
        ? current.filter((id) => id !== findingId)
        : [...current, findingId],
    );
  }

  function useFinding(finding: InventoryFindingView) {
    setFindingIds((current) =>
      current.includes(finding.id) ? current : [...current, finding.id],
    );
    if (!title) setTitle(finding.title);
    if (!description && finding.description) setDescription(finding.description);
    setCategory(finding.category || "other");
    if (!estimatedCostLow && finding.estimatedCostLow !== null) {
      setEstimatedCostLow(String(finding.estimatedCostLow));
    }
    if (!estimatedCostHigh && finding.estimatedCostHigh !== null) {
      setEstimatedCostHigh(String(finding.estimatedCostHigh));
    }
    if (!estimatedDurationHours && finding.estimatedDurationHours !== null) {
      setEstimatedDurationHours(String(finding.estimatedDurationHours));
    }
  }

  async function addPlanItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingItem(true);
    setStatus("");

    try {
      const response = await fetch(
        `/api/mindful/inventory/vehicles/${vehicleId}/car-plan/items`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            description,
            category,
            classification,
            decision,
            priority,
            rationale,
            estimatedCostLow: numberOrNull(estimatedCostLow),
            estimatedCostHigh: numberOrNull(estimatedCostHigh),
            planningAmount: numberOrNull(planningAmount),
            estimatedDurationHours: numberOrNull(estimatedDurationHours),
            confidence: numberOrNull(confidence),
            costSource,
            costSourceDetail,
            managerInvestigationRequired,
            declineReason,
            findingIds,
          }),
        },
      );

      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Failed to add Plan Item.");

      setTitle("");
      setDescription("");
      setRationale("");
      setEstimatedCostLow("");
      setEstimatedCostHigh("");
      setPlanningAmount("");
      setEstimatedDurationHours("");
      setConfidence("");
      setCostSource("unknown");
      setCostSourceDetail("");
      setManagerInvestigationRequired(false);
      setDeclineReason("");
      setFindingIds([]);
      setStatus("Plan Item added to Draft.");
      router.refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to add Plan Item.");
    } finally {
      setSavingItem(false);
    }
  }

  return (
    <section id="car-plan" className="space-y-6 scroll-mt-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.12em] text-slate-400">
              Car Plan
            </div>
            <h2 className="mt-2 text-2xl font-black tracking-[-0.025em] text-slate-950">
              Manager planning workspace
            </h2>
            <p className="mt-2 max-w-3xl text-sm font-medium leading-6 text-slate-500">
              Findings are observations. This Draft determines what should be investigated,
              approved, declined, monitored, or recommended. Creating a Plan Item does not
              create a Work Order.
            </p>
          </div>

          {plan.currentDraftVersion ? (
            <div className="grid min-w-[280px] grid-cols-3 gap-2">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                <div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">Version</div>
                <div className="mt-1 text-lg font-black">v{plan.currentDraftVersion.versionNumber}</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                <div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">Status</div>
                <div className="mt-1 text-sm font-black">Draft</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                <div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">Plan</div>
                <div className="mt-1 text-lg font-black">{money(plan.currentDraftVersion.planningTotal)}</div>
              </div>
            </div>
          ) : null}
        </div>

        {!planningReady ? (
          <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm font-semibold text-amber-900">
            A Draft Car Plan cannot be created until purchaser Intake and the Mechanical Inspection are both complete.
          </div>
        ) : null}

        {planningReady && !plan.currentDraftVersion && plan.versions.length === 0 ? (
          <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="font-black text-slate-900">Ready to plan</div>
              <div className="mt-1 text-sm font-medium text-slate-500">
                Intake and Mechanical Inspection are complete. Create the baseline Draft v1.
              </div>
            </div>
            <button
              type="button"
              disabled={creatingDraft}
              onClick={createDraft}
              className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50"
            >
              {creatingDraft ? "Creating…" : "Create Draft Car Plan"}
            </button>
          </div>
        ) : null}

        {!plan.currentDraftVersion && plan.versions.length > 0 ? (
          <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-600">
            This vehicle has Car Plan history but no editable Draft. Revision workflow will be enabled in the approval/versioning slice.
          </div>
        ) : null}

        {status ? (
          <div className="mt-4 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700">
            {status}
          </div>
        ) : null}
      </div>

      {plan.currentDraftVersion ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(420px,0.8fr)]">
          <div className="space-y-6">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-base font-black text-slate-950">Draft Plan Items</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    {plan.draftItems.length} structured decision{plan.draftItems.length === 1 ? "" : "s"} in Draft v{plan.currentDraftVersion.versionNumber}.
                  </p>
                </div>
                <div className="rounded-xl bg-slate-950 px-3 py-2 text-sm font-black text-white">
                  {money(plan.currentDraftVersion.planningTotal)} planned
                </div>
              </div>

              <div className="mt-5 space-y-3">
                {plan.draftItems.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300 p-5 text-sm font-semibold text-slate-500">
                    No Plan Items yet. Use the manager form to translate Findings into explicit planning decisions.
                  </div>
                ) : (
                  plan.draftItems.map((item) => (
                    <article key={item.id} className="rounded-2xl border border-slate-200 p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <div className="flex flex-wrap gap-2">
                            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.06em] text-slate-700">
                              {labelize(item.classification)}
                            </span>
                            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.06em] text-slate-700">
                              {labelize(item.decision)}
                            </span>
                            {item.managerInvestigationRequired ? (
                              <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.06em] text-amber-800">
                                Manager investigation
                              </span>
                            ) : null}
                          </div>
                          <h4 className="mt-3 text-base font-black text-slate-950">{item.title}</h4>
                          {item.description ? <p className="mt-1 text-sm leading-6 text-slate-600">{item.description}</p> : null}
                        </div>
                        <div className="text-right">
                          <div className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-400">Planning amount</div>
                          <div className="mt-1 text-lg font-black text-slate-950">{money(item.planningAmount)}</div>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-3 sm:grid-cols-3">
                        <div className="rounded-xl bg-slate-50 px-3 py-2.5 text-sm">
                          <div className="text-[10px] font-black uppercase text-slate-400">Estimate</div>
                          <div className="mt-1 font-bold text-slate-700">{money(item.estimatedCostLow)} – {money(item.estimatedCostHigh)}</div>
                        </div>
                        <div className="rounded-xl bg-slate-50 px-3 py-2.5 text-sm">
                          <div className="text-[10px] font-black uppercase text-slate-400">Cost source</div>
                          <div className="mt-1 font-bold text-slate-700">{labelize(item.costSource)}</div>
                        </div>
                        <div className="rounded-xl bg-slate-50 px-3 py-2.5 text-sm">
                          <div className="text-[10px] font-black uppercase text-slate-400">Confidence</div>
                          <div className="mt-1 font-bold text-slate-700">{item.confidence === null ? "—" : `${Math.round(item.confidence * 100)}%`}</div>
                        </div>
                      </div>

                      {item.rationale ? (
                        <div className="mt-4 text-sm leading-6 text-slate-600">
                          <span className="font-black text-slate-800">Rationale: </span>{item.rationale}
                        </div>
                      ) : null}

                      {item.findingIds.length > 0 ? (
                        <div className="mt-4 border-t border-slate-100 pt-3">
                          <div className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-400">Linked Findings</div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {item.findingIds.map((findingId) => {
                              const finding = findingsById.get(findingId);
                              return (
                                <span key={findingId} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700">
                                  {finding?.title || findingId}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      ) : null}
                    </article>
                  ))
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-base font-black text-slate-950">Open Findings</h3>
              <p className="mt-1 text-sm text-slate-500">Observations available to inform the Draft. They remain Findings until a manager makes a planning decision.</p>
              <div className="mt-4 space-y-2">
                {openFindings.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300 p-4 text-sm font-semibold text-slate-500">No open Findings.</div>
                ) : (
                  openFindings.map((finding) => (
                    <button
                      type="button"
                      key={finding.id}
                      onClick={() => useFinding(finding)}
                      className="w-full rounded-xl border border-slate-200 p-3 text-left transition hover:border-slate-400 hover:bg-slate-50"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-black text-slate-900">{finding.title}</div>
                          <div className="mt-1 text-xs font-semibold text-slate-500">{labelize(finding.source)} · {finding.category}{linkedFindingIds.has(finding.id) ? " · already linked" : ""}</div>
                        </div>
                        <div className="text-xs font-black text-slate-600">Use →</div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </section>
          </div>

          <form onSubmit={addPlanItem} className="self-start rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:sticky xl:top-5">
            <div>
              <h3 className="text-base font-black text-slate-950">Add Draft Plan Item</h3>
              <p className="mt-1 text-sm leading-6 text-slate-500">Manager-authored planning decision. No Work Order is created here.</p>
            </div>

            <div className="mt-5 space-y-4">
              <label className="block">
                <FieldLabel>Action / Title</FieldLabel>
                <input required className={inputClass} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Inspect front brakes" />
              </label>

              <label className="block">
                <FieldLabel>Description</FieldLabel>
                <textarea className={`${inputClass} min-h-20 resize-y`} value={description} onChange={(event) => setDescription(event.target.value)} />
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <label>
                  <FieldLabel>Classification</FieldLabel>
                  <select className={inputClass} value={classification} onChange={(event) => setClassification(event.target.value as InventoryPlanItemClassification)}>
                    {classifications.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
                <label>
                  <FieldLabel>Decision</FieldLabel>
                  <select className={inputClass} value={decision} onChange={(event) => setDecision(event.target.value as InventoryPlanItemDecision)}>
                    {decisions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
                <label>
                  <FieldLabel>Category</FieldLabel>
                  <input className={inputClass} value={category} onChange={(event) => setCategory(event.target.value)} />
                </label>
                <label>
                  <FieldLabel>Priority</FieldLabel>
                  <select className={inputClass} value={priority} onChange={(event) => setPriority(event.target.value as "1" | "2" | "3")}>
                    <option value="1">Priority 1</option>
                    <option value="2">Priority 2</option>
                    <option value="3">Priority 3</option>
                  </select>
                </label>
              </div>

              <label className="block">
                <FieldLabel>Rationale</FieldLabel>
                <textarea className={`${inputClass} min-h-20 resize-y`} value={rationale} onChange={(event) => setRationale(event.target.value)} placeholder="Why this belongs in the plan" />
              </label>

              <div>
                <FieldLabel>Linked Findings</FieldLabel>
                <div className="max-h-44 space-y-2 overflow-y-auto rounded-xl border border-slate-200 p-3">
                  {openFindings.length === 0 ? (
                    <div className="text-sm font-semibold text-slate-400">No open Findings.</div>
                  ) : openFindings.map((finding) => (
                    <label key={finding.id} className="flex cursor-pointer items-start gap-2 text-sm font-semibold text-slate-700">
                      <input type="checkbox" className="mt-1 h-4 w-4" checked={findingIds.includes(finding.id)} onChange={() => toggleFinding(finding.id)} />
                      <span>{finding.title}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label>
                  <FieldLabel>Cost Low</FieldLabel>
                  <input className={inputClass} type="number" min="0" step="0.01" value={estimatedCostLow} onChange={(event) => setEstimatedCostLow(event.target.value)} />
                </label>
                <label>
                  <FieldLabel>Cost High</FieldLabel>
                  <input className={inputClass} type="number" min="0" step="0.01" value={estimatedCostHigh} onChange={(event) => setEstimatedCostHigh(event.target.value)} />
                </label>
                <label>
                  <FieldLabel>Planning Amount</FieldLabel>
                  <input className={inputClass} type="number" min="0" step="0.01" value={planningAmount} onChange={(event) => setPlanningAmount(event.target.value)} placeholder="Defaults to high estimate" />
                </label>
                <label>
                  <FieldLabel>Duration Hours</FieldLabel>
                  <input className={inputClass} type="number" min="0" step="0.25" value={estimatedDurationHours} onChange={(event) => setEstimatedDurationHours(event.target.value)} />
                </label>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label>
                  <FieldLabel>Cost Source</FieldLabel>
                  <select className={inputClass} value={costSource} onChange={(event) => setCostSource(event.target.value as InventoryPlanItemCostSource)}>
                    {costSources.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
                <label>
                  <FieldLabel>Confidence (0–1)</FieldLabel>
                  <input className={inputClass} type="number" min="0" max="1" step="0.05" value={confidence} onChange={(event) => setConfidence(event.target.value)} />
                </label>
              </div>

              <label className="block">
                <FieldLabel>Cost Source Detail</FieldLabel>
                <input className={inputClass} value={costSourceDetail} onChange={(event) => setCostSourceDetail(event.target.value)} placeholder="Quote, prior job, catalog reference, assumption…" />
              </label>

              {decision === "declined" ? (
                <label className="block">
                  <FieldLabel>Decline Reason</FieldLabel>
                  <textarea required className={`${inputClass} min-h-20 resize-y`} value={declineReason} onChange={(event) => setDeclineReason(event.target.value)} />
                </label>
              ) : null}

              <label className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-sm font-bold text-amber-900">
                <input type="checkbox" className="mt-1 h-4 w-4" checked={managerInvestigationRequired} onChange={(event) => setManagerInvestigationRequired(event.target.checked)} />
                Manager investigation required before this item can be confidently authorized.
              </label>

              <button type="submit" disabled={savingItem} className="w-full rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white disabled:opacity-50">
                {savingItem ? "Adding…" : "Add to Draft Car Plan"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}
