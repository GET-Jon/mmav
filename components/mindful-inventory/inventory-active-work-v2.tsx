"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import type {
  InventorySchedulingLocationOption,
  InventorySchedulingResourceOption,
  InventoryWorkOrderView,
} from "@/lib/mindful-inventory/active-work";
import { suggestedPerformerForWork, type InventoryPerformerOption } from "@/lib/mindful-inventory/performers";

function money(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function hours(minutes: number | null | undefined) {
  return minutes == null ? "—" : `${Math.round((minutes / 60) * 10) / 10} hr`;
}

function labelize(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function dateTimeLabel(value: string | null) {
  return value
    ? new Date(value).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : "Not scheduled";
}

function localInput(value: string | null) {
  if (!value) return "";
  const d = new Date(value);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function performerKey(work: InventoryWorkOrderView) {
  if (work.assignedPartnerId) return `partner:${work.assignedPartnerId}`;
  if (work.assignedUserId) return `user:${work.assignedUserId}`;
  return "unassigned";
}

function estimateIssue(work: InventoryWorkOrderView) {
  if (!work.assignedPartnerId) return null;
  if (work.partnerEstimateStatus === "awaiting_estimate") return "Partner labor estimate required";
  if (work.partnerEstimateStatus === "awaiting_review") return "Partner labor estimate needs manager approval";
  if (work.partnerEstimateStatus === "revision_requested") return "Waiting for revised partner labor estimate";
  return null;
}

function setupIssues(work: InventoryWorkOrderView) {
  if (["complete", "cancelled"].includes(work.status)) return [];
  const issues: string[] = [];
  if (!work.performerName) issues.push("Assign a partner or technician");
  if (!work.locationId) issues.push("Choose a work location");
  if (work.partnerConfirmationStatus === "awaiting_partner") {
    issues.push(work.proposedStartAt
      ? `Waiting for ${work.performerName || "partner"} to confirm ${dateTimeLabel(work.proposedStartAt)}`
      : `Waiting for ${work.performerName || "partner"} to confirm timing`);
  } else if (!work.scheduledStartAt) {
    issues.push(work.proposedStartAt
      ? `Suggested slot ${dateTimeLabel(work.proposedStartAt)} has not been confirmed`
      : "Choose a start time");
  }
  return issues;
}

function executionIssues(work: InventoryWorkOrderView) {
  if (["complete", "cancelled"].includes(work.status)) return [];
  const issues = [...setupIssues(work)];
  const estimate = estimateIssue(work);
  if (estimate) issues.push(estimate);
  if (!work.partsReadyForExecution) {
    issues.push(work.pendingPartCount
      ? `${work.pendingPartCount} tracked part${work.pendingPartCount === 1 ? " is" : "s are"} not ready`
      : "Parts are not ready");
  }
  if (work.status === "blocked") issues.push(work.blockerReason ? `Blocked: ${work.blockerReason}` : "Work Order is blocked");
  return issues;
}

function stateFor(work: InventoryWorkOrderView) {
  if (work.status === "complete") return { label: "Complete", cls: "bg-emerald-100 text-emerald-800" };
  if (work.status === "in_progress") return { label: "In Progress", cls: "bg-blue-100 text-blue-800" };
  if (work.status === "blocked") return { label: "Blocked", cls: "bg-red-100 text-red-800" };
  if (work.partnerConfirmationStatus === "awaiting_partner") return { label: "Awaiting Partner", cls: "bg-blue-100 text-blue-800" };
  if (!work.performerName) return { label: "Needs Assignment", cls: "bg-amber-100 text-amber-800" };
  if (!work.locationId) return { label: "Needs Location", cls: "bg-amber-100 text-amber-800" };
  if (!work.scheduledStartAt) return { label: work.proposedStartAt ? "Suggested Slot" : "Needs Time", cls: "bg-amber-100 text-amber-800" };
  const estimate = estimateIssue(work);
  if (estimate) return { label: "Estimate Pending", cls: "bg-violet-100 text-violet-800" };
  if (!work.partsReadyForExecution) return { label: "Waiting on Parts", cls: "bg-amber-100 text-amber-800" };
  return { label: "Ready", cls: "bg-emerald-100 text-emerald-800" };
}

type VehicleContext = {
  year: number;
  make: string;
  model: string;
  trim: string | null;
  vin: string | null;
  stockNumber: string | null;
};

export function InventoryActiveWork({ vehicleId, vehicle, workOrders, performerOptions, locationOptions, resourceOptions }: {
  vehicleId: string;
  vehicle: VehicleContext;
  workOrders: InventoryWorkOrderView[];
  performerOptions: InventoryPerformerOption[];
  locationOptions: InventorySchedulingLocationOption[];
  resourceOptions: InventorySchedulingResourceOption[];
}) {
  const router = useRouter();
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [editingSetupId, setEditingSetupId] = useState<string | null>(null);
  const [scheduleDrafts, setScheduleDrafts] = useState<Record<string, string>>({});
  const [rowMessages, setRowMessages] = useState<Record<string, { type: "success" | "error"; text: string }>>({});

  const openWork = workOrders.filter((work) => !["complete", "cancelled"].includes(work.status));
  const completed = workOrders.length - openWork.length;
  const activeBudget = workOrders.reduce((sum, work) => sum + work.approvedBudget, 0);
  const totalLabor = workOrders.reduce((sum, work) => sum + (work.estimatedLaborMinutes || 0), 0);
  const setupIncomplete = openWork.filter((work) => setupIssues(work).length > 0);
  const partsOutstanding = openWork.filter((work) => !work.partsReadyForExecution);
  const estimateOutstanding = openWork.filter((work) => Boolean(estimateIssue(work)));
  const blocked = openWork.filter((work) => work.status === "blocked");
  const setupReady = openWork.length > 0 && setupIncomplete.length === 0;
  const executionReady = setupReady && partsOutstanding.length === 0 && estimateOutstanding.length === 0 && blocked.length === 0;
  const nextWork = useMemo(() => [...openWork].sort((a, b) => {
    if (a.status === "in_progress" && b.status !== "in_progress") return -1;
    if (b.status === "in_progress" && a.status !== "in_progress") return 1;
    const at = a.scheduledStartAt || a.proposedStartAt;
    const bt = b.scheduledStartAt || b.proposedStartAt;
    if (!at) return 1;
    if (!bt) return -1;
    return new Date(at).getTime() - new Date(bt).getTime();
  })[0] || null, [openWork]);

  const awaitingConfirmationCount = openWork.filter((w) => w.partnerConfirmationStatus === "awaiting_partner").length;
  const needsTimeCount = openWork.filter((w) => w.partnerConfirmationStatus !== "awaiting_partner" && !w.scheduledStartAt).length;
  const needsAssignmentCount = openWork.filter((w) => !w.performerName).length;
  const needsLocationCount = openWork.filter((w) => !w.locationId).length;

  async function patchWork(workOrderId: string, body: Record<string, unknown>, success: string) {
    setWorkingId(workOrderId);
    setMessage("");
    setRowMessages((current) => { const next = { ...current }; delete next[workOrderId]; return next; });
    try {
      const response = await fetch(`/api/mindful/inventory/work-orders/${workOrderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Failed to update Work Order.");
      setRowMessages((current) => ({ ...current, [workOrderId]: { type: "success", text: success } }));
      setMessage(success);
      router.refresh();
    } catch (error) {
      const text = error instanceof Error ? error.message : "Failed to update Work Order.";
      setRowMessages((current) => ({ ...current, [workOrderId]: { type: "error", text } }));
      setMessage(text);
    } finally {
      setWorkingId(null);
    }
  }

  async function scheduleWork(work: InventoryWorkOrderView, value: string) {
    if (!value) return;
    setWorkingId(work.id);
    setRowMessages((current) => { const next = { ...current }; delete next[work.id]; return next; });
    try {
      const response = await fetch(`/api/mindful/inventory/work-orders/${work.id}/schedule`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduledStartAt: new Date(value).toISOString() }),
      });
      const payload = await response.json() as { error?: string; warning?: string };
      if (!response.ok) throw new Error(payload.error || "Failed to schedule Work Order.");
      const text = payload.warning || (work.partnerConfirmationStatus === "awaiting_partner" ? "Proposed schedule confirmed manually." : "Schedule saved.");
      setScheduleDrafts((current) => { const next = { ...current }; delete next[work.id]; return next; });
      setRowMessages((current) => ({ ...current, [work.id]: { type: "success", text } }));
      setEditingSetupId(null);
      router.refresh();
    } catch (error) {
      const text = error instanceof Error ? error.message : "Failed to schedule Work Order.";
      setRowMessages((current) => ({ ...current, [work.id]: { type: "error", text } }));
    } finally {
      setWorkingId(null);
    }
  }

  if (!workOrders.length) {
    return <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">Active Work</div>
      <h2 className="mt-1 text-2xl font-black">No Work Orders yet</h2>
      <p className="mt-2 text-sm text-slate-500">Approve the Work Plan first. Activation creates Work Orders and suggested execution timing.</p>
      <button onClick={() => router.push(`/mindful/inventory/${vehicleId}/car-plan`)} className="mt-5 rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white">Open Work Plan →</button>
    </section>;
  }

  return <div className="space-y-4">
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">Active Work</div>
          {nextWork ? <>
            <div className="mt-2 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">{nextWork.status === "in_progress" ? "Happening now" : "Next work"}</div>
            <div className="mt-1 text-lg font-black">{nextWork.title}</div>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm font-semibold text-slate-600">
              <span>{dateTimeLabel(nextWork.scheduledStartAt || nextWork.proposedStartAt)}</span>
              <span>{nextWork.performerName || "Performer not assigned"}</span>
              <span>{nextWork.locationName || "Location not selected"}{nextWork.resourceName ? ` · ${nextWork.resourceName}` : ""}</span>
            </div>
          </> : <div className="mt-2 text-lg font-black">All authorized work is complete.</div>}
        </div>
        <div className="flex flex-wrap gap-2 lg:justify-end">
          <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-700">{completed}/{workOrders.length} complete</span>
          <span className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-black text-blue-700">{hours(totalLabor)} labor</span>
          <span className="rounded-full bg-slate-950 px-3 py-1.5 text-xs font-black text-white">{money(activeBudget)} budget</span>
        </div>
      </div>
      {message ? <div className="mt-3 text-sm font-bold text-slate-600">{message}</div> : null}
    </section>

    {openWork.length ? (
      !setupReady ? <section className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.1em] text-amber-700">Finish work setup</div>
            <div className="mt-1 text-sm font-black text-slate-950">Lot Logic could not fully schedule {setupIncomplete.length} Work Order{setupIncomplete.length === 1 ? "" : "s"}. The reason is shown on each job below.</div>
          </div>
          <div className="flex flex-wrap gap-2">
            {awaitingConfirmationCount ? <span className="rounded-full bg-blue-100 px-3 py-1 text-[10px] font-black text-blue-800">{awaitingConfirmationCount} awaiting confirmation</span> : null}
            {needsTimeCount ? <span className="rounded-full bg-amber-100 px-3 py-1 text-[10px] font-black text-amber-800">{needsTimeCount} need time</span> : null}
            {needsAssignmentCount ? <span className="rounded-full bg-amber-100 px-3 py-1 text-[10px] font-black text-amber-800">{needsAssignmentCount} unassigned</span> : null}
            {needsLocationCount ? <span className="rounded-full bg-amber-100 px-3 py-1 text-[10px] font-black text-amber-800">{needsLocationCount} need location</span> : null}
          </div>
        </div>
      </section> : partsOutstanding.length ? <section className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div><div className="text-[10px] font-black uppercase tracking-[0.1em] text-amber-700">Scheduling complete</div><div className="mt-1 text-sm font-black">Parts need attention before execution.</div></div>
          <Link href={`/mindful/inventory/${vehicleId}/parts`} className="rounded-xl bg-amber-900 px-4 py-2 text-xs font-black text-white">Manage Parts →</Link>
        </div>
      </section> : estimateOutstanding.length ? <section className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-4">
        <div className="text-[10px] font-black uppercase tracking-[0.1em] text-violet-700">Scheduling complete</div>
        <div className="mt-1 text-sm font-black">{estimateOutstanding.length} partner estimate{estimateOutstanding.length === 1 ? " still needs" : "s still need"} resolution before work can begin.</div>
      </section> : blocked.length ? <section className="rounded-2xl border border-red-200 bg-red-50 px-4 py-4"><div className="text-[10px] font-black uppercase text-red-700">Setup complete · Blocked</div><div className="mt-1 text-sm font-black">Resolve the blocker before execution.</div></section> : <section className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div><div className="text-[10px] font-black uppercase tracking-[0.1em] text-emerald-700">✓ Work setup complete</div><div className="mt-1 text-sm font-black">All open Work Orders are assigned, scheduled, and ready for execution.</div></div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/mindful/inventory/${vehicleId}`} className="rounded-xl bg-slate-950 px-4 py-2 text-xs font-black text-white">Back to Inventory →</Link>
            <Link href="/mindful/inventory/schedule" className="rounded-xl border border-emerald-300 bg-white px-4 py-2 text-xs font-black text-emerald-800">View Master Schedule</Link>
          </div>
        </div>
      </section>
    ) : null}

    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
        <h3 className="text-sm font-black">Execution plan</h3>
        <p className="mt-0.5 text-[11px] text-slate-500">Each job shows what is confirmed, what still needs action, and whether it can begin.</p>
      </div>
      <div className="divide-y divide-slate-200">
        {workOrders.map((work) => {
          const done = ["complete", "cancelled"].includes(work.status);
          const setup = setupIssues(work);
          const execution = executionIssues(work);
          const canStart = !done && work.status !== "in_progress" && execution.length === 0;
          const state = stateFor(work);
          const suggestion = !work.performerName ? suggestedPerformerForWork(work, performerOptions) : null;
          const resources = resourceOptions.filter((resource) => !work.locationId || resource.locationId === work.locationId);
          const proposedValue = localInput(work.scheduledStartAt || work.proposedStartAt);
          const draftValue = scheduleDrafts[work.id] ?? proposedValue;
          const scheduleChanged = draftValue !== proposedValue;
          const showSetupControls = !setupReady || editingSetupId === work.id;
          const rowMessage = rowMessages[work.id];

          return <article key={work.id} className={`p-4 ${done ? "bg-slate-50/70" : ""}`}>
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_430px_auto] xl:items-start">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase ${state.cls}`}>{state.label}</span>
                  <h4 className="text-base font-black">{work.title}</h4>
                </div>
                {work.description ? <p className="mt-1 text-xs leading-5 text-slate-500">{work.description}</p> : null}
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-bold text-slate-500">
                  <span>{labelize(work.category)}</span><span>{money(work.approvedBudget)}</span><span>Labor {hours(work.estimatedLaborMinutes)}</span>
                </div>
                <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs">
                  <div className="font-black text-slate-900">{work.scheduledStartAt ? `Scheduled ${dateTimeLabel(work.scheduledStartAt)}` : work.proposedStartAt ? `Suggested ${dateTimeLabel(work.proposedStartAt)}` : "No time selected"}</div>
                  <div className="mt-1 text-slate-600">{work.performerName || "No performer assigned"} · {work.locationName || "No location selected"}{work.resourceName ? ` · ${work.resourceName}` : ""}</div>
                  {setup.length ? <div className="mt-2 space-y-1">{setup.map((issue) => <div key={issue} className="font-black text-amber-800">Action: {issue}</div>)}</div> : <div className="mt-2 font-black text-emerald-700">✓ Schedule and assignment resolved</div>}
                  {!setup.length && execution.length ? <div className="mt-2 space-y-1">{execution.map((issue) => <div key={issue} className="font-black text-violet-800">Before start: {issue}</div>)}</div> : null}
                </div>
              </div>

              {showSetupControls && !done ? <div className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2">
                <div className="sm:col-span-2 flex items-center justify-between gap-2"><div className="text-[9px] font-black uppercase text-slate-400">Work setup</div>{suggestion ? <button disabled={workingId === work.id} onClick={() => void patchWork(work.id, { performerKey: suggestion.key }, `Assigned ${suggestion.displayName}.`)} className="rounded-full bg-blue-50 px-2 py-1 text-[9px] font-black text-blue-700">Suggest {suggestion.displayName}</button> : null}</div>
                <select disabled={workingId === work.id} value={performerKey(work)} onChange={(event) => void patchWork(work.id, { performerKey: event.target.value }, "Partner / technician updated.")} className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs font-bold">
                  <option value="unassigned">Needs assignment</option>
                  <optgroup label="Partners">{performerOptions.filter((option) => option.type === "partner").map((option) => <option key={option.key} value={option.key}>{option.displayName}{option.secondaryLabel ? ` · ${option.secondaryLabel}` : ""}</option>)}</optgroup>
                  <optgroup label="Mindful Team">{performerOptions.filter((option) => option.type === "internal").map((option) => <option key={option.key} value={option.key}>{option.displayName}</option>)}</optgroup>
                </select>
                <select disabled={workingId === work.id} value={work.locationId || ""} onChange={(event) => void patchWork(work.id, { locationId: event.target.value || null }, "Location updated.")} className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs font-bold">
                  <option value="">Location TBD</option>{locationOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
                </select>
                <select disabled={workingId === work.id || !work.locationId} value={work.resourceId || ""} onChange={(event) => void patchWork(work.id, { resourceId: event.target.value || null }, "Resource updated.")} className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs font-bold">
                  <option value="">No resource</option>{resources.map((option) => <option key={option.id} value={option.id}>{option.name} · {labelize(option.resourceType)}</option>)}
                </select>
                <input disabled={workingId === work.id} type="datetime-local" value={draftValue} onChange={(event) => setScheduleDrafts((current) => ({ ...current, [work.id]: event.target.value }))} className={`rounded-lg border bg-white px-2 py-2 text-xs font-bold ${scheduleChanged ? "border-blue-400" : "border-slate-200"}`} />
                <div className="sm:col-span-2 flex flex-wrap gap-2">
                  {work.partnerConfirmationStatus === "awaiting_partner" ? <span className="flex-1 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-black text-blue-800">Waiting for partner confirmation{work.proposedStartAt ? ` of ${dateTimeLabel(work.proposedStartAt)}` : ""}.</span> : null}
                  <button disabled={workingId === work.id || !draftValue || (!scheduleChanged && Boolean(work.scheduledStartAt))} onClick={() => void scheduleWork(work, draftValue)} className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-black text-white disabled:bg-slate-200 disabled:text-slate-400">
                    {workingId === work.id ? "Saving…" : work.partnerConfirmationStatus === "awaiting_partner" ? "Confirm Manually" : work.scheduledStartAt ? (scheduleChanged ? "Save New Time" : "✓ Scheduled") : work.proposedStartAt ? "Use Suggested Slot" : "Save Schedule"}
                  </button>
                  {setupReady ? <button onClick={() => setEditingSetupId(null)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-black">Done</button> : null}
                </div>
              </div> : <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
                <div className="text-[9px] font-black uppercase text-slate-400">Confirmed setup</div>
                <div className="mt-2 font-black">{dateTimeLabel(work.scheduledStartAt)}</div>
                <div className="mt-1 text-slate-600">{work.performerName} · {work.locationName}{work.resourceName ? ` · ${work.resourceName}` : ""}</div>
                {!done ? <button onClick={() => setEditingSetupId(work.id)} className="mt-3 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-black">Edit Setup</button> : null}
              </div>}

              <div className="flex min-w-[120px] flex-col gap-2">
                {work.status === "in_progress" ? <button disabled={workingId === work.id} onClick={() => void patchWork(work.id, { status: "complete" }, "Work completed.")} className="rounded-lg bg-slate-950 px-4 py-2 text-xs font-black text-white">Complete</button> : null}
                {canStart ? <button disabled={workingId === work.id} onClick={() => void patchWork(work.id, { status: "in_progress" }, "Work started.")} className="rounded-lg bg-emerald-700 px-4 py-2 text-xs font-black text-white">Start Work</button> : null}
                {!done && work.status !== "in_progress" && !canStart ? <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-center text-[10px] font-black text-slate-500">Not ready to start</div> : null}
                {!done && !showSetupControls ? <Link href={`/mindful/inventory/${vehicleId}/parts`} className={`${!work.partsReadyForExecution ? "block" : "hidden"} rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-center text-xs font-black text-amber-800`}>Manage Parts</Link> : null}
              </div>
            </div>
            {rowMessage ? <div role="alert" className={`mt-3 rounded-lg border px-3 py-2 text-xs font-bold ${rowMessage.type === "error" ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{rowMessage.text}</div> : null}
          </article>;
        })}
      </div>
    </section>

    {executionReady ? <div className="text-xs font-semibold text-slate-500">Setup is complete. Use this page to monitor execution; use the Master Schedule only when you need cross-vehicle planning.</div> : null}

    {completed === workOrders.length ? <section className="flex flex-col gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"><div><span className="text-xs font-black uppercase text-emerald-700">Execution Complete</span><span className="ml-3 text-sm font-bold text-slate-700">All authorized work is complete. Next: Final QC.</span></div><button onClick={() => router.push(`/mindful/inventory/${vehicleId}/qc`)} className="rounded-lg bg-slate-950 px-4 py-2 text-xs font-black text-white">Open Final QC →</button></section> : null}
  </div>;
}
