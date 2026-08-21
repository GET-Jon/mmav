"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
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
  { value: "intake", label: "Purchaser Intake" },
  { value: "inspection", label: "Mechanical Inspection" },
  { value: "planning", label: "Car Plan" },
  { value: "reconditioning", label: "Work in Progress" },
  { value: "final_qc", label: "Final Quality Check" },
  { value: "merchandising", label: "Merchandising" },
  { value: "ready", label: "Ready for Sale" },
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

const sectionForPhase: Partial<Record<InventoryVehiclePhase, string>> = {
  purchased: "intake",
  intake: "intake",
  inspection: "intake",
  planning: "car-plan",
  reconditioning: "work",
  final_qc: "qc",
  merchandising: "media",
};

function toDateInput(value: string | null) {
  if (!value) return "";
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : "";
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(parsed);
}

function FieldLabel({ children, help }: { children: React.ReactNode; help?: string }) {
  return (
    <div className="mb-1.5">
      <div className="text-xs font-black uppercase tracking-[0.08em] text-slate-500">{children}</div>
      {help ? <div className="mt-1 text-xs font-medium leading-5 text-slate-400">{help}</div> : null}
    </div>
  );
}

function StatusPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-400">{label}</div>
      <div className="mt-0.5 text-sm font-black text-slate-900">{value}</div>
    </div>
  );
}

const inputClass = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none transition focus:border-slate-500";

