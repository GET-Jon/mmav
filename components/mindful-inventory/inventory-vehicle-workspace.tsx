"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import type {
  InventoryTitleStatus,
  InventoryVehicleGrade,
  InventoryVehicleHealth,
  InventoryVehiclePhase,
  InventoryVehiclePriority,
  InventoryVehicleView,
} from "@/lib/mindful-inventory/types";

type Props = { vehicle: InventoryVehicleView };

const phaseOptions: Array<{ value: InventoryVehiclePhase; label: string }> = [
  { value: "purchased", label: "Purchased" },
  { value: "intake", label: "Intake" },
  { value: "inspection", label: "Inspection" },
  { value: "planning", label: "Planning" },
  { value: "reconditioning", label: "Reconditioning" },
  { value: "final_qc", label: "Final QC" },
  { value: "merchandising", label: "Merchandising" },
  { value: "ready", label: "Ready" },
];

const healthOptions: Array<{ value: InventoryVehicleHealth; label: string }> = [
  { value: "on_track", label: "On Track" },
  { value: "at_risk", label: "At Risk" },
  { value: "behind", label: "Behind" },
  { value: "blocked", label: "Blocked" },
];

const titleStatusOptions: Array<{ value: InventoryTitleStatus; label: string }> = [
  { value: "unknown", label: "Unknown" },
  { value: "awaiting", label: "Awaiting" },
  { value: "received", label: "Received" },
  { value: "issue", label: "Issue" },
  { value: "not_applicable", label: "Not Applicable" },
];

function toDateInput(value: string | null) {
  if (!value) return "";
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : "";
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <div className="mb-1.5 text-xs font-black uppercase tracking-[0.08em] text-slate-500">{children}</div>;
}

const inputClass = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none transition focus:border-slate-500";

