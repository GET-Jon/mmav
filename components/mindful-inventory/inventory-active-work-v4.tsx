"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import type { InventorySchedulingLocationOption, InventorySchedulingResourceOption, InventoryWorkOrderView } from "@/lib/mindful-inventory/active-work";
import type { InventoryPartView } from "@/lib/mindful-inventory/parts-transport";
import type { PartSearchSuggestion } from "@/lib/mindful-inventory/part-suggestions";
import { suggestedPerformerForWork, type InventoryPerformerOption } from "@/lib/mindful-inventory/performers";
import { WorkOrderPartsModal } from "@/components/mindful-inventory/work-order-parts-modal";
import { TrackedPartDetailsEditor } from "@/components/mindful-inventory/tracked-part-details-editor";

function money(value: number | null | undefined) { if (value == null || !Number.isFinite(value)) return "—"; return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value); }
function hours(minutes: number | null | undefined) { return minutes == null ? "—" : `${Math.round((minutes / 60) * 10) / 10} hr`; }
function labelize(value: string) { return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function dateTimeLabel(value: string | null) { return value ? new Date(value).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "Not scheduled"; }
function localInput(value: string | null) { if (!value) return ""; const d = new Date(value); const p = (n: number) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; }
function performerKey(work: InventoryWorkOrderView) { if (work.assignedPartnerId) return `partner:${work.assignedPartnerId}`; if (work.assignedUserId) return `user:${work.assignedUserId}`; return "unassigned"; }
function estimateIssue(work: InventoryWorkOrderView) { if (!work.assignedPartnerId) return null; if (work.partnerEstimateStatus === "awaiting_estimate") return "Partner labor estimate required"; if (work.partnerEstimateStatus === "awaiting_review") return "Partner labor estimate needs manager approval"; if (work.partnerEstimateStatus === "revision_requested") return "Waiting for revised partner labor estimate"; return null; }
function setupIssues(work: InventoryWorkOrderView) {
  if (["complete", "cancelled"].includes(work.status)) return [];
  const issues: string[] = [];
  if (!work.performerName) issues.push("Assign a partner or technician");
  if (!work.locationId) issues.push("Choose a work location");
  if (work.partnerConfirmationStatus === "awaiting_partner") issues.push(work.proposedStartAt ? `Waiting for ${work.performerName || "partner"} to confirm ${dateTimeLabel(work.proposedStartAt)}` : `Waiting for ${work.performerName || "partner"} to confirm timing`);
  else if (!work.scheduledStartAt) issues.push(work.proposedStartAt ? `Suggested slot ${dateTimeLabel(work.proposedStartAt)} has not been confirmed` : "Choose a start time");
  return issues;
}
function executionIssues(work: InventoryWorkOrderView) {
  if (["complete", "cancelled"].includes(work.status)) return [];
  const issues = [...setupIssues(work)]; const estimate = estimateIssue(work); if (estimate) issues.push(estimate);
  if (!work.partsReadyForExecution) {
    if (work.partsLatestEtaAt) issues.push(work.pendingPartCount > 1 ? `${work.pendingPartCount} parts pending · latest ETA ${dateTimeLabel(work.partsLatestEtaAt)}` : `Part ETA: ${dateTimeLabel(work.partsLatestEtaAt)}`);
    else issues.push(work.pendingPartCount > 1 ? `${work.pendingPartCount} parts pending · ETA not entered` : "Part ETA not entered");
  }
  if (work.status === "blocked") issues.push(work.blockerReason ? `Blocked: ${work.blockerReason}` : "Work Order is blocked");
  return issues;
}
function behindScheduleLabel(work: InventoryWorkOrderView, nowMs = Date.now()) {
  if (!work.scheduledStartAt || ["complete", "cancelled"].includes(work.status)) return null;
  const durationMinutes = Math.max(1, work.estimatedElapsedMinutes ?? work.estimatedDurationMinutes ?? 60);
  if (work.status === "in_progress" && work.actualStartAt) {
    const actualStartMs = new Date(work.actualStartAt).getTime();
    if (!Number.isFinite(actualStartMs)) return null;
    const expectedFinishMs = actualStartMs + durationMinutes * 60_000;
    const bufferMinutes = Math.max(30, Math.round(durationMinutes * 0.15));
    const lateMinutes = Math.floor((nowMs - expectedFinishMs) / 60_000);
    if (lateMinutes <= bufferMinutes) return null;
    return lateMinutes >= 60 ? `${Math.round((lateMinutes / 60) * 10) / 10} hr past expected finish` : `${lateMinutes} min past expected finish`;
  }
  if (work.status !== "in_progress" && !work.actualStartAt) {
    const startMs = new Date(work.scheduledStartAt).getTime();
    if (!Number.isFinite(startMs)) return null;
    const lateMinutes = Math.floor((nowMs - startMs) / 60_000);
    if (lateMinutes <= 30) return null;
    return lateMinutes >= 60 ? `${Math.round((lateMinutes / 60) * 10) / 10} hr late to start` : `${lateMinutes} min late to start`;
  }
  return null;
}
function stateFor(work: InventoryWorkOrderView) {
  if (work.status === "complete") return { label: "Complete", cls: "bg-emerald-100 text-emerald-800" };
  if (work.status === "blocked") return { label: "Blocked", cls: "bg-red-100 text-red-800" };
  if (behindScheduleLabel(work)) return { label: "Behind Schedule", cls: "bg-red-100 text-red-800" };
  if (work.status === "in_progress") return { label: "In Progress", cls: "bg-blue-100 text-blue-800" };
  if (work.partnerConfirmationStatus === "awaiting_partner") return { label: "Awaiting Partner", cls: "bg-blue-100 text-blue-800" };
  if (!work.performerName) return { label: "Needs Assignment", cls: "bg-amber-100 text-amber-800" };
  if (!work.locationId) return { label: "Needs Location", cls: "bg-amber-100 text-amber-800" };
  if (!work.scheduledStartAt) return { label: work.proposedStartAt ? "Suggested Slot" : "Needs Time", cls: "bg-amber-100 text-amber-800" };
  if (estimateIssue(work)) return { label: "Estimate Pending", cls: "bg-violet-100 text-violet-800" };
  if (!work.partsReadyForExecution) return { label: "Waiting on Parts", cls: "bg-amber-100 text-amber-800" };
  return { label: "Ready", cls: "bg-emerald-100 text-emerald-800" };
}

type VehicleContext = { year: number; make: string; model: string; trim: string | null; vin: string | null; stockNumber: string | null };

export function InventoryActiveWork({ vehicleId, vehicle: _vehicle, workOrders, performerOptions, locationOptions, resourceOptions, parts, partSuggestions }: {
  vehicleId: string; vehicle: VehicleContext; workOrders: InventoryWorkOrderView[]; performerOptions: InventoryPerformerOption[]; locationOptions: InventorySchedulingLocationOption[]; resourceOptions: InventorySchedulingResourceOption[]; parts: InventoryPartView[]; partSuggestions: PartSearchSuggestion[];
}) {
  const router = useRouter();
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [editingSetupId, setEditingSetupId] = useState<string | null>(null);
  const [scheduleDrafts, setScheduleDrafts] = useState<Record<string, string>>({});
  const [rowMessages, setRowMessages] = useState<Record<string, { type: "success" | "error"; text: string }>>({});
  const [partsWorkOrderId, setPartsWorkOrderId] = useState<string | null>(null);

  const openWork = workOrders.filter((work) => !["complete", "cancelled"].includes(work.status));
  const completed = workOrders.length - openWork.length;
  const activeBudget = workOrders.reduce((sum, work) => sum + work.approvedBudget, 0);
  const totalLabor = workOrders.reduce((sum, work) => sum + (work.estimatedLaborMinutes || 0), 0);
  const setupIncomplete = openWork.filter((work) => setupIssues(work).length > 0);
  const estimateOutstanding = openWork.filter((work) => Boolean(estimateIssue(work)));
  const blocked = openWork.filter((work) => work.status === "blocked");
  const setupReady = openWork.length > 0 && setupIncomplete.length === 0;
  const executionReady = setupReady && openWork.every((work) => work.partsReadyForExecution) && estimateOutstanding.length === 0 && blocked.length === 0;
  const sortedOpenWork = useMemo(() => [...openWork].sort((a, b) => { const at = a.scheduledStartAt || a.proposedStartAt; const bt = b.scheduledStartAt || b.proposedStartAt; if (!at) return 1; if (!bt) return -1; return new Date(at).getTime() - new Date(bt).getTime(); }), [openWork]);
  const behindScheduleWork = sortedOpenWork.find((work) => Boolean(behindScheduleLabel(work))) || null;
  const inProgressWork = sortedOpenWork.find((work) => work.status === "in_progress") || null;
  const nextReadyWork = sortedOpenWork.find((work) => stateFor(work).label === "Ready") || null;
  const statusCounts = openWork.reduce<Record<string, number>>((counts, work) => { const label = stateFor(work).label; counts[label] = (counts[label] || 0) + 1; return counts; }, {});
  const awaitingConfirmationCount = openWork.filter((w) => w.partnerConfirmationStatus === "awaiting_partner").length;
  const needsTimeCount = openWork.filter((w) => w.partnerConfirmationStatus !== "awaiting_partner" && !w.scheduledStartAt).length;
  const needsAssignmentCount = openWork.filter((w) => !w.performerName).length;
  const needsLocationCount = openWork.filter((w) => !w.locationId).length;

  async function patchWork(workOrderId: string, body: Record<string, unknown>, success: string) {
    setWorkingId(workOrderId); setMessage(""); setRowMessages((current) => { const next = { ...current }; delete next[workOrderId]; return next; });
    try { const response = await fetch(`/api/mindful/inventory/work-orders/${workOrderId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const payload = await response.json() as { error?: string }; if (!response.ok) throw new Error(payload.error || "Failed to update Work Order."); setRowMessages((current) => ({ ...current, [workOrderId]: { type: "success", text: success } })); setMessage(success); router.refresh(); }
    catch (error) { const text = error instanceof Error ? error.message : "Failed to update Work Order."; setRowMessages((current) => ({ ...current, [workOrderId]: { type: "error", text } })); setMessage(text); }
    finally { setWorkingId(null); }
  }
  async function scheduleWork(work: InventoryWorkOrderView, value: string) {
    if (!value) return; setWorkingId(work.id); setRowMessages((current) => { const next = { ...current }; delete next[work.id]; return next; });
    try { const response = await fetch(`/api/mindful/inventory/work-orders/${work.id}/schedule`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scheduledStartAt: new Date(value).toISOString() }) }); const payload = await response.json() as { error?: string; warning?: string }; if (!response.ok) throw new Error(payload.error || "Failed to schedule Work Order."); setScheduleDrafts((current) => { const next = { ...current }; delete next[work.id]; return next; }); setRowMessages((current) => ({ ...current, [work.id]: { type: "success", text: payload.warning || "Schedule saved." } })); setEditingSetupId(null); router.refresh(); }
    catch (error) { const text = error instanceof Error ? error.message : "Failed to schedule Work Order."; setRowMessages((current) => ({ ...current, [work.id]: { type: "error", text } })); }
    finally { setWorkingId(null); }
  }

  const modalWork = partsWorkOrderId ? workOrders.find((work) => work.id === partsWorkOrderId) || null : null;
  const modalSuggestion = modalWork ? partSuggestions.find((item) => item.workOrderId === modalWork.id) || null : null;

  if (!workOrders.length) return <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">Active Work</div><h2 className="mt-1 text-2xl font-black">No Work Orders yet</h2><p className="mt-2 text-sm text-slate-500">Approve the Work Plan first.</p></section>;

  const statusFocus = behindScheduleWork || inProgressWork || nextReadyWork;
  const statusHeading = behindScheduleWork ? "Behind schedule" : inProgressWork ? "Work in progress" : nextReadyWork ? "Next ready to start" : openWork.length ? "Work waiting on action" : "Execution complete";
  const focusLateLabel = statusFocus ? behindScheduleLabel(statusFocus) : null;

  return <div className="space-y-4">
    <section className={`rounded-2xl border bg-white p-4 shadow-sm ${behindScheduleWork ? "border-red-200" : "border-slate-200"}`}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">Work Status</div>
          <div className={`mt-2 text-[10px] font-black uppercase tracking-[0.12em] ${behindScheduleWork ? "text-red-700" : "text-slate-400"}`}>{statusHeading}</div>
          {statusFocus ? <>
            <div className="mt-1 text-lg font-black">{statusFocus.title}</div>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm font-semibold text-slate-600"><span>{dateTimeLabel(statusFocus.scheduledStartAt || statusFocus.proposedStartAt)}</span><span>{statusFocus.performerName || "Performer not assigned"}</span><span>{statusFocus.locationName || "Location not selected"}</span>{focusLateLabel ? <span className="font-black text-red-700">{focusLateLabel}</span> : null}</div>
          </> : openWork.length ? <div className="mt-2 flex flex-wrap gap-2">{Object.entries(statusCounts).map(([label, count]) => <span key={label} className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-700">{count} {label.toLowerCase()}</span>)}</div> : <div className="mt-1 text-lg font-black">All authorized work is complete.</div>}
        </div>
        <div className="flex flex-wrap gap-2"><span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-700">{completed}/{workOrders.length} complete</span><span className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-black text-blue-700">{hours(totalLabor)} labor</span><span className="rounded-full bg-slate-950 px-3 py-1.5 text-xs font-black text-white">{money(activeBudget)} budget</span></div>
      </div>
    </section>

    {openWork.length && !setupReady ? <section className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="text-[10px] font-black uppercase tracking-[0.1em] text-amber-700">Finish work setup</div><div className="mt-1 text-sm font-black">{setupIncomplete.length} Work Order{setupIncomplete.length === 1 ? " needs" : "s need"} attention.</div></div><div className="flex flex-wrap gap-2">{awaitingConfirmationCount ? <span className="rounded-full bg-blue-100 px-3 py-1 text-[10px] font-black text-blue-800">{awaitingConfirmationCount} awaiting confirmation</span> : null}{needsTimeCount ? <span className="rounded-full bg-amber-100 px-3 py-1 text-[10px] font-black text-amber-800">{needsTimeCount} need time</span> : null}{needsAssignmentCount ? <span className="rounded-full bg-amber-100 px-3 py-1 text-[10px] font-black text-amber-800">{needsAssignmentCount} unassigned</span> : null}{needsLocationCount ? <span className="rounded-full bg-amber-100 px-3 py-1 text-[10px] font-black text-amber-800">{needsLocationCount} need location</span> : null}</div></div></section> : null}

    <TrackedPartDetailsEditor vehicleId={vehicleId} parts={parts} compact />

    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 bg-slate-50 px-5 py-3"><h3 className="text-sm font-black">Execution plan</h3><p className="mt-0.5 text-[11px] text-slate-500">Manage each job, its setup, parts readiness, and execution from one place.</p></div>
      <div className="ml-4 border-l border-slate-200 sm:ml-6">
        {workOrders.map((work, index) => {
          const done = ["complete", "cancelled"].includes(work.status); const setup = setupIssues(work); const execution = executionIssues(work); const canStart = !done && work.status !== "in_progress" && execution.length === 0; const state = stateFor(work); const late = behindScheduleLabel(work); const suggestion = !work.performerName ? suggestedPerformerForWork(work, performerOptions) : null; const resources = resourceOptions.filter((resource) => !work.locationId || resource.locationId === work.locationId); const proposedValue = localInput(work.scheduledStartAt || work.proposedStartAt); const draftValue = scheduleDrafts[work.id] ?? proposedValue; const scheduleChanged = draftValue !== proposedValue; const editing = editingSetupId === work.id; const showSetupControls = !setupReady || editing; const rowMessage = rowMessages[work.id]; const jobParts = parts.filter((part) => part.workOrderId === work.id && part.status !== "cancelled");
          return <article key={work.id} className={`relative ml-4 py-5 pr-5 sm:ml-6 sm:pr-6 ${index ? "border-t border-slate-200" : ""} ${done ? "bg-slate-50/70" : ""}`}>
            <div className={`absolute -left-[21px] top-7 h-2.5 w-2.5 rounded-full border-2 border-white sm:-left-[29px] ${late ? "bg-red-500" : "bg-slate-300"}`} />
            <div className="grid gap-4 xl:grid-cols-[minmax(260px,0.85fr)_minmax(380px,1.25fr)_170px] xl:items-start">
              <div className="min-w-0 pt-1">
                <div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase ${state.cls}`}>{state.label}</span><h4 className="text-base font-black">{work.title}</h4></div>
                {late ? <div className="mt-1 text-xs font-black text-red-700">{late}</div> : null}
                {work.description ? <p className="mt-1 text-xs leading-5 text-slate-500">{work.description}</p> : null}
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-bold text-slate-500"><span>{labelize(work.category)}</span><span>{money(work.approvedBudget)}</span><span>Labor {hours(work.estimatedLaborMinutes)}</span>{jobParts.length ? <span>{jobParts.length} part{jobParts.length === 1 ? "" : "s"} tracked</span> : <span>No parts tracked</span>}</div>
              </div>

              <div className="min-w-0">
                <div className={`rounded-xl border p-3 ${late ? "border-red-200 bg-red-50/50" : setup.length || execution.length ? "border-amber-200 bg-amber-50/60" : "border-slate-200 bg-slate-50"}`}><div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0 text-xs"><div className="text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">Setup</div><div className="mt-1 font-black">{work.scheduledStartAt ? dateTimeLabel(work.scheduledStartAt) : work.proposedStartAt ? `Suggested: ${dateTimeLabel(work.proposedStartAt)}` : "Time not selected"}</div><div className="mt-1 text-slate-600">{work.performerName || "No performer assigned"} · {work.locationName || "No location selected"}{work.resourceName ? ` · ${work.resourceName}` : ""}</div></div>{!done && !showSetupControls ? <button onClick={() => setEditingSetupId(work.id)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-black">Edit</button> : null}</div>{late ? <div className="mt-3 border-t border-red-200 pt-2 text-xs font-black text-red-700">Exception: {late}</div> : setup.length ? <div className="mt-3 border-t border-amber-200 pt-2 text-xs font-black text-amber-800">Action: {setup[0]}</div> : null}{!late && !setup.length && execution.length ? <div className="mt-3 border-t border-amber-200 pt-2 text-xs font-black text-violet-800">{work.status === "in_progress" ? "Parts / execution: " : "Before start: "}{execution[0]}</div> : null}{!late && !setup.length && !execution.length && !done ? <div className="mt-3 border-t border-slate-200 pt-2 text-xs font-black text-emerald-700">✓ Setup resolved · Ready for execution</div> : null}</div>
                {showSetupControls && !done ? <div className="mt-3 grid gap-2 rounded-xl border border-blue-200 bg-blue-50/40 p-3 sm:grid-cols-2"><div className="sm:col-span-2 flex items-center justify-between"><div className="text-[9px] font-black uppercase text-blue-700">Edit setup</div>{suggestion ? <button disabled={workingId === work.id} onClick={() => void patchWork(work.id, { performerKey: suggestion.key }, `Assigned ${suggestion.displayName}.`)} className="rounded-full bg-blue-100 px-2 py-1 text-[9px] font-black text-blue-800">Suggest {suggestion.displayName}</button> : null}</div><select disabled={workingId === work.id} value={performerKey(work)} onChange={(event) => void patchWork(work.id, { performerKey: event.target.value }, "Partner / technician updated.")} className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs font-bold"><option value="unassigned">Needs assignment</option>{performerOptions.map((option) => <option key={option.key} value={option.key}>{option.displayName}</option>)}</select><select disabled={workingId === work.id} value={work.locationId || ""} onChange={(event) => void patchWork(work.id, { locationId: event.target.value || null }, "Location updated.")} className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs font-bold"><option value="">Location TBD</option>{locationOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select><select disabled={workingId === work.id || !work.locationId} value={work.resourceId || ""} onChange={(event) => void patchWork(work.id, { resourceId: event.target.value || null }, "Resource updated.")} className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs font-bold"><option value="">No resource</option>{resources.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select><input disabled={workingId === work.id} type="datetime-local" value={draftValue} onChange={(event) => setScheduleDrafts((current) => ({ ...current, [work.id]: event.target.value }))} className={`rounded-lg border bg-white px-2 py-2 text-xs font-bold ${scheduleChanged ? "border-blue-400" : "border-slate-200"}`} /><div className="sm:col-span-2 flex gap-2"><button disabled={workingId === work.id || !draftValue || (!scheduleChanged && Boolean(work.scheduledStartAt))} onClick={() => void scheduleWork(work, draftValue)} className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-black text-white disabled:bg-slate-200 disabled:text-slate-400">{work.scheduledStartAt ? (scheduleChanged ? "Save New Time" : "✓ Scheduled") : "Save Schedule"}</button>{editing ? <button onClick={() => setEditingSetupId(null)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-black">Done</button> : null}</div></div> : null}
              </div>

              <div className="flex flex-row gap-2 xl:flex-col xl:pt-1">
                {!done ? <button onClick={() => setPartsWorkOrderId(work.id)} className={`flex-1 rounded-lg border px-3 py-2 text-xs font-black ${work.partsReadyForExecution ? "border-slate-300 bg-white text-slate-700" : "border-amber-300 bg-amber-50 text-amber-800"}`}>Manage Parts</button> : null}
                {work.status === "in_progress" ? <button disabled={workingId === work.id} onClick={() => void patchWork(work.id, { status: "complete" }, "Work completed.")} className="flex-1 rounded-lg bg-slate-950 px-4 py-2 text-xs font-black text-white">Complete</button> : null}
                {canStart ? <button disabled={workingId === work.id} onClick={() => void patchWork(work.id, { status: "in_progress" }, "Work started.")} className="flex-1 rounded-lg bg-emerald-700 px-4 py-2 text-xs font-black text-white">Start Work</button> : null}
                {!done && work.status !== "in_progress" && !canStart ? <div className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-center text-[10px] font-black text-slate-500">Not ready to start</div> : null}
              </div>
            </div>{rowMessage ? <div className={`mt-3 rounded-lg border px-3 py-2 text-xs font-bold ${rowMessage.type === "error" ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{rowMessage.text}</div> : null}
          </article>;
        })}
      </div>
    </section>

    {executionReady ? <div className="pl-4 text-xs font-semibold text-slate-500 sm:pl-6">Setup is complete. Use this page to monitor execution; use the Master Schedule only for cross-vehicle planning.</div> : null}
    {completed === workOrders.length ? <section className="flex items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3"><div className="text-sm font-bold">All authorized work is complete. Next: Final QC.</div><button onClick={() => router.push(`/mindful/inventory/${vehicleId}/qc`)} className="rounded-lg bg-slate-950 px-4 py-2 text-xs font-black text-white">Open Final QC →</button></section> : null}

    {modalWork && modalSuggestion ? <WorkOrderPartsModal vehicleId={vehicleId} workOrderId={modalWork.id} workOrderTitle={modalWork.title} suggestion={modalSuggestion} parts={parts} open onClose={() => setPartsWorkOrderId(null)} /> : null}
  </div>;
}