export function InventoryVehicleWorkspace({ vehicle }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
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

  const base = `/mindful/inventory/${vehicle.id}`;
  const nextSection = sectionForPhase[vehicle.phase];
  const currentPhaseLabel = phaseOptions.find((item) => item.value === vehicle.phase)?.label || vehicle.phase;
  const currentHealthLabel = healthOptions.find((item) => item.value === vehicle.health)?.label || vehicle.health;
  const currentTitleLabel = titleStatusOptions.find((item) => item.value === vehicle.titleStatus)?.label || vehicle.titleStatus;

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
      setEditing(false);
      router.refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to update vehicle.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm sm:px-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">Next Action</div>
            <div className="mt-1 text-xl font-black tracking-[-0.02em] text-slate-950">{vehicle.nextAction || "No next action assigned"}</div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold text-slate-500">
              <span><span className="text-slate-400">Owner:</span> {vehicle.nextActionOwnerPartnerName || (vehicle.nextActionOwnerUserId ? "Internal owner" : "Unassigned")}</span>
              <span><span className="text-slate-400">Due:</span> {formatDate(vehicle.nextActionDueAt)}</span>
              <span><span className="text-slate-400">Location:</span> {vehicle.currentLocationName || "—"}</span>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {nextSection ? <Link href={`${base}/${nextSection}`} className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white hover:bg-slate-800">Open {currentPhaseLabel} →</Link> : null}
            <button type="button" onClick={() => setEditing((value) => !value)} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700 hover:bg-slate-50">
              {editing ? "Close editing" : "Edit overview"}
            </button>
          </div>
        </div>
      </section>

      {vehicle.holdActive ? (
        <section className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 shadow-sm sm:px-5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span className="font-black uppercase tracking-[0.08em] text-amber-800">On Hold</span>
            <span className="font-bold text-amber-950">{vehicle.holdReason || "This vehicle is currently paused."}</span>
            <span className="font-semibold text-amber-700">Follow up {formatDate(vehicle.holdFollowUpAt)}</span>
          </div>
        </section>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">Vehicle Status</div>
            <div className="mt-1 text-sm font-semibold text-slate-500">A compact snapshot of the management state.</div>
          </div>
          <div className="grid flex-1 gap-2 sm:grid-cols-3 lg:max-w-[760px] lg:grid-cols-5">
            <StatusPill label="Step" value={currentPhaseLabel} />
            <StatusPill label="Status" value={currentHealthLabel} />
            <StatusPill label="Grade" value={vehicle.grade ? vehicle.grade.toUpperCase() : "—"} />
            <StatusPill label="Priority" value={`P${vehicle.priority}`} />
            <StatusPill label="Title" value={currentTitleLabel} />
          </div>
        </div>
      </section>

      {editing ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(340px,0.75fr)]">
          <div className="space-y-4">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-black text-slate-950">Edit Vehicle Status</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label><FieldLabel>Current Step</FieldLabel><select className={inputClass} value={phase} onChange={(e) => setPhase(e.target.value as InventoryVehiclePhase)}>{phaseOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
                <label><FieldLabel>Overall Status</FieldLabel><select className={inputClass} value={health} onChange={(e) => setHealth(e.target.value as InventoryVehicleHealth)}>{healthOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
                <label><FieldLabel>Vehicle Grade</FieldLabel><select className={inputClass} value={grade} onChange={(e) => setGrade(e.target.value as InventoryVehicleGrade | "")}><option value="">Unassigned</option>{(["a","b","c","d","e"] as InventoryVehicleGrade[]).map((v) => <option key={v} value={v}>{v.toUpperCase()}</option>)}</select></label>
                <label><FieldLabel>Priority</FieldLabel><select className={inputClass} value={priority} onChange={(e) => setPriority(e.target.value as InventoryVehiclePriority)}>{(["1","2","3"] as InventoryVehiclePriority[]).map((v) => <option key={v} value={v}>Priority {v}</option>)}</select></label>
                <label className="sm:col-span-2"><FieldLabel>Title Status</FieldLabel><select className={inputClass} value={titleStatus} onChange={(e) => setTitleStatus(e.target.value as InventoryTitleStatus)}>{titleStatusOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-black text-slate-950">Edit Next Action & Timing</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="sm:col-span-2"><FieldLabel help="Use one concrete action.">Next Action</FieldLabel><textarea className={`${inputClass} min-h-20 resize-y`} value={nextAction} onChange={(e) => setNextAction(e.target.value)} /></label>
                <label><FieldLabel>Next Action Due</FieldLabel><input className={inputClass} type="date" value={nextActionDueAt} onChange={(e) => setNextActionDueAt(e.target.value)} /></label>
                <div><FieldLabel>Responsible</FieldLabel><div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-600">{vehicle.nextActionOwnerPartnerName || (vehicle.nextActionOwnerUserId ? "Internal owner" : "Unassigned")}</div></div>
                <label><FieldLabel>Target Ready</FieldLabel><input className={inputClass} type="date" value={targetReadyAt} onChange={(e) => setTargetReadyAt(e.target.value)} /></label>
                <label><FieldLabel>Current Forecast</FieldLabel><input className={inputClass} type="date" value={forecastReadyAt} onChange={(e) => setForecastReadyAt(e.target.value)} /></label>
              </div>
            </section>

            <section className={`rounded-2xl border p-5 shadow-sm ${holdActive ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-white"}`}>
              <div className="flex items-center justify-between gap-4">
                <div><h2 className="text-lg font-black text-slate-950">On Hold</h2><p className="mt-1 text-sm text-slate-500">Pause progress without changing the workflow step.</p></div>
                <label className="flex items-center gap-2 text-sm font-black text-slate-700"><input type="checkbox" checked={holdActive} onChange={(e) => setHoldActive(e.target.checked)} className="h-4 w-4" />On hold</label>
              </div>
              {holdActive ? <div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="sm:col-span-2"><FieldLabel>Reason</FieldLabel><textarea required className={`${inputClass} min-h-20 resize-y`} value={holdReason} onChange={(e) => setHoldReason(e.target.value)} /></label><label><FieldLabel>Follow-Up Date</FieldLabel><input className={inputClass} type="date" value={holdFollowUpAt} onChange={(e) => setHoldFollowUpAt(e.target.value)} /></label></div> : null}
            </section>
          </div>

          <aside className="space-y-4">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">Reference</div>
              <h2 className="mt-1 text-lg font-black text-slate-950">Vehicle Economics</h2>
              <dl className="mt-4 space-y-3 text-sm">
                <div><dt className="text-xs font-black uppercase text-slate-400">Purchase Price</dt><dd className="mt-1 font-semibold text-slate-700">${vehicle.purchasePrice.toLocaleString()}</dd></div>
                <div><dt className="text-xs font-black uppercase text-slate-400">Buyer Fees</dt><dd className="mt-1 font-semibold text-slate-700">${vehicle.buyerFees.toLocaleString()}</dd></div>
                <div><dt className="text-xs font-black uppercase text-slate-400">Other Acquisition</dt><dd className="mt-1 font-semibold text-slate-700">${vehicle.otherAcquisitionCost.toLocaleString()}</dd></div>
                <div><dt className="text-xs font-black uppercase text-slate-400">Expected Sale</dt><dd className="mt-1 font-semibold text-slate-700">{vehicle.expectedSalePrice === null ? "—" : `$${vehicle.expectedSalePrice.toLocaleString()}`}</dd></div>
              </dl>
            </section>

            <div className="sticky top-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <div className={`text-sm font-bold ${status && status !== "Saved." ? "text-red-600" : "text-emerald-700"}`}>{status}</div>
                <button type="submit" disabled={saving} className="rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-black text-white disabled:bg-slate-300">{saving ? "Saving..." : "Save Changes"}</button>
              </div>
            </div>
          </aside>
        </div>
      ) : (
        <section className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 sm:px-5">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm font-semibold text-slate-600">
            <span><span className="text-slate-400">Target ready:</span> {formatDate(vehicle.targetReadyAt)}</span>
            <span><span className="text-slate-400">Forecast:</span> {formatDate(vehicle.forecastReadyAt)}</span>
            <span><span className="text-slate-400">Project owner:</span> {vehicle.projectOwnerUserId ? "Assigned" : "Unassigned"}</span>
            <span><span className="text-slate-400">Purchase:</span> ${vehicle.purchasePrice.toLocaleString()}</span>
            <span><span className="text-slate-400">Expected sale:</span> {vehicle.expectedSalePrice === null ? "—" : `$${vehicle.expectedSalePrice.toLocaleString()}`}</span>
          </div>
        </section>
      )}
    </form>
  );
}
