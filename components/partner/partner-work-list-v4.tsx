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
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not scheduled";
  return date.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
function shortSlot(value: string) {
  return new Date(value).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
function localInputValue(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}
function label(value: string | null | undefined) {
  if (!value) return "—";
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function durationMinutes(work: PartnerWorkItem) {
  if (work.latestEstimate?.estimatedElapsedMinutes && work.latestEstimate.estimatedElapsedMinutes > 0) return work.latestEstimate.estimatedElapsedMinutes;
  const start = work.proposedStartAt || work.scheduledStartAt;
  const end = work.proposedEndAt || work.scheduledEndAt;
  if (start && end) {
    const minutes = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60_000);
    if (Number.isFinite(minutes) && minutes > 0) return minutes;
  }
  return 60;
}
function endFromStart(startValue: string, minutes: number) {
  if (!startValue) return "";
  const start = new Date(startValue);
  if (Number.isNaN(start.getTime())) return "";
  return localInputValue(new Date(start.getTime() + minutes * 60_000).toISOString());
}
async function payload(response: Response) {
  const text = await response.text();
  if (!text.trim()) return {} as Record<string, unknown>;
  try { return JSON.parse(text) as Record<string, unknown>; }
  catch { return { error: `Request failed (${response.status}).` }; }
}

type ScheduleSuggestion = { startAt: string; endAt: string };
type LogisticsKind = "location" | "parts";

export function PartnerWorkListV4({ workItems, permissions }: { workItems: PartnerWorkItem[]; permissions: PartnerPortalPermissions }) {
  const router = useRouter();
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [message, setMessage] = useState<Record<string, string>>({});
  const [editingEstimateId, setEditingEstimateId] = useState<string | null>(null);
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);
  const [editingLogistics, setEditingLogistics] = useState<{ workId: string; kind: LogisticsKind } | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [completionNotes, setCompletionNotes] = useState<Record<string, string>>({});
  const [setupOpen, setSetupOpen] = useState<Record<string, boolean>>({});
  const [estimateDrafts, setEstimateDrafts] = useState<Record<string, { cost: string; labor: string; elapsed: string; notes: string }>>({});
  const [scheduleDrafts, setScheduleDrafts] = useState<Record<string, { startAt: string; endAt: string }>>({});
  const [suggestions, setSuggestions] = useState<Record<string, ScheduleSuggestion[]>>({});
  const [availabilityText, setAvailabilityText] = useState<Record<string, string>>({});

  function estimateDraft(work: PartnerWorkItem) {
    return estimateDrafts[work.id] ?? {
      cost: work.latestEstimate?.quotedCost == null ? "" : String(work.latestEstimate.quotedCost),
      labor: work.latestEstimate?.estimatedLaborMinutes == null ? "" : String(Math.round((work.latestEstimate.estimatedLaborMinutes / 60) * 10) / 10),
      elapsed: work.latestEstimate?.estimatedElapsedMinutes == null ? "" : String(Math.round((work.latestEstimate.estimatedElapsedMinutes / 60) * 10) / 10),
      notes: work.latestEstimate?.notes || "",
    };
  }
  function scheduleDraft(work: PartnerWorkItem) {
    return scheduleDrafts[work.id] ?? {
      startAt: localInputValue(work.scheduledStartAt || work.proposedStartAt),
      endAt: localInputValue(work.scheduledEndAt || work.proposedEndAt),
    };
  }

  async function submitEstimate(work: PartnerWorkItem) {
    const draft = estimateDraft(work);
    setWorkingId(work.id); setMessage((c) => ({ ...c, [work.id]: "" }));
    try {
      const response = await fetch(`/api/intelligence/work-orders/${work.id}/estimate`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quotedCost: draft.cost ? Number(draft.cost) : null, estimatedLaborMinutes: draft.labor ? Math.round(Number(draft.labor) * 60) : null, estimatedElapsedMinutes: draft.elapsed ? Math.round(Number(draft.elapsed) * 60) : null, notes: draft.notes }),
      });
      const data = await payload(response);
      if (!response.ok) throw new Error(String(data.error || "Estimate could not be submitted."));
      setEditingEstimateId(null);
      setMessage((c) => ({ ...c, [work.id]: data.approvalStatus === "approved" ? "Labor estimate approved." : "Labor estimate submitted for approval." }));
      router.refresh();
    } catch (error) { setMessage((c) => ({ ...c, [work.id]: error instanceof Error ? error.message : "Estimate could not be submitted." })); }
    finally { setWorkingId(null); }
  }

  async function updateLogistics(work: PartnerWorkItem, kind: LogisticsKind, action: "confirm" | "adjust") {
    const key = `${work.id}:${kind}`;
    setWorkingId(work.id); setMessage((c) => ({ ...c, [work.id]: "" }));
    try {
      const response = await fetch(`/api/partner/work-orders/${work.id}/logistics`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, action, note: notes[key] || "" }) });
      const data = await payload(response);
      if (!response.ok) throw new Error(String(data.error || `Could not update ${kind}.`));
      setEditingLogistics(null);
      setMessage((c) => ({ ...c, [work.id]: action === "confirm" ? `${kind === "parts" ? "Parts" : "Location"} confirmed.` : `${kind === "parts" ? "Parts" : "Location"} update sent.` }));
      router.refresh();
    } catch (error) { setMessage((c) => ({ ...c, [work.id]: error instanceof Error ? error.message : `Could not update ${kind}.` })); }
    finally { setWorkingId(null); }
  }

  async function loadAvailability(work: PartnerWorkItem) {
    setAvailabilityText((c) => ({ ...c, [work.id]: "Finding available times…" }));
    try {
      const response = await fetch(`/api/partner/work-orders/${work.id}/availability`);
      const data = await payload(response);
      if (!response.ok) throw new Error(String(data.error || "Could not calculate availability."));
      const items = Array.isArray(data.suggestions) ? data.suggestions as ScheduleSuggestion[] : [];
      setSuggestions((c) => ({ ...c, [work.id]: items }));
      setAvailabilityText((c) => ({ ...c, [work.id]: items.length ? "Suggested available times" : "No open slots found in the next 10 days." }));
    } catch (error) { setAvailabilityText((c) => ({ ...c, [work.id]: error instanceof Error ? error.message : "Could not calculate availability." })); }
  }
  function openSchedule(work: PartnerWorkItem) {
    const next = editingScheduleId === work.id ? null : work.id;
    setEditingScheduleId(next);
    if (next) void loadAvailability(work);
  }
  function selectSuggestion(work: PartnerWorkItem, slot: ScheduleSuggestion) {
    setScheduleDrafts((c) => ({ ...c, [work.id]: { startAt: localInputValue(slot.startAt), endAt: localInputValue(slot.endAt) } }));
  }
  async function saveScheduleValues(work: PartnerWorkItem, startAt: string, endAt: string, success: string) {
    if (!startAt || !endAt) return;
    setWorkingId(work.id); setMessage((c) => ({ ...c, [work.id]: "" }));
    try {
      const response = await fetch(`/api/partner/work-orders/${work.id}/schedule`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ startAt, endAt }) });
      const data = await payload(response);
      if (!response.ok) throw new Error(String(data.error || "Schedule could not be updated."));
      setEditingScheduleId(null); setMessage((c) => ({ ...c, [work.id]: success })); router.refresh();
    } catch (error) { setMessage((c) => ({ ...c, [work.id]: error instanceof Error ? error.message : "Schedule could not be updated." })); }
    finally { setWorkingId(null); }
  }
  async function confirmSchedule(work: PartnerWorkItem) {
    if (!work.proposedStartAt || !work.proposedEndAt) return;
    await saveScheduleValues(work, localInputValue(work.proposedStartAt), localInputValue(work.proposedEndAt), "Requested schedule confirmed.");
  }

  async function setStatus(work: PartnerWorkItem, status: "in_progress" | "complete") {
    setWorkingId(work.id); setMessage((c) => ({ ...c, [work.id]: "" }));
    try {
      const response = await fetch(`/api/partner/work-orders/${work.id}/status`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, completionNotes: status === "complete" ? (completionNotes[work.id] ?? work.partnerCompletionNotes ?? "") : null }),
      });
      const data = await payload(response);
      if (!response.ok) throw new Error(String(data.error || "Work Order could not be updated."));
      setMessage((c) => ({ ...c, [work.id]: status === "complete" ? "Work marked complete." : "Work started." }));
      router.refresh();
    } catch (error) { setMessage((c) => ({ ...c, [work.id]: error instanceof Error ? error.message : "Work Order could not be updated." })); }
    finally { setWorkingId(null); }
  }

  if (!permissions.viewAssignedWork) return <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-900">Assigned Work access is not enabled.</div>;

  return <div className="space-y-4">{workItems.map((work) => {
    const estimateStatus = work.partnerEstimateStatus || (permissions.editEstimate ? "awaiting_estimate" : "not_required");
    const needsEstimate = permissions.editEstimate && (!work.latestEstimate || ["awaiting_estimate", "revision_requested"].includes(estimateStatus));
    const estimateApproved = ["approved", "not_required"].includes(estimateStatus);
    const partsConfirmed = work.partnerPartsConfirmationStatus === "confirmed";
    const locationConfirmed = work.partnerLocationConfirmationStatus === "confirmed";
    const hasRequestedSchedule = Boolean(work.proposedStartAt && work.proposedEndAt);
    const scheduleConfirmed = work.partnerConfirmationStatus === "confirmed" && Boolean(work.scheduledStartAt);
    const setupReady = estimateApproved && partsConfirmed && locationConfirmed && scheduleConfirmed;
    const canStart = permissions.startWork && setupReady && !["in_progress", "complete", "cancelled"].includes(work.status);
    const estimate = estimateDraft(work);
    const schedule = scheduleDraft(work);
    const inProgress = work.status === "in_progress";
    const complete = work.status === "complete";
    const detailsOpen = setupOpen[work.id] ?? !inProgress;
    const currentAction = needsEstimate ? "Submit your labor estimate" : estimateStatus === "awaiting_review" ? "Waiting for estimate approval" : !partsConfirmed ? "Confirm the parts plan" : !locationConfirmed ? "Confirm the work location" : !hasRequestedSchedule ? "Waiting for the dealer to propose a work time" : !scheduleConfirmed ? "Confirm or adjust the requested time" : inProgress ? "Finish the job and mark it complete" : complete ? "Work complete" : "Start the work";
    const stepTone = (done: boolean, active: boolean) => done ? "border-emerald-200 bg-emerald-50 text-emerald-800" : active ? "border-amber-300 bg-amber-50 text-amber-900" : "border-slate-200 bg-white text-slate-500";

    return <section key={work.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 bg-white px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div><h2 className="text-xl font-black tracking-[-0.02em]">{work.title}</h2>{work.description ? <p className="mt-1 text-sm text-slate-600">{work.description}</p> : null}</div>
          <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase ${inProgress ? "bg-blue-100 text-blue-700" : complete ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{label(work.status)}</span>
        </div>

        <div className={`mt-4 rounded-xl border-2 px-4 py-3 ${inProgress ? "border-blue-300 bg-blue-50" : complete ? "border-emerald-300 bg-emerald-50" : "border-amber-300 bg-amber-50"}`}>
          <div className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">{inProgress ? "Happening now" : complete ? "Status" : "Next step"}</div>
          <div className="mt-1 text-base font-black text-slate-950">{currentAction}</div>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-4">
          <div className={`rounded-lg border px-3 py-2 text-xs font-black ${stepTone(estimateApproved, needsEstimate || estimateStatus === "awaiting_review")}`}>1 · Estimate {estimateApproved ? "✓" : ""}</div>
          <div className={`rounded-lg border px-3 py-2 text-xs font-black ${stepTone(partsConfirmed, !estimateApproved && !needsEstimate ? false : estimateApproved && !partsConfirmed)}`}>2 · Parts {partsConfirmed ? "✓" : ""}</div>
          <div className={`rounded-lg border px-3 py-2 text-xs font-black ${stepTone(locationConfirmed, estimateApproved && partsConfirmed && !locationConfirmed)}`}>3 · Location {locationConfirmed ? "✓" : ""}</div>
          <div className={`rounded-lg border px-3 py-2 text-xs font-black ${stepTone(scheduleConfirmed, estimateApproved && partsConfirmed && locationConfirmed && !scheduleConfirmed)}`}>4 · Schedule {scheduleConfirmed ? "✓" : ""}</div>
        </div>
      </div>

      <div className="p-5">
        <div className="flex items-center justify-between gap-3">
          <div><div className="text-sm font-black">Job setup</div><div className="mt-0.5 text-xs text-slate-500">Estimate, parts, location, and schedule.</div></div>
          <button type="button" onClick={() => setSetupOpen((c) => ({ ...c, [work.id]: !detailsOpen }))} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-black">{detailsOpen ? "Hide details ↑" : "Show details ↓"}</button>
        </div>

        {detailsOpen ? <div className="mt-3 space-y-3">
          <div className={`rounded-xl border p-4 ${needsEstimate || estimateStatus === "revision_requested" ? "border-amber-300 bg-amber-50/50" : "border-slate-200"}`}>
            <div className="flex items-start justify-between gap-3"><div><div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">1 · Labor estimate</div><div className="mt-1 text-sm font-black">{work.latestEstimate ? money(work.latestEstimate.quotedCost) : "Estimate required"}</div><div className={`mt-1 text-xs font-bold ${estimateApproved ? "text-emerald-700" : "text-amber-700"}`}>{estimateStatus === "approved" ? "✓ Approved" : estimateStatus === "awaiting_review" ? "Submitted · awaiting approval" : estimateStatus === "revision_requested" ? "Revision requested" : "Submit your independent labor quote"}</div></div>{work.latestEstimate && editingEstimateId !== work.id && permissions.editEstimate && !inProgress && !complete ? <button onClick={() => setEditingEstimateId(work.id)} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-black">Revise</button> : null}</div>
            {permissions.editEstimate && (!work.latestEstimate || editingEstimateId === work.id) ? <div className="mt-4 grid gap-3 sm:grid-cols-3"><label className="text-xs font-black text-slate-600">Labor quote ($)<input inputMode="decimal" value={estimate.cost} onChange={(e) => setEstimateDrafts((c) => ({ ...c, [work.id]: { ...estimate, cost: e.target.value } }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label><label className="text-xs font-black text-slate-600">Hands-on labor (hr)<input inputMode="decimal" value={estimate.labor} onChange={(e) => setEstimateDrafts((c) => ({ ...c, [work.id]: { ...estimate, labor: e.target.value } }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label><label className="text-xs font-black text-slate-600">Turnaround (hr)<input inputMode="decimal" value={estimate.elapsed} onChange={(e) => setEstimateDrafts((c) => ({ ...c, [work.id]: { ...estimate, elapsed: e.target.value } }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label><label className="text-xs font-black text-slate-600 sm:col-span-3">Estimate notes<textarea rows={2} value={estimate.notes} onChange={(e) => setEstimateDrafts((c) => ({ ...c, [work.id]: { ...estimate, notes: e.target.value } }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label><div className="flex gap-2 sm:col-span-3"><button disabled={workingId === work.id} onClick={() => void submitEstimate(work)} className="rounded-lg bg-slate-950 px-4 py-2 text-xs font-black text-white">{work.latestEstimate ? "Submit revision" : "Submit estimate"}</button>{work.latestEstimate ? <button onClick={() => setEditingEstimateId(null)} className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-black">Cancel</button> : null}</div></div> : null}
            {work.latestEstimate && editingEstimateId !== work.id ? <div className="mt-3 flex flex-wrap gap-4 text-xs font-semibold text-slate-500"><span>Hands-on {hours(work.latestEstimate.estimatedLaborMinutes)}</span><span>Turnaround {hours(work.latestEstimate.estimatedElapsedMinutes)}</span></div> : null}
          </div>

          <div className="rounded-xl border border-slate-200 p-4"><div className="flex items-start justify-between gap-3"><div><div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">2 · Parts</div><div className="mt-1 text-sm font-black">{work.parts.length ? `${work.parts.length} tracked part${work.parts.length === 1 ? "" : "s"}` : "No parts listed"}</div><div className={`mt-1 text-xs font-bold ${partsConfirmed ? "text-emerald-700" : "text-amber-700"}`}>{partsConfirmed ? "✓ Parts plan confirmed" : "Confirm the parts are correct."}</div></div><div className="flex gap-2">{!partsConfirmed ? <button disabled={workingId === work.id} onClick={() => void updateLogistics(work, "parts", "confirm")} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-black text-white">Confirm</button> : null}<button onClick={() => setEditingLogistics(editingLogistics?.workId === work.id && editingLogistics.kind === "parts" ? null : { workId: work.id, kind: "parts" })} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-black">Report issue</button></div></div>{work.parts.length ? <div className="mt-3 space-y-2">{work.parts.map((part) => <div key={part.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2"><div><div className="text-sm font-black">{part.description}</div>{part.etaAt ? <div className="mt-0.5 text-xs text-slate-500">ETA {dateTime(part.etaAt)}</div> : null}</div><span className="text-[10px] font-black uppercase text-slate-500">{part.dependencyResolution ? label(part.dependencyResolution) : label(part.status)}</span></div>)}</div> : null}{editingLogistics?.workId === work.id && editingLogistics.kind === "parts" ? <div className="mt-3 border-t border-slate-200 pt-3"><textarea rows={2} value={notes[`${work.id}:parts`] || ""} onChange={(e) => setNotes((c) => ({ ...c, [`${work.id}:parts`]: e.target.value }))} placeholder="Missing part, wrong part, hardware issue, or other change…" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /><button onClick={() => void updateLogistics(work, "parts", "adjust")} className="mt-2 rounded-lg bg-slate-950 px-4 py-2 text-xs font-black text-white">Send update</button></div> : null}</div>

          <div className="rounded-xl border border-slate-200 p-4"><div className="flex items-start justify-between gap-3"><div><div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">3 · Location</div><div className="mt-1 text-sm font-black">{work.locationName || "Location not set"}</div><div className={`mt-1 text-xs font-bold ${locationConfirmed ? "text-emerald-700" : "text-amber-700"}`}>{locationConfirmed ? "✓ Location confirmed" : work.locationName ? "Confirm this is where the work will be done." : "Waiting for dealer location."}</div></div><div className="flex gap-2">{!locationConfirmed && work.locationName ? <button disabled={workingId === work.id} onClick={() => void updateLogistics(work, "location", "confirm")} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-black text-white">Confirm</button> : null}<button onClick={() => setEditingLogistics(editingLogistics?.workId === work.id && editingLogistics.kind === "location" ? null : { workId: work.id, kind: "location" })} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-black">Request change</button></div></div>{editingLogistics?.workId === work.id && editingLogistics.kind === "location" ? <div className="mt-3 border-t border-slate-200 pt-3"><textarea rows={2} value={notes[`${work.id}:location`] || ""} onChange={(e) => setNotes((c) => ({ ...c, [`${work.id}:location`]: e.target.value }))} placeholder="Where should this work be performed instead?" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /><button onClick={() => void updateLogistics(work, "location", "adjust")} className="mt-2 rounded-lg bg-slate-950 px-4 py-2 text-xs font-black text-white">Send request</button></div> : null}</div>

          <div className={`rounded-xl border p-4 ${hasRequestedSchedule && !scheduleConfirmed ? "border-amber-300 bg-amber-50/40" : "border-slate-200"}`}><div className="flex items-start justify-between gap-3"><div><div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">4 · Schedule</div>{!hasRequestedSchedule ? <><div className="mt-1 text-sm font-black">Awaiting dealer schedule</div><div className="mt-1 text-xs font-semibold text-slate-500">There is nothing for you to confirm yet.</div></> : <><div className="mt-1 text-sm font-black">Requested: {dateTime(work.proposedStartAt)}</div><div className="mt-1 text-xs text-slate-500">Through {dateTime(work.proposedEndAt)}</div><div className={`mt-1 text-xs font-bold ${scheduleConfirmed ? "text-emerald-700" : "text-amber-700"}`}>{scheduleConfirmed ? `✓ Confirmed for ${dateTime(work.scheduledStartAt)}` : "Confirm this time or choose another available slot."}</div></>}</div>{permissions.rescheduleWork && hasRequestedSchedule && !["in_progress", "complete", "cancelled"].includes(work.status) ? <div className="flex gap-2">{!scheduleConfirmed ? <button disabled={workingId === work.id} onClick={() => void confirmSchedule(work)} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-black text-white">Confirm</button> : null}<button onClick={() => openSchedule(work)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-black">{editingScheduleId === work.id ? "Close" : "Choose another time"}</button></div> : null}</div>{editingScheduleId === work.id ? <div className="mt-4 border-t border-slate-200 pt-4"><div className="text-[10px] font-black uppercase text-slate-400">{availabilityText[work.id] || "Suggested available times"}</div>{suggestions[work.id]?.length ? <div className="mt-2 flex flex-wrap gap-2">{suggestions[work.id].map((slot) => <button key={slot.startAt} onClick={() => selectSuggestion(work, slot)} className={`rounded-lg border px-3 py-2 text-xs font-black ${schedule.startAt === localInputValue(slot.startAt) ? "border-blue-700 bg-blue-50 text-blue-800" : "border-slate-200 bg-white text-slate-700"}`}>{shortSlot(slot.startAt)}</button>)}</div> : null}<div className="mt-3 text-[10px] font-black uppercase text-slate-400">Or choose another time</div><div className="mt-2 flex flex-col gap-2 sm:flex-row"><input type="datetime-local" value={schedule.startAt} onChange={(e) => { const startAt = e.target.value; setScheduleDrafts((c) => ({ ...c, [work.id]: { startAt, endAt: endFromStart(startAt, durationMinutes(work)) } })); }} className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" /><button disabled={!schedule.startAt || workingId === work.id} onClick={() => void saveScheduleValues(work, schedule.startAt, schedule.endAt, "Schedule updated and confirmed.")} className="rounded-lg bg-slate-950 px-4 py-2 text-xs font-black text-white disabled:opacity-40">Save time</button></div>{schedule.endAt ? <div className="mt-2 text-xs text-slate-500">Expected completion: {dateTime(new Date(schedule.endAt).toISOString())}</div> : null}</div> : null}</div>
        </div> : null}

        {message[work.id] ? <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700">{message[work.id]}</div> : null}

        <div className={`mt-4 rounded-xl border-2 p-4 ${inProgress ? "border-blue-300 bg-blue-50/50" : canStart ? "border-emerald-300 bg-emerald-50/50" : "border-slate-200 bg-slate-50"}`}>
          {inProgress ? <>
            <div className="text-[10px] font-black uppercase tracking-[0.12em] text-blue-700">Finish work</div>
            <div className="mt-1 text-lg font-black">Ready when the job is finished</div>
            <p className="mt-1 text-xs text-slate-600">Add anything the owner should know before closing this job.</p>
            <textarea rows={3} value={completionNotes[work.id] ?? work.partnerCompletionNotes ?? ""} onChange={(e) => setCompletionNotes((c) => ({ ...c, [work.id]: e.target.value }))} placeholder="Completion notes — work performed, observations, follow-up, or anything the owner should know…" className="mt-3 w-full rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm" />
            {permissions.completeWork ? <button disabled={workingId === work.id} onClick={() => void setStatus(work, "complete")} className="mt-3 rounded-lg bg-slate-950 px-5 py-2.5 text-sm font-black text-white disabled:opacity-40">Mark work complete</button> : null}
          </> : canStart ? <><div className="text-[10px] font-black uppercase tracking-[0.12em] text-emerald-700">Ready to begin</div><div className="mt-1 text-lg font-black">Everything is confirmed</div><button disabled={workingId === work.id} onClick={() => void setStatus(work, "in_progress")} className="mt-3 rounded-lg bg-slate-950 px-5 py-2.5 text-sm font-black text-white disabled:opacity-40">Start work</button></> : complete ? <><div className="text-[10px] font-black uppercase tracking-[0.12em] text-emerald-700">Complete</div><div className="mt-1 text-lg font-black">Work complete</div>{work.partnerCompletionNotes ? <div className="mt-3 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm text-slate-700"><span className="font-black">Completion notes:</span> {work.partnerCompletionNotes}</div> : null}</> : <><div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Before work begins</div><div className="mt-1 text-lg font-black">{currentAction}</div><p className="mt-1 text-xs text-slate-500">The highlighted setup step above is the next thing that needs attention.</p></>}
        </div>
      </div>
    </section>;
  })}</div>;
}
