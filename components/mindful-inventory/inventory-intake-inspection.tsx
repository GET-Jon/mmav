"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import type {
  InventoryFindingSeverity,
  InventoryIntakeInspectionData,
  InventoryInspectionStatus,
} from "@/lib/mindful-inventory/intake-inspection";

type Props = {
  vehicleId: string;
  data: InventoryIntakeInspectionData;
};

const inputClass = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none transition focus:border-slate-500";

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <div className="mb-1.5 text-xs font-black uppercase tracking-[0.08em] text-slate-500">{children}</div>;
}

function StatusBadge({ complete, label }: { complete: boolean; label: string }) {
  return (
    <span className={complete ? "inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-black text-emerald-800" : "inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-black text-amber-800"}>
      {label}
    </span>
  );
}

export function InventoryIntakeInspection({ vehicleId, data }: Props) {
  const router = useRouter();

  const [intakeMileage, setIntakeMileage] = useState(data.intake?.mileage?.toString() || "");
  const [keysCount, setKeysCount] = useState(data.intake?.keysCount?.toString() || "");
  const [visibleDamageSummary, setVisibleDamageSummary] = useState(data.intake?.visibleDamageSummary || "");
  const [initialObservations, setInitialObservations] = useState(data.intake?.initialObservations || "");
  const [preliminaryGrade, setPreliminaryGrade] = useState(data.intake?.preliminaryGrade || "");
  const [intakeStatus, setIntakeStatus] = useState("");
  const [intakeSaving, setIntakeSaving] = useState(false);

  const [inspectionSummary, setInspectionSummary] = useState(data.mechanicalInspection?.summary || "");
  const [inspectionStatus, setInspectionStatus] = useState<InventoryInspectionStatus>(data.mechanicalInspection?.status || "draft");
  const [inspectionMessage, setInspectionMessage] = useState("");
  const [inspectionSaving, setInspectionSaving] = useState(false);

  const [findingTitle, setFindingTitle] = useState("");
  const [findingDescription, setFindingDescription] = useState("");
  const [findingCategory, setFindingCategory] = useState("mechanical");
  const [findingSeverity, setFindingSeverity] = useState<InventoryFindingSeverity | "">("");
  const [costLow, setCostLow] = useState("");
  const [costHigh, setCostHigh] = useState("");
  const [durationHours, setDurationHours] = useState("");
  const [findingMessage, setFindingMessage] = useState("");
  const [findingSaving, setFindingSaving] = useState(false);

  async function saveIntake(status: "draft" | "complete") {
    setIntakeSaving(true);
    setIntakeStatus("");
    try {
      const response = await fetch(`/api/mindful/inventory/vehicles/${vehicleId}/intake`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          mileage: intakeMileage,
          keysCount,
          visibleDamageSummary,
          initialObservations,
          preliminaryGrade,
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Failed to save intake.");
      setIntakeStatus(status === "complete" ? "Intake completed." : "Draft saved.");
      router.refresh();
    } catch (error) {
      setIntakeStatus(error instanceof Error ? error.message : "Failed to save intake.");
    } finally {
      setIntakeSaving(false);
    }
  }

  async function saveInspection() {
    setInspectionSaving(true);
    setInspectionMessage("");
    try {
      const response = await fetch(`/api/mindful/inventory/vehicles/${vehicleId}/inspection`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: inspectionStatus, summary: inspectionSummary }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Failed to save inspection.");
      setInspectionMessage(inspectionStatus === "complete" ? "Inspection completed." : "Inspection saved.");
      router.refresh();
    } catch (error) {
      setInspectionMessage(error instanceof Error ? error.message : "Failed to save inspection.");
    } finally {
      setInspectionSaving(false);
    }
  }

  async function addFinding(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFindingSaving(true);
    setFindingMessage("");
    try {
      const response = await fetch(`/api/mindful/inventory/vehicles/${vehicleId}/findings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: data.mechanicalInspection ? "inspection" : data.intake ? "intake" : "manager",
          intakeId: data.intake?.id || null,
          inspectionId: data.mechanicalInspection?.id || null,
          title: findingTitle,
          description: findingDescription,
          category: findingCategory,
          severity: findingSeverity || null,
          estimatedCostLow: costLow,
          estimatedCostHigh: costHigh,
          estimatedDurationHours: durationHours,
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Failed to add finding.");
      setFindingTitle("");
      setFindingDescription("");
      setFindingSeverity("");
      setCostLow("");
      setCostHigh("");
      setDurationHours("");
      setFindingMessage("Finding added.");
      router.refresh();
    } catch (error) {
      setFindingMessage(error instanceof Error ? error.message : "Failed to add finding.");
    } finally {
      setFindingSaving(false);
    }
  }

  async function changeFindingStatus(findingId: string, status: "open" | "resolved" | "dismissed") {
    const finding = data.findings.find((item) => item.id === findingId);
    if (!finding) return;
    const response = await fetch(`/api/mindful/inventory/findings/${findingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: finding.title,
        description: finding.description,
        category: finding.category,
        subcategory: finding.subcategory,
        severity: finding.severity,
        status,
      }),
    });
    if (response.ok) router.refresh();
  }

  const intakeComplete = data.intake?.status === "complete";
  const inspectionComplete = data.mechanicalInspection?.status === "complete";

  return (
    <section className="space-y-6" id="intake-inspection">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">Workflow Gate</div>
            <h2 className="mt-1 text-xl font-black tracking-[-0.025em] text-slate-950">Intake → Inspection → Planning</h2>
            <p className="mt-1 text-sm text-slate-500">Planning unlocks only after purchaser Intake and the mechanical Inspection are complete.</p>
          </div>
          <StatusBadge complete={data.planningReady} label={data.planningReady ? "Ready for Planning" : "Planning Locked"} />
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-black text-slate-950">Purchaser Intake</h2>
              <p className="mt-1 text-sm text-slate-500">Capture the received condition before mechanical inspection.</p>
            </div>
            <StatusBadge complete={intakeComplete} label={intakeComplete ? "Complete" : "Draft"} />
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label><FieldLabel>Mileage</FieldLabel><input className={inputClass} inputMode="numeric" value={intakeMileage} onChange={(e) => setIntakeMileage(e.target.value)} /></label>
            <label><FieldLabel>Keys</FieldLabel><input className={inputClass} inputMode="numeric" value={keysCount} onChange={(e) => setKeysCount(e.target.value)} /></label>
            <label><FieldLabel>Preliminary Grade</FieldLabel><select className={inputClass} value={preliminaryGrade} onChange={(e) => setPreliminaryGrade(e.target.value)}><option value="">Unassigned</option>{["a","b","c","d","e"].map((value) => <option key={value} value={value}>{value.toUpperCase()}</option>)}</select></label>
            <label className="sm:col-span-2"><FieldLabel>Visible Damage</FieldLabel><textarea className={`${inputClass} min-h-24 resize-y`} value={visibleDamageSummary} onChange={(e) => setVisibleDamageSummary(e.target.value)} placeholder="Exterior/interior damage visible at intake" /></label>
            <label className="sm:col-span-2"><FieldLabel>Initial Observations</FieldLabel><textarea className={`${inputClass} min-h-28 resize-y`} value={initialObservations} onChange={(e) => setInitialObservations(e.target.value)} placeholder="Warnings, noises, missing items, condition notes..." /></label>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
            <div className="text-sm font-semibold text-slate-500">{intakeStatus}</div>
            <div className="flex gap-2">
              <button type="button" disabled={intakeSaving} onClick={() => saveIntake("draft")} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-black text-slate-700 disabled:opacity-50">Save Draft</button>
              <button type="button" disabled={intakeSaving} onClick={() => saveIntake("complete")} className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white disabled:bg-slate-300">Complete Intake</button>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-black text-slate-950">Mechanical Inspection</h2>
              <p className="mt-1 text-sm text-slate-500">Document the mechanic's assessment. Findings are recorded separately below.</p>
            </div>
            <StatusBadge complete={inspectionComplete} label={inspectionComplete ? "Complete" : "Open"} />
          </div>

          <div className="mt-5 space-y-4">
            <label><FieldLabel>Status</FieldLabel><select className={inputClass} value={inspectionStatus} onChange={(e) => setInspectionStatus(e.target.value as InventoryInspectionStatus)}><option value="draft">Draft</option><option value="in_progress">In Progress</option><option value="complete">Complete</option><option value="cancelled">Cancelled</option></select></label>
            <label><FieldLabel>Inspection Summary</FieldLabel><textarea className={`${inputClass} min-h-44 resize-y`} value={inspectionSummary} onChange={(e) => setInspectionSummary(e.target.value)} placeholder="Overall mechanical condition, scan results, road test observations..." /></label>
          </div>

          <div className="mt-5 flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
            <div className="text-sm font-semibold text-slate-500">{inspectionMessage}</div>
            <button type="button" disabled={inspectionSaving} onClick={saveInspection} className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white disabled:bg-slate-300">Save Inspection</button>
          </div>
        </section>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-base font-black text-slate-950">Findings</h2>
          <p className="mt-1 text-sm text-slate-500"><strong>Observation only.</strong> A Finding does not authorize work or spending. Approved work will be created later through the Car Plan.</p>
        </div>

        <form onSubmit={addFinding} className="mt-5 grid gap-4 rounded-2xl bg-slate-50 p-4 md:grid-cols-2 xl:grid-cols-4">
          <label className="md:col-span-2"><FieldLabel>Finding</FieldLabel><input required className={inputClass} value={findingTitle} onChange={(e) => setFindingTitle(e.target.value)} placeholder="e.g. Front control arm bushings cracked" /></label>
          <label><FieldLabel>Category</FieldLabel><select className={inputClass} value={findingCategory} onChange={(e) => setFindingCategory(e.target.value)}><option value="mechanical">Mechanical</option><option value="maintenance">Maintenance</option><option value="cosmetic">Cosmetic</option><option value="transportation">Transportation</option><option value="inspection">Inspection</option><option value="other">Other</option></select></label>
          <label><FieldLabel>Severity</FieldLabel><select className={inputClass} value={findingSeverity} onChange={(e) => setFindingSeverity(e.target.value as InventoryFindingSeverity | "")}><option value="">Unrated</option><option value="green">Green</option><option value="yellow">Yellow</option><option value="red">Red</option></select></label>
          <label className="md:col-span-2 xl:col-span-4"><FieldLabel>Description</FieldLabel><textarea className={`${inputClass} min-h-24 resize-y`} value={findingDescription} onChange={(e) => setFindingDescription(e.target.value)} /></label>
          <label><FieldLabel>Est. Cost Low</FieldLabel><input className={inputClass} inputMode="decimal" value={costLow} onChange={(e) => setCostLow(e.target.value)} /></label>
          <label><FieldLabel>Est. Cost High</FieldLabel><input className={inputClass} inputMode="decimal" value={costHigh} onChange={(e) => setCostHigh(e.target.value)} /></label>
          <label><FieldLabel>Est. Hours</FieldLabel><input className={inputClass} inputMode="decimal" value={durationHours} onChange={(e) => setDurationHours(e.target.value)} /></label>
          <div className="flex items-end justify-end"><button disabled={findingSaving} type="submit" className="w-full rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white disabled:bg-slate-300">Add Finding</button></div>
          {findingMessage ? <div className="md:col-span-2 xl:col-span-4 text-sm font-semibold text-slate-600">{findingMessage}</div> : null}
        </form>

        <div className="mt-5 space-y-3">
          {data.findings.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm font-semibold text-slate-500">No Findings recorded yet.</div>
          ) : data.findings.map((finding) => (
            <div key={finding.id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="font-black text-slate-950">{finding.title}</div>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-black uppercase text-slate-600">{finding.category}</span>
                    {finding.severity ? <span className="rounded-full border border-slate-200 px-2 py-0.5 text-[11px] font-black uppercase text-slate-700">{finding.severity}</span> : null}
                    <span className="rounded-full border border-slate-200 px-2 py-0.5 text-[11px] font-black uppercase text-slate-500">{finding.status}</span>
                  </div>
                  {finding.description ? <p className="mt-2 text-sm leading-6 text-slate-600">{finding.description}</p> : null}
                  {(finding.estimatedCostLow !== null || finding.estimatedCostHigh !== null || finding.estimatedDurationHours !== null) ? (
                    <div className="mt-2 text-xs font-semibold text-slate-500">Estimate: {finding.estimatedCostLow !== null ? `$${finding.estimatedCostLow.toLocaleString()}` : "—"} – {finding.estimatedCostHigh !== null ? `$${finding.estimatedCostHigh.toLocaleString()}` : "—"}{finding.estimatedDurationHours !== null ? ` · ${finding.estimatedDurationHours} hrs` : ""}</div>
                  ) : null}
                </div>
                <div className="flex shrink-0 gap-2">
                  <button type="button" onClick={() => changeFindingStatus(finding.id, "open")} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-black text-slate-600">Open</button>
                  <button type="button" onClick={() => changeFindingStatus(finding.id, "resolved")} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-black text-slate-600">Resolve</button>
                  <button type="button" onClick={() => changeFindingStatus(finding.id, "dismissed")} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-black text-slate-600">Dismiss</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </section>
  );
}
