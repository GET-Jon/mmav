"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import type { PartnerPortalPermissions } from "@/lib/partner-portal/access";
import type { PartnerWorkItem } from "@/lib/partner-portal/work";

function money(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function hours(minutes: number | null) {
  if (minutes == null) return "—";
  return `${Math.round((minutes / 60) * 10) / 10} hr`;
}

function dateTime(value: string | null) {
  if (!value) return "Not scheduled";
  return new Date(value).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function localInputValue(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function label(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function mileage(value: number | null) {
  return value == null ? "—" : `${new Intl.NumberFormat("en-US").format(value)} mi`;
}

function scheduleDurationMinutes(work: PartnerWorkItem) {
  if (work.latestEstimate?.estimatedElapsedMinutes && work.latestEstimate.estimatedElapsedMinutes > 0) return work.latestEstimate.estimatedElapsedMinutes;
  const start = work.proposedStartAt || work.scheduledStartAt;
  const end = work.proposedEndAt || work.scheduledEndAt;
  if (start && end) {
    const minutes = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60_000);
    if (Number.isFinite(minutes) && minutes > 0) return minutes;
  }
  return 60;
}

function endFromStart(startValue: string, durationMinutes: number) {
  if (!startValue) return "";
  const start = new Date(startValue);
  if (Number.isNaN(start.getTime())) return "";
  return localInputValue(new Date(start.getTime() + durationMinutes * 60_000).toISOString());
}

async function responsePayload(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!text.trim()) return {};
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
  } catch {
    return { error: `Server returned an unreadable response (${response.status}).` };
  }
}

export function PartnerWorkListV2({ workItems, permissions }: { workItems: PartnerWorkItem[]; permissions: PartnerPortalPermissions }) {
  const router = useRouter();
  const [editingEstimateId, setEditingEstimateId] = useState<string | null>(null);
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);
  const [editingLogistics, setEditingLogistics] = useState<{ workId: string; kind: "location" | "parts" } | null>(null);
  const [logisticsNotes, setLogisticsNotes] = useState<Record<string, string>>({});
  const [vehicleModalId, setVehicleModalId] = useState<string | null>(null);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [message, setMessage] = useState<Record<string, string>>({});
  const [drafts, setDrafts] = useState<Record<string, { cost: string; laborHours: string; elapsedHours: string; notes: string }>>({});
  const [scheduleDrafts, setScheduleDrafts] = useState<Record<string, { startAt: string; endAt: string }>>({});

  function draftFor(work: PartnerWorkItem) {
    return drafts[work.id] ?? {
      cost: work.latestEstimate?.quotedCost == null ? "" : String(work.latestEstimate.quotedCost),
      laborHours: work.latestEstimate?.estimatedLaborMinutes == null ? "" : String(Math.round(work.latestEstimate.estimatedLaborMinutes / 6) / 10),
      elapsedHours: work.latestEstimate?.estimatedElapsedMinutes == null ? "" : String(Math.round(work.latestEstimate.estimatedElapsedMinutes / 6) / 10),
      notes: work.latestEstimate?.notes ?? "",
    };
  }

  function scheduleDraftFor(work: PartnerWorkItem) {
    return scheduleDrafts[work.id] ?? {
      startAt: localInputValue(work.scheduledStartAt || work.proposedStartAt),
      endAt: localInputValue(work.scheduledEndAt || work.proposedEndAt),
    };
  }

  function logisticsKey(work: PartnerWorkItem, kind: "location" | "parts") {
    return `${work.id}:${kind}`;
  }

  function updateDraft(work: PartnerWorkItem, key: "cost" | "laborHours" | "elapsedHours" | "notes", value: string) {
    setDrafts((current) => ({ ...current, [work.id]: { ...draftFor(work), [key]: value } }));
  }

  function updateScheduleStart(work: PartnerWorkItem, value: string) {
    setScheduleDrafts((current) => ({
      ...current,
      [work.id]: { ...scheduleDraftFor(work), startAt: value, endAt: endFromStart(value, scheduleDurationMinutes(work)) },
    }));
  }

  async function submitEstimate(work: PartnerWorkItem) {
    const draft = draftFor(work);
    setWorkingId(work.id);
    setMessage((current) => ({ ...current, [work.id]: "" }));
    try {
      const response = await fetch(`/api/intelligence/work-orders/${work.id}/estimate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quotedCost: draft.cost.trim() ? Number(draft.cost) : null,
          estimatedLaborMinutes: draft.laborHours.trim() ? Math.round(Number(draft.laborHours) * 60) : null,
          estimatedElapsedMinutes: draft.elapsedHours.trim() ? Math.round(Number(draft.elapsedHours) * 60) : null,
          notes: draft.notes,
        }),
      });
      const payload = await responsePayload(response);
      if (!response.ok) throw new Error(String(payload.error || `Estimate could not be submitted (${response.status}).`));
      setEditingEstimateId(null);
      setMessage((current) => ({
        ...current,
        [work.id]: payload.approvalStatus === "approved"
          ? "Labor estimate approved. Work may begin when you are ready."
          : "Labor estimate submitted. Approval is required before work can begin.",
      }));
      router.refresh();
    } catch (error) {
      setMessage((current) => ({ ...current, [work.id]: error instanceof Error ? error.message : "Estimate could not be submitted." }));
    } finally {
      setWorkingId(null);
    }
  }

  async function saveScheduleValues(work: PartnerWorkItem, startAt: string, endAt: string, successMessage: string) {
    setWorkingId(work.id);
    setMessage((current) => ({ ...current, [work.id]: "" }));
    try {
      const response = await fetch(`/api/partner/work-orders/${work.id}/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startAt, endAt }),
      });
      const payload = await responsePayload(response);
      if (!response.ok) throw new Error(String(payload.error || `Schedule could not be updated (${response.status}).`));
      setEditingScheduleId(null);
      setScheduleDrafts((current) => { const next = { ...current }; delete next[work.id]; return next; });
      setMessage((current) => ({ ...current, [work.id]: successMessage }));
      router.refresh();
    } catch (error) {
      setMessage((current) => ({ ...current, [work.id]: error instanceof Error ? error.message : "Schedule could not be updated." }));
    } finally {
      setWorkingId(null);
    }
  }

  async function confirmRequestedSchedule(work: PartnerWorkItem) {
    const startAt = localInputValue(work.proposedStartAt || work.scheduledStartAt);
    const endAt = localInputValue(work.proposedEndAt || work.scheduledEndAt);
    if (!startAt || !endAt) {
      setMessage((current) => ({ ...current, [work.id]: "There is no complete requested schedule to confirm yet." }));
      return;
    }
    await saveScheduleValues(work, startAt, endAt, "Requested schedule confirmed.");
  }

  async function saveSchedule(work: PartnerWorkItem) {
    const draft = scheduleDraftFor(work);
    await saveScheduleValues(work, draft.startAt, draft.endAt, "Schedule updated and confirmed.");
  }

  async function updateLogistics(work: PartnerWorkItem, kind: "location" | "parts", action: "confirm" | "adjust") {
    const key = logisticsKey(work, kind);
    const note = logisticsNotes[key] || "";
    setWorkingId(work.id);
    setMessage((current) => ({ ...current, [work.id]: "" }));
    try {
      const response = await fetch(`/api/partner/work-orders/${work.id}/logistics`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, action, note }),
      });
      const payload = await responsePayload(response);
      if (!response.ok) throw new Error(String(payload.error || `Could not update ${kind} (${response.status}).`));
      setEditingLogistics(null);
      setMessage((current) => ({
        ...current,
        [work.id]: action === "confirm"
          ? `${kind === "location" ? "Work location" : "Parts"} confirmed.`
          : `${kind === "location" ? "Location change" : "Parts issue"} sent to the dealer.`,
      }));
      router.refresh();
    } catch (error) {
      setMessage((current) => ({ ...current, [work.id]: error instanceof Error ? error.message : `Could not update ${kind}.` }));
    } finally {
      setWorkingId(null);
    }
  }

  async function setStatus(work: PartnerWorkItem, status: "in_progress" | "complete") {
    setWorkingId(work.id);
    setMessage((current) => ({ ...current, [work.id]: "" }));
    try {
      const response = await fetch(`/api/partner/work-orders/${work.id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const payload = await responsePayload(response);
      if (!response.ok) throw new Error(String(payload.error || `Work Order could not be updated (${response.status}).`));
      setMessage((current) => ({ ...current, [work.id]: status === "complete" ? "Work marked complete." : "Work started." }));
      router.refresh();
    } catch (error) {
      setMessage((current) => ({ ...current, [work.id]: error instanceof Error ? error.message : "Work Order could not be updated." }));
    } finally {
      setWorkingId(null);
    }
  }

  if (!permissions.viewAssignedWork) return <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm font-semibold text-amber-900">Assigned Work access is not enabled for this partner account.</div>;
  if (!workItems.length) return <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center"><div className="text-lg font-black">No assigned work right now</div><p className="mt-2 text-sm text-slate-500">New Work Orders assigned to you will appear here.</p></div>;

  const modalWork = vehicleModalId ? workItems.find((work) => work.id === vehicleModalId) ?? null : null;

  return <>
    <div className="space-y-4">
      {workItems.map((work) => {
        const draft = draftFor(work);
        const scheduleDraft = scheduleDraftFor(work);
        const requestedStart = work.proposedStartAt || work.scheduledStartAt;
        const requestedEnd = work.proposedEndAt || work.scheduledEndAt;
        const scheduleConfirmed = work.partnerConfirmationStatus === "confirmed";
        const confirmedDiffers = Boolean(scheduleConfirmed && work.proposedStartAt && work.scheduledStartAt && work.scheduledStartAt !== work.proposedStartAt);
        const locationConfirmed = work.partnerLocationConfirmationStatus === "confirmed";
        const locationAdjustmentRequested = work.partnerLocationConfirmationStatus === "adjustment_requested";
        const partsConfirmed = work.partnerPartsConfirmationStatus === "confirmed";
        const partsIssueReported = work.partnerPartsConfirmationStatus === "issue_reported";
        const estimateGate = work.partnerEstimateStatus || (permissions.editEstimate ? "awaiting_estimate" : "not_required");
        const estimateApproved = estimateGate === "approved" || estimateGate === "not_required";
        const needsEstimate = permissions.editEstimate && (!work.latestEstimate || estimateGate === "awaiting_estimate" || estimateGate === "revision_requested");
        const awaitingReview = estimateGate === "awaiting_review";
        const canStart = permissions.startWork && estimateApproved && !["in_progress", "complete", "cancelled"].includes(work.status);
        const canComplete = permissions.completeWork && work.status === "in_progress";
        const hasParts = work.parts.length > 0;
        const locationKey = logisticsKey(work, "location");
        const partsKey = logisticsKey(work, "parts");

        return <section key={work.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h2 className="text-xl font-black">{work.title}</h2>
                {work.description ? <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">{work.description}</p> : null}
              </div>
              <span className="self-start rounded-full bg-white px-3 py-1.5 text-xs font-black text-slate-700 shadow-sm">{label(work.status)}</span>
            </div>
          </div>

          <div className="grid gap-3 px-5 pt-5 sm:grid-cols-2">
            <button onClick={() => setVehicleModalId(work.id)} className="rounded-xl border border-slate-200 bg-white p-4 text-left hover:border-blue-300">
              <div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">Vehicle</div>
              <div className="mt-1 text-sm font-black text-blue-700">{work.vehicleLabel}</div>
              <div className="mt-1 text-xs text-slate-500">{mileage(work.mileage)}{work.stockNumber ? ` · Stock ${work.stockNumber}` : ""} · View details</div>
            </button>
            <button onClick={() => setVehicleModalId(work.id)} className="rounded-xl border border-slate-200 bg-white p-4 text-left hover:border-blue-300">
              <div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">VIN</div>
              <div className="mt-1 font-mono text-sm font-black">{work.vin || "—"}</div>
              <div className="mt-1 text-xs text-slate-500">View full vehicle details</div>
            </button>
          </div>

          <div className="grid gap-5 p-5 xl:grid-cols-2">
            <div className="space-y-3">
              <div className="rounded-xl border border-slate-200 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">Schedule</div>
                    <div className="mt-1 text-sm font-black">{dateTime(requestedStart)}</div>
                    {requestedEnd ? <div className="mt-1 text-xs text-slate-500">Requested completion: {dateTime(requestedEnd)}</div> : null}
                    {scheduleConfirmed ? <div className="mt-2 text-xs font-black text-emerald-700">{confirmedDiffers ? `Confirmed: ${dateTime(work.scheduledStartAt)} → ${dateTime(work.scheduledEndAt)}` : "Schedule confirmed"}</div> : <div className="mt-2 text-xs font-bold text-amber-700">Waiting for your confirmation</div>}
                  </div>
                  {permissions.rescheduleWork && !["in_progress", "complete", "cancelled"].includes(work.status) ? <div className="flex shrink-0 gap-2">
                    {!scheduleConfirmed ? <button disabled={workingId === work.id} onClick={() => void confirmRequestedSchedule(work)} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-black text-white hover:bg-emerald-700 disabled:opacity-40">Confirm</button> : <span className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700 ring-1 ring-inset ring-emerald-200">✓ Confirmed</span>}
                    <button onClick={() => setEditingScheduleId(editingScheduleId === work.id ? null : work.id)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-black">Adjust</button>
                  </div> : null}
                </div>
                {editingScheduleId === work.id ? <div className="mt-4 grid gap-3 border-t border-slate-200 pt-4 sm:grid-cols-2">
                  <label className="text-xs font-black text-slate-600">Planned start<input type="datetime-local" value={scheduleDraft.startAt} onChange={(event) => updateScheduleStart(work, event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold" /></label>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"><div className="text-xs font-black text-slate-600">Projected completion</div><div className="mt-1 text-sm font-black">{scheduleDraft.endAt ? dateTime(new Date(scheduleDraft.endAt).toISOString()) : "Choose a start time"}</div><div className="mt-1 text-[11px] text-slate-500">Based on {hours(scheduleDurationMinutes(work))} expected turnaround.</div></div>
                  <div className="flex gap-2 sm:col-span-2"><button disabled={workingId === work.id} onClick={() => void saveSchedule(work)} className="rounded-lg bg-slate-950 px-4 py-2 text-xs font-black text-white disabled:opacity-40">Save Schedule</button><button onClick={() => setEditingScheduleId(null)} className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-black">Cancel</button></div>
                </div> : null}
              </div>

              <div className="rounded-xl border border-slate-200 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">Location</div>
                    <div className="mt-1 text-sm font-black">{work.locationName || "Work location not yet set"}</div>
                    <div className="mt-1 text-xs text-slate-500">Where this work is expected to be performed.</div>
                    {locationConfirmed ? <div className="mt-2 text-xs font-black text-emerald-700">Location confirmed</div> : locationAdjustmentRequested ? <div className="mt-2 text-xs font-black text-amber-700">Change requested</div> : <div className="mt-2 text-xs font-bold text-amber-700">Waiting for your confirmation</div>}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {!locationConfirmed ? <button disabled={workingId === work.id || !work.locationName} onClick={() => void updateLogistics(work, "location", "confirm")} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-black text-white hover:bg-emerald-700 disabled:opacity-40">Confirm</button> : <span className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700 ring-1 ring-inset ring-emerald-200">✓ Confirmed</span>}
                    <button onClick={() => setEditingLogistics(editingLogistics?.workId === work.id && editingLogistics.kind === "location" ? null : { workId: work.id, kind: "location" })} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-black">Adjust</button>
                  </div>
                </div>
                {editingLogistics?.workId === work.id && editingLogistics.kind === "location" ? <div className="mt-4 border-t border-slate-200 pt-4"><label className="text-xs font-black text-slate-600">What location should change?<textarea rows={2} value={logisticsNotes[locationKey] ?? work.partnerLocationRequest ?? ""} onChange={(event) => setLogisticsNotes((current) => ({ ...current, [locationKey]: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold" placeholder="Example: Please schedule this at my shop instead." /></label><div className="mt-3 flex gap-2"><button disabled={workingId === work.id} onClick={() => void updateLogistics(work, "location", "adjust")} className="rounded-lg bg-slate-950 px-4 py-2 text-xs font-black text-white disabled:opacity-40">Send Request</button><button onClick={() => setEditingLogistics(null)} className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-black">Cancel</button></div></div> : null}
              </div>

              <div className={`rounded-xl border p-4 ${hasParts ? "border-slate-200" : "border-slate-200 bg-slate-50 opacity-55"}`}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">Parts</div>
                    <div className="mt-1 text-sm font-black">{hasParts ? `${work.parts.length} tracked part${work.parts.length === 1 ? "" : "s"}` : "No parts required"}</div>
                    {hasParts ? <div className="mt-1 text-xs text-slate-500">Review the parts expected for this work.</div> : <div className="mt-1 text-xs text-slate-400">Nothing to confirm for this job.</div>}
                    {hasParts ? (partsConfirmed ? <div className="mt-2 text-xs font-black text-emerald-700">Parts confirmed</div> : partsIssueReported ? <div className="mt-2 text-xs font-black text-amber-700">Issue reported</div> : <div className="mt-2 text-xs font-bold text-amber-700">Waiting for your confirmation</div>) : null}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {hasParts && !partsConfirmed ? <button disabled={workingId === work.id} onClick={() => void updateLogistics(work, "parts", "confirm")} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-black text-white hover:bg-emerald-700 disabled:opacity-40">Confirm</button> : hasParts && partsConfirmed ? <span className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700 ring-1 ring-inset ring-emerald-200">✓ Confirmed</span> : <button disabled className="rounded-lg bg-slate-200 px-3 py-2 text-xs font-black text-slate-400">Confirm</button>}
                    <button disabled={!hasParts} onClick={() => setEditingLogistics(editingLogistics?.workId === work.id && editingLogistics.kind === "parts" ? null : { workId: work.id, kind: "parts" })} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-black disabled:bg-slate-100 disabled:text-slate-400">Adjust</button>
                  </div>
                </div>
                {hasParts ? <div className="mt-3 space-y-2">{work.parts.map((part) => <div key={part.id} className="rounded-lg bg-slate-50 px-3 py-2"><div className="flex items-start justify-between gap-3"><div className="text-sm font-black">{part.description}{part.quantity && part.quantity !== 1 ? ` × ${part.quantity}` : ""}</div><div className="text-[10px] font-black uppercase text-slate-500">{label(part.status)}</div></div>{part.partNumber || part.etaAt ? <div className="mt-1 text-xs text-slate-500">{part.partNumber ? `Part ${part.partNumber}` : ""}{part.partNumber && part.etaAt ? " · " : ""}{part.etaAt ? `ETA ${dateTime(part.etaAt)}` : ""}</div> : null}</div>)}</div> : null}
                {editingLogistics?.workId === work.id && editingLogistics.kind === "parts" && hasParts ? <div className="mt-4 border-t border-slate-200 pt-4"><label className="text-xs font-black text-slate-600">What needs attention?<textarea rows={2} value={logisticsNotes[partsKey] ?? work.partnerPartsNote ?? ""} onChange={(event) => setLogisticsNotes((current) => ({ ...current, [partsKey]: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold" placeholder="Example: Wrong part number, missing hardware, or part not received." /></label><div className="mt-3 flex gap-2"><button disabled={workingId === work.id} onClick={() => void updateLogistics(work, "parts", "adjust")} className="rounded-lg bg-slate-950 px-4 py-2 text-xs font-black text-white disabled:opacity-40">Report Issue</button><button onClick={() => setEditingLogistics(null)} className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-black">Cancel</button></div></div> : null}
              </div>

              {work.blockerReason ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800"><span className="font-black">Blocked:</span> {work.blockerReason}</div> : null}
            </div>

            <div className="space-y-3">
              <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-4">
                <div className="text-[10px] font-black uppercase tracking-[0.12em] text-blue-700">Independent labor estimate</div>
                <h3 className="mt-1 text-lg font-black">Your labor price and timing</h3>
                <p className="mt-1 text-xs leading-5 text-slate-600">Quote labor for this scope independently. Parts are tracked separately in the Parts section. Lot Logic does not show internal planning numbers or approval thresholds.</p>

                {work.latestEstimate && editingEstimateId !== work.id ? <div className="mt-4 rounded-xl border border-blue-100 bg-white p-4">
                  <div className="flex items-center justify-between gap-3"><div className="font-black">Latest labor estimate</div><div className="text-xs font-bold text-slate-400">Revision {work.latestEstimate.revisionNo}</div></div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center"><div><div className="text-lg font-black">{money(work.latestEstimate.quotedCost)}</div><div className="text-[10px] font-black uppercase text-slate-400">Labor Quote</div></div><div><div className="text-lg font-black">{hours(work.latestEstimate.estimatedLaborMinutes)}</div><div className="text-[10px] font-black uppercase text-slate-400">Hands-on</div></div><div><div className="text-lg font-black">{hours(work.latestEstimate.estimatedElapsedMinutes)}</div><div className="text-[10px] font-black uppercase text-slate-400">Turnaround</div></div></div>
                  {work.latestEstimate.notes ? <p className="mt-3 text-sm text-slate-600">{work.latestEstimate.notes}</p> : null}
                  <div className="mt-3 text-xs font-black text-slate-600">{estimateGate === "approved" ? "Approved" : estimateGate === "awaiting_review" ? "Awaiting approval" : estimateGate === "revision_requested" ? "Revision requested" : label(estimateGate)}</div>
                  {permissions.editEstimate && !["in_progress", "complete", "cancelled"].includes(work.status) ? <button onClick={() => setEditingEstimateId(work.id)} className="mt-3 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-black">Revise Labor Estimate</button> : null}
                </div> : null}

                {permissions.editEstimate && (!work.latestEstimate || editingEstimateId === work.id) ? <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <label className="text-xs font-black text-slate-600">Labor quote ($)<input inputMode="decimal" value={draft.cost} onChange={(event) => updateDraft(work, "cost", event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold" /></label>
                  <label className="text-xs font-black text-slate-600">Hands-on labor (hr)<input inputMode="decimal" value={draft.laborHours} onChange={(event) => updateDraft(work, "laborHours", event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold" /></label>
                  <label className="text-xs font-black text-slate-600">Turnaround (hr)<input inputMode="decimal" value={draft.elapsedHours} onChange={(event) => updateDraft(work, "elapsedHours", event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold" /></label>
                  <label className="sm:col-span-3 text-xs font-black text-slate-600">Notes<textarea rows={3} value={draft.notes} onChange={(event) => updateDraft(work, "notes", event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold" /></label>
                  <div className="sm:col-span-3 flex flex-wrap gap-2"><button disabled={workingId === work.id} onClick={() => void submitEstimate(work)} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-black text-white disabled:opacity-40">{workingId === work.id ? "Submitting…" : work.latestEstimate ? "Submit Revision" : "Submit Labor Estimate"}</button>{work.latestEstimate ? <button onClick={() => setEditingEstimateId(null)} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-black">Cancel</button> : null}</div>
                </div> : null}
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Next step</div>
                {needsEstimate ? <><div className="mt-1 text-lg font-black">Submit your labor estimate</div><p className="mt-1 text-xs text-slate-500">Work cannot begin until the labor estimate has been approved.</p></> : null}
                {awaitingReview ? <><div className="mt-1 text-lg font-black">Labor estimate submitted</div><p className="mt-1 text-xs text-slate-500">Approval is required before work can begin.</p></> : null}
                {canStart ? <><div className="mt-1 text-lg font-black">Approved — ready to begin</div><button disabled={workingId === work.id} onClick={() => void setStatus(work, "in_progress")} className="mt-3 rounded-lg bg-slate-950 px-4 py-2 text-sm font-black text-white disabled:opacity-40">Start Work</button></> : null}
                {canComplete ? <><div className="mt-1 text-lg font-black">Work in progress</div><button disabled={workingId === work.id} onClick={() => void setStatus(work, "complete")} className="mt-3 rounded-lg bg-slate-950 px-4 py-2 text-sm font-black text-white disabled:opacity-40">Mark Complete</button></> : null}
                {!needsEstimate && !awaitingReview && !canStart && !canComplete && work.status === "complete" ? <div className="mt-1 text-lg font-black">Work complete</div> : null}
              </div>

              {message[work.id] ? <div className="text-xs font-black text-slate-700">{message[work.id]}</div> : null}
            </div>
          </div>
        </section>;
      })}
    </div>

    {modalWork ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" onMouseDown={() => setVehicleModalId(null)}>
      <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4"><div><div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Vehicle details</div><h2 className="mt-1 text-2xl font-black">{modalWork.vehicleLabel}</h2></div><button onClick={() => setVehicleModalId(null)} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-black">Close</button></div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">{[
          ["VIN", modalWork.vin || "—"], ["Mileage", mileage(modalWork.mileage)], ["Stock number", modalWork.stockNumber || "—"], ["Body", modalWork.vehicleDetails.bodyClass || "—"], ["Engine", modalWork.vehicleDetails.displacementL ? `${modalWork.vehicleDetails.displacementL}L${modalWork.vehicleDetails.engineCylinders ? ` · ${modalWork.vehicleDetails.engineCylinders} cyl` : ""}` : "—"], ["Fuel", modalWork.vehicleDetails.fuelType || "—"], ["Drivetrain", modalWork.vehicleDetails.driveType || "—"], ["Built in", modalWork.vehicleDetails.plantCountry || "—"],
        ].map(([title, value]) => <div key={title} className="rounded-xl border border-slate-200 p-3"><div className="text-[10px] font-black uppercase text-slate-400">{title}</div><div className={`mt-1 text-sm font-black ${title === "VIN" ? "font-mono" : ""}`}>{value}</div></div>)}</div>
      </div>
    </div> : null}
  </>;
}
