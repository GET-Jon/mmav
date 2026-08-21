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
  if (!value) return "Not set";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "Not set";
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

  const base = `/mindful/inventory/${vehicle.id}`;
  const nextSection = sectionForPhase[vehicle.phase];

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
    <form onSubmit={handleSubmit} className="space-y-5">
      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-slate-50 px-5 py-3">
          <div className="text-xs font-black uppercase tracking-[0.1em] text-slate-500">What needs attention now?</div>
        </div>
        <div className="grid gap-0 lg:grid-cols-[minmax(0,1.5fr)_minmax(360px,0.5fr)]">
          <div className="p-5 sm:p-6">
            <div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">Next Action</div>
            <div className="mt-2 text-2xl font-black tracking-[-0.025em] text-slate-950">{vehicle.nextAction || "No next action has been assigned"}</div>
            <div className="mt-4 flex flex-wrap gap-4 text-sm font-semibold text-slate-600">
              <div><span className="text-slate-400">Responsible:</span> {vehicle.nextActionOwnerPartnerName || (vehicle.nextActionOwnerUserId ? "Internal owner" : "Unassigned")}</div>
              <div><span className="text-slate-400">Due:</span> {formatDate(vehicle.nextActionDueAt)}</div>
              <div><span className="text-slate-400">Location:</span> {vehicle.currentLocationName || "Not assigned"}</div>
            </div>
            {nextSection ? <Link href={`${base}/${nextSection}`} className="mt-5 inline-flex rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white hover:bg-slate-800">Go to this step →</Link> : null}
          </div>
          <div className="border-t border-slate-200 bg-slate-950 p-5 text-white lg:border-l lg:border-t-0 sm:p-6">
            <div className="text-xs font-black uppercase tracking-[0.1em] text-slate-500">Readiness</div>
            <div className="mt-4 grid grid-cols-2 gap-4">
              <div><div className="text-[10px] font-black uppercase text-slate-500">Target Ready</div><div className="mt-1 text-sm font-black">{formatDate(vehicle.targetReadyAt)}</div></div>
              <div><div className="text-[10px] font-black uppercase text-slate-500">Current Forecast</div><div className="mt-1 text-sm font-black">{formatDate(vehicle.forecastReadyAt)}</div></div>
              <div><div className="text-[10px] font-black uppercase text-slate-500">Project Owner</div><div className="mt-1 text-sm font-black">{vehicle.projectOwnerUserId ? "Assigned" : "Unassigned"}</div></div>
              <div><div className="text-[10px] font-black uppercase text-slate-500">Overall Status</div><div className="mt-1 text-sm font-black">{healthOptions.find((item) => item.value === vehicle.health)?.label || vehicle.health}</div></div>
            </div>
            <p className="mt-4 text-xs font-medium leading-5 text-slate-400">Target Ready is the goal. Current Forecast is our best estimate based on what we know today.</p>
          </div>
        </div>
      </section>

      {vehicle.holdActive ? (
        <section className="rounded-2xl border border-amber-300 bg-amber-50 p-5 shadow-sm">
          <div className="text-xs font-black uppercase tracking-[0.1em] text-amber-700">On Hold</div>
          <div className="mt-2 text-lg font-black text-amber-950">{vehicle.holdReason || "This vehicle is currently paused."}</div>
          <div className="mt-1 text-sm font-semibold text-amber-800">Follow up: {formatDate(vehicle.holdFollowUpAt)}</div>
        </section>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(340px,0.7fr)]">
        <div className="space-y-5">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div><h2 className="text-lg font-black text-slate-950">Vehicle Status</h2><p className="mt-1 text-sm text-slate-500">Management fields that describe where the vehicle stands today.</p></div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label><FieldLabel help="The current step in the vehicle workflow.">Current Step</FieldLabel><select className={inputClass} value={phase} onChange={(e) => setPhase(e.target.value as InventoryVehiclePhase)}>{phaseOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
              <label><FieldLabel help="Whether progress is healthy or needs management attention.">Overall Status</FieldLabel><select className={inputClass} value={health} onChange={(e) => setHealth(e.target.value as InventoryVehicleHealth)}>{healthOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
              <label><FieldLabel help="Overall condition grade, A through E.">Vehicle Grade</FieldLabel><select className={inputClass} value={grade} onChange={(e) => setGrade(e.target.value as InventoryVehicleGrade | "")}><option value="">Unassigned</option>{(["a","b","c","d","e"] as InventoryVehicleGrade[]).map((v) => <option key={v} value={v}>{v.toUpperCase()}</option>)}</select></label>
              <label><FieldLabel help="P1 receives the most immediate attention; P3 is lowest urgency.">Priority</FieldLabel><select className={inputClass} value={priority} onChange={(e) => setPriority(e.target.value as InventoryVehiclePriority)}>{(["1","2","3"] as InventoryVehiclePriority[]).map((v) => <option key={v} value={v}>Priority {v}</option>)}</select></label>
              <label className="sm:col-span-2"><FieldLabel>Title Status</FieldLabel><select className={inputClass} value={titleStatus} onChange={(e) => setTitleStatus(e.target.value as InventoryTitleStatus)}>{titleStatusOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-black text-slate-950">Next Action & Timing</h2>
            <p className="mt-1 text-sm text-slate-500">The single most important thing that needs to happen next, plus the readiness dates we are managing toward.</p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="sm:col-span-2"><FieldLabel help="Use one concrete action. Avoid general notes or a list of tasks.">Next Action</FieldLabel><textarea className={`${inputClass} min-h-24 resize-y`} value={nextAction} onChange={(e) => setNextAction(e.target.value)} placeholder="Example: Complete mechanical inspection" /></label>
              <label><FieldLabel>Next Action Due</FieldLabel><input className={inputClass} type="date" value={nextActionDueAt} onChange={(e) => setNextActionDueAt(e.target.value)} /></label>
              <div><FieldLabel>Responsible For Next Action</FieldLabel><div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-600">{vehicle.nextActionOwnerPartnerName || (vehicle.nextActionOwnerUserId ? "Internal owner" : "Unassigned")}</div></div>
              <label><FieldLabel help="The date we want the vehicle ready.">Target Ready</FieldLabel><input className={inputClass} type="date" value={targetReadyAt} onChange={(e) => setTargetReadyAt(e.target.value)} /></label>
              <label><FieldLabel help="Our current best estimate based on known work and delays.">Current Forecast</FieldLabel><input className={inputClass} type="date" value={forecastReadyAt} onChange={(e) => setForecastReadyAt(e.target.value)} /></label>
            </div>
          </section>

          <section className={`rounded-2xl border p-5 shadow-sm ${holdActive ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-white"}`}>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div><h2 className="text-lg font-black text-slate-950">On Hold</h2><p className="mt-1 text-sm text-slate-500">Use this only when normal progress is intentionally paused. The workflow step itself does not change.</p></div>
              <label className="flex items-center gap-2 text-sm font-black text-slate-700"><input type="checkbox" checked={holdActive} onChange={(e) => setHoldActive(e.target.checked)} className="h-4 w-4" />Vehicle is on hold</label>
            </div>
            {holdActive ? <div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="sm:col-span-2"><FieldLabel>Why Is It On Hold?</FieldLabel><textarea required className={`${inputClass} min-h-24 resize-y`} value={holdReason} onChange={(e) => setHoldReason(e.target.value)} /></label><label><FieldLabel>Follow-Up Date</FieldLabel><input className={inputClass} type="date" value={holdFollowUpAt} onChange={(e) => setHoldFollowUpAt(e.target.value)} /></label></div> : null}
          </section>
        </div>

        <aside className="space-y-5">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">Reference</div>
            <h2 className="mt-1 text-lg font-black text-slate-950">Vehicle Economics</h2>
            <p className="mt-1 text-sm text-slate-500">Useful context that does not determine what happens next.</p>
            <dl className="mt-5 space-y-4 text-sm">
              <div><dt className="text-xs font-black uppercase text-slate-400">Location</dt><dd className="mt-1 font-semibold text-slate-700">{vehicle.currentLocationName || "—"}</dd></div>
              <div><dt className="text-xs font-black uppercase text-slate-400">Project Owner</dt><dd className="mt-1 font-semibold text-slate-700">{vehicle.projectOwnerUserId ? "Assigned" : "Unassigned"}</dd></div>
              <div><dt className="text-xs font-black uppercase text-slate-400">Purchase Price</dt><dd className="mt-1 font-semibold text-slate-700">${vehicle.purchasePrice.toLocaleString()}</dd></div>
              <div><dt className="text-xs font-black uppercase text-slate-400">Buyer Fees</dt><dd className="mt-1 font-semibold text-slate-700">${vehicle.buyerFees.toLocaleString()}</dd></div>
              <div><dt className="text-xs font-black uppercase text-slate-400">Other Acquisition</dt><dd className="mt-1 font-semibold text-slate-700">${vehicle.otherAcquisitionCost.toLocaleString()}</dd></div>
              <div><dt className="text-xs font-black uppercase text-slate-400">Expected Sale</dt><dd className="mt-1 font-semibold text-slate-700">{vehicle.expectedSalePrice === null ? "—" : `$${vehicle.expectedSalePrice.toLocaleString()}`}</dd></div>
            </dl>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">How to use Overview</div>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">Overview tells you where the vehicle stands and what needs attention next. Use the section navigation above for the actual Intake, Inspection, Car Plan, Work, QC, Media, and History workflows.</p>
          </section>

          <div className="sticky top-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div className={`text-sm font-bold ${status && status !== "Saved." ? "text-red-600" : "text-emerald-700"}`}>{status}</div>
              <button type="submit" disabled={saving} className="rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-black text-white disabled:bg-slate-300">{saving ? "Saving..." : "Save Overview"}</button>
            </div>
          </div>
        </aside>
      </div>
    </form>
  );
}