export function InventoryVehicleWorkspace({ vehicle }: Props) {
  const router = useRouter();
  const [phase, setPhase] = useState<InventoryVehiclePhase>(vehicle.phase);
  const [grade, setGrade] = useState<InventoryVehicleGrade | "">(vehicle.grade || "");
  const [priority, setPriority] = useState<InventoryVehiclePriority>(vehicle.priority);
  const [health, setHealth] = useState<InventoryVehicleHealth>(vehicle.health);
  const [titleStatus, setTitleStatus] = useState<InventoryTitleStatus>(vehicle.titleStatus);
  const [nextAction, setNextAction] = useState(vehicle.nextAction || "");
  const [nextActionDueAt, setNextActionDueAt] = useState(toDateInput(vehicle.nextActionDueAt));
  const [targetReadyAt, setTargetReadyAt] = useState(toDateInput(vehicle.targetReadyAt));
  const [forecastReadyAt, setForecastReadyAt] = useState(toDateInput(vehicle.forecastReadyAt));
  const [holdActive, setHoldActive] = useState(vehicle.holdActive);
  const [holdReason, setHoldReason] = useState(vehicle.holdReason || "");
  const [holdFollowUpAt, setHoldFollowUpAt] = useState(toDateInput(vehicle.holdFollowUpAt));
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setStatus("");
    try {
      const response = await fetch(`/api/mindful/inventory/vehicles/${vehicle.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phase,
          grade: grade || null,
          priority,
          health,
          titleStatus,
          nextAction,
          nextActionDueAt,
          targetReadyAt,
          forecastReadyAt,
          holdActive,
          holdReason,
          holdFollowUpAt,
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Failed to update vehicle.");
      setStatus("Saved.");
      router.refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to update vehicle.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
      <div className="space-y-5">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">Overview</div>
            <h2 className="mt-1 text-xl font-black text-slate-950">Operational state</h2>
            <p className="mt-1 text-sm text-slate-500">Lifecycle position, management status, and vehicle priority.</p>
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label><FieldLabel>Phase</FieldLabel><select className={inputClass} value={phase} onChange={(e) => setPhase(e.target.value as InventoryVehiclePhase)}>{phaseOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
            <label><FieldLabel>Health</FieldLabel><select className={inputClass} value={health} onChange={(e) => setHealth(e.target.value as InventoryVehicleHealth)}>{healthOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
            <label><FieldLabel>Grade</FieldLabel><select className={inputClass} value={grade} onChange={(e) => setGrade(e.target.value as InventoryVehicleGrade | "")}><option value="">Unassigned</option>{(["a","b","c","d","e"] as InventoryVehicleGrade[]).map((v) => <option key={v} value={v}>{v.toUpperCase()}</option>)}</select></label>
            <label><FieldLabel>Priority</FieldLabel><select className={inputClass} value={priority} onChange={(e) => setPriority(e.target.value as InventoryVehiclePriority)}>{(["1","2","3"] as InventoryVehiclePriority[]).map((v) => <option key={v} value={v}>Priority {v}</option>)}</select></label>
            <label className="sm:col-span-2"><FieldLabel>Title Status</FieldLabel><select className={inputClass} value={titleStatus} onChange={(e) => setTitleStatus(e.target.value as InventoryTitleStatus)}>{titleStatusOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-black text-slate-950">Next action & readiness</h2>
          <p className="mt-1 text-sm text-slate-500">What needs to happen next and when this vehicle should be ready.</p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="sm:col-span-2"><FieldLabel>Next Action</FieldLabel><textarea className={`${inputClass} min-h-24 resize-y`} value={nextAction} onChange={(e) => setNextAction(e.target.value)} /></label>
            <label><FieldLabel>Next Action Due</FieldLabel><input className={inputClass} type="date" value={nextActionDueAt} onChange={(e) => setNextActionDueAt(e.target.value)} /></label>
            <div><FieldLabel>Next Action Owner</FieldLabel><div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-600">{vehicle.nextActionOwnerPartnerName || (vehicle.nextActionOwnerUserId ? "Internal user" : "Unassigned")}</div></div>
            <label><FieldLabel>Target Ready</FieldLabel><input className={inputClass} type="date" value={targetReadyAt} onChange={(e) => setTargetReadyAt(e.target.value)} /></label>
            <label><FieldLabel>Forecast Ready</FieldLabel><input className={inputClass} type="date" value={forecastReadyAt} onChange={(e) => setForecastReadyAt(e.target.value)} /></label>
          </div>
        </section>

        <section className={`rounded-2xl border p-5 shadow-sm ${holdActive ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-white"}`}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div><h2 className="text-base font-black text-slate-950">Hold overlay</h2><p className="mt-1 text-sm text-slate-500">Pause normal progress without changing lifecycle phase.</p></div>
            <label className="flex items-center gap-2 text-sm font-black text-slate-700"><input type="checkbox" checked={holdActive} onChange={(e) => setHoldActive(e.target.checked)} className="h-4 w-4" />On Hold</label>
          </div>
          {holdActive ? <div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="sm:col-span-2"><FieldLabel>Hold Reason</FieldLabel><textarea required className={`${inputClass} min-h-24 resize-y`} value={holdReason} onChange={(e) => setHoldReason(e.target.value)} /></label><label><FieldLabel>Follow Up</FieldLabel><input className={inputClass} type="date" value={holdFollowUpAt} onChange={(e) => setHoldFollowUpAt(e.target.value)} /></label></div> : null}
        </section>
      </div>

      <aside className="space-y-5">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">Reference</div>
          <h2 className="mt-1 text-base font-black text-slate-950">Vehicle economics</h2>
          <dl className="mt-5 space-y-4 text-sm">
            <div><dt className="text-xs font-black uppercase text-slate-400">Location</dt><dd className="mt-1 font-semibold text-slate-700">{vehicle.currentLocationName || "—"}</dd></div>
            <div><dt className="text-xs font-black uppercase text-slate-400">Project Owner</dt><dd className="mt-1 font-semibold text-slate-700">{vehicle.projectOwnerUserId ? "Assigned" : "Unassigned"}</dd></div>
            <div><dt className="text-xs font-black uppercase text-slate-400">Purchase Price</dt><dd className="mt-1 font-semibold text-slate-700">${vehicle.purchasePrice.toLocaleString()}</dd></div>
            <div><dt className="text-xs font-black uppercase text-slate-400">Buyer Fees</dt><dd className="mt-1 font-semibold text-slate-700">${vehicle.buyerFees.toLocaleString()}</dd></div>
            <div><dt className="text-xs font-black uppercase text-slate-400">Other Acquisition</dt><dd className="mt-1 font-semibold text-slate-700">${vehicle.otherAcquisitionCost.toLocaleString()}</dd></div>
            <div><dt className="text-xs font-black uppercase text-slate-400">Expected Sale</dt><dd className="mt-1 font-semibold text-slate-700">{vehicle.expectedSalePrice === null ? "—" : `$${vehicle.expectedSalePrice.toLocaleString()}`}</dd></div>
          </dl>
        </section>

        <div className="sticky top-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div className={`text-sm font-bold ${status && status !== "Saved." ? "text-red-600" : "text-emerald-700"}`}>{status}</div>
            <button type="submit" disabled={saving} className="rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-black text-white disabled:bg-slate-300">{saving ? "Saving..." : "Save Overview"}</button>
          </div>
        </div>
      </aside>
    </form>
  );
}
