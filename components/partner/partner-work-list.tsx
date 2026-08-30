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
  return new Date(value).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
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

export function PartnerWorkList({ workItems, permissions }: { workItems: PartnerWorkItem[]; permissions: PartnerPortalPermissions }) {
  const router = useRouter();
  const [editingEstimateId, setEditingEstimateId] = useState<string | null>(null);
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);
  const [vehicleModalId, setVehicleModalId] = useState<string | null>(null);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [message, setMessage] = useState<Record<string, string>>({});
  const [drafts, setDrafts] = useState<Record<string, { cost: string; laborHours: string; elapsedHours: string; notes: string }>>({});
  const [scheduleDrafts, setScheduleDrafts] = useState<Record<string, { startAt: string; endAt: string }>>({});

  function draftFor(work: PartnerWorkItem) {
    return drafts[work.id] ?? {
      cost: work.latestEstimate?.quotedCost == null ? "" : String(work.latestEstimate.quotedCost),
      laborHours: work.latestEstimate?.estimatedLaborMinutes == null ? "" : String(Math.round((work.latestEstimate.estimatedLaborMinutes / 60) * 10) / 10),
      elapsedHours: work.latestEstimate?.estimatedElapsedMinutes == null ? "" : String(Math.round((work.latestEstimate.estimatedElapsedMinutes / 60) * 10) / 10),
      notes: work.latestEstimate?.notes ?? "",
    };
  }

  function scheduleDraftFor(work: PartnerWorkItem) {
    return scheduleDrafts[work.id] ?? {
      startAt: localInputValue(work.scheduledStartAt || work.proposedStartAt),
      endAt: localInputValue(work.scheduledEndAt || work.proposedEndAt),
    };
  }

  function updateDraft(work: PartnerWorkItem, key: "cost" | "laborHours" | "elapsedHours" | "notes", value: string) {
    setDrafts((current) => ({ ...current, [work.id]: { ...draftFor(work), [key]: value } }));
  }

  function updateScheduleDraft(work: PartnerWorkItem, key: "startAt" | "endAt", value: string) {
    setScheduleDrafts((current) => ({ ...current, [work.id]: { ...scheduleDraftFor(work), [key]: value } }));
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
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Estimate could not be submitted.");
      setEditingEstimateId(null);
      setMessage((current) => ({
        ...current,
        [work.id]: payload.approvalStatus === "approved"
          ? "Estimate approved. Work may begin when you are ready."
          : "Estimate submitted. Approval is required before work can begin.",
      }));
      router.refresh();
    } catch (error) {
      setMessage((current) => ({ ...current, [work.id]: error instanceof Error ? error.message : "Estimate could not be submitted." }));
    } finally {
      setWorkingId(null);
    }
  }

  async function saveSchedule(work: PartnerWorkItem) {
    const draft = scheduleDraftFor(work);
    setWorkingId(work.id);
    setMessage((current) => ({ ...current, [work.id]: "" }));
    try {
      const response = await fetch(`/api/partner/work-orders/${work.id}/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startAt: draft.startAt, endAt: draft.endAt }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Schedule could not be updated.");
      setEditingScheduleId(null);
      setMessage((current) => ({ ...current, [work.id]: "Schedule confirmed." }));
      router.refresh();
    } catch (error) {
      setMessage((current) => ({ ...current, [work.id]: error instanceof Error ? error.message : "Schedule could not be updated." }));
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
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Work Order could not be updated.");
      setMessage((current) => ({ ...current, [work.id]: status === "complete" ? "Work marked complete." : "Work started." }));
      router.refresh();
    } catch (error) {
      setMessage((current) => ({ ...current, [work.id]: error instanceof Error ? error.message : "Work Order could not be updated." }));
    } finally {
      setWorkingId(null);
    }
  }

  if (!permissions.viewAssignedWork) {
    return <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm font-semibold text-amber-900">Assigned Work access is not enabled for this partner account.</div>;
  }

  if (!workItems.length) {
    return <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center"><div className="text-lg font-black">No assigned work right now</div><p className="mt-2 text-sm text-slate-500">New Work Orders assigned to you will appear here.</p></div>;
  }

  const modalWork = vehicleModalId ? workItems.find((work) => work.id === vehicleModalId) ?? null : null;

  return <>
    <div className="space-y-4">
      {workItems.map((work) => {
        const draft = draftFor(work);
        const scheduleDraft = scheduleDraftFor(work);
        const preferredStart = work.proposedStartAt || work.scheduledStartAt;
        const preferredEnd = work.proposedEndAt || work.scheduledEndAt;
        const estimateGate = work.partnerEstimateStatus || (permissions.editEstimate ? "awaiting_estimate" : "not_required");
        const estimateApproved = estimateGate === "approved" || estimateGate === "not_required";
        const needsEstimate = permissions.editEstimate && (!work.latestEstimate || estimateGate === "awaiting_estimate" || estimateGate === "revision_requested");
        const awaitingReview = estimateGate === "awaiting_review";
        const canStart = permissions.startWork && estimateApproved && !["in_progress", "complete", "cancelled"].includes(work.status);
        const canComplete = permissions.completeWork && work.status === "in_progress";

        return <section key={work.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <button onClick={() => setVehicleModalId(work.id)} className="text-left text-[10px] font-black uppercase tracking-[0.12em] text-blue-700 hover:underline">{work.vehicleLabel} · View vehicle</button>
                <h2 className="mt-1 text-xl font-black">{work.title}</h2>
                {work.description ? <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">{work.description}</p> : null}
              </div>
              <span className="self-start rounded-full bg-white px-3 py-1.5 text-xs font-black text-slate-700 shadow-sm">{label(work.status)}</span>
            </div>
          </div>

          <div className="grid gap-5 p-5 xl:grid-cols-[1fr_1fr]">
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-200 p-3 sm:col-span-2">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-[10px] font-black uppercase text-slate-400">Preferred timing</div>
                      <div className="mt-1 text-sm font-black">{dateTime(preferredStart)}</div>
                      {preferredEnd ? <div className="mt-1 text-xs text-slate-500">Preferred completion: {dateTime(preferredEnd)}</div> : null}
                      {work.proposedStartAt && work.scheduledStartAt && work.scheduledStartAt !== work.proposedStartAt ? <div className="mt-2 text-xs font-bold text-blue-700">Your confirmed start: {dateTime(work.scheduledStartAt)}</div> : null}
                    </div>
                    {permissions.rescheduleWork && !["in_progress", "complete", "cancelled"].includes(work.status) ? <button onClick={() => setEditingScheduleId(editingScheduleId === work.id ? null : work.id)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-black">Confirm / Adjust</button> : null}
                  </div>
                  {editingScheduleId === work.id ? <div className="mt-4 grid gap-3 border-t border-slate-200 pt-4 sm:grid-cols-2">
                    <label className="text-xs font-black text-slate-600">Planned start<input type="datetime-local" value={scheduleDraft.startAt} onChange={(event) => updateScheduleDraft(work, "startAt", event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold" /></label>
                    <label className="text-xs font-black text-slate-600">Expected completion<input type="datetime-local" value={scheduleDraft.endAt} onChange={(event) => updateScheduleDraft(work, "endAt", event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold" /></label>
                    <div className="flex gap-2 sm:col-span-2"><button disabled={workingId === work.id} onClick={() => void saveSchedule(work)} className="rounded-lg bg-slate-950 px-4 py-2 text-xs font-black text-white disabled:opacity-40">Save Schedule</button><button onClick={() => setEditingScheduleId(null)} className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-black">Cancel</button></div>
                  </div> : null}
                </div>
                <div className="rounded-xl border border-slate-200 p-3"><div className="text-[10px] font-black uppercase text-slate-400">Vehicle</div><button onClick={() => setVehicleModalId(work.id)} className="mt-1 text-left text-sm font-black text-blue-700 hover:underline">{work.vehicleLabel}</button><div className="mt-1 text-xs text-slate-500">{mileage(work.mileage)}{work.stockNumber ? ` · Stock ${work.stockNumber}` : ""}</div></div>
                <div className="rounded-xl border border-slate-200 p-3"><div className="text-[10px] font-black uppercase text-slate-400">Location</div><div className="mt-1 text-sm font-black">{work.locationName || "To be confirmed"}</div></div>
                <div className="rounded-xl border border-slate-200 p-3"><div className="text-[10px] font-black uppercase text-slate-400">Work type</div><div className="mt-1 text-sm font-black">{label(work.subcategory || work.category)}</div></div>
                <div className="rounded-xl border border-slate-200 p-3"><div className="text-[10px] font-black uppercase text-slate-400">VIN</div><div className="mt-1 font-mono text-xs font-bold">…{work.vin?.slice(-8) || "—"}</div></div>
              </div>

              {work.blockerReason ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800"><span className="font-black">Blocked:</span> {work.blockerReason}</div> : null}

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Next step</div>
                {needsEstimate ? <><div className="mt-1 text-lg font-black">Submit your estimate</div><p className="mt-1 text-xs text-slate-500">Work cannot begin until your estimate has been approved.</p></> : null}
                {awaitingReview ? <><div className="mt-1 text-lg font-black">Estimate submitted</div><p className="mt-1 text-xs text-slate-500">Approval is required before work can begin. We&apos;ll update this Work Order when it is approved or needs revision.</p></> : null}
                {canStart ? <><div className="mt-1 text-lg font-black">Approved — ready to begin</div><p className="mt-1 text-xs text-slate-500">Your estimate is approved. Start the Work Order when the vehicle and schedule are ready.</p><button disabled={workingId === work.id} onClick={() => void setStatus(work, "in_progress")} className="mt-3 rounded-lg bg-slate-950 px-4 py-2 text-sm font-black text-white disabled:opacity-40">Start Work</button></> : null}
                {canComplete ? <><div className="mt-1 text-lg font-black">Work in progress</div><p className="mt-1 text-xs text-slate-500">Mark the Work Order complete when the assigned scope is finished.</p><button disabled={workingId === work.id} onClick={() => void setStatus(work, "complete")} className="mt-3 rounded-lg bg-slate-950 px-4 py-2 text-sm font-black text-white disabled:opacity-40">Mark Complete</button></> : null}
                {!needsEstimate && !awaitingReview && !canStart && !canComplete && work.status === "complete" ? <div className="mt-1 text-lg font-black">Work complete</div> : null}
              </div>
            </div>

            <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-4">
              <div className="text-[10px] font-black uppercase tracking-[0.12em] text-blue-700">Independent estimate</div>
              <h3 className="mt-1 text-lg font-black">Your price and timing</h3>
              <p className="mt-1 text-xs leading-5 text-slate-600">Quote this scope independently. Lot Logic does not show internal planning numbers or approval thresholds.</p>

              {work.latestEstimate && editingEstimateId !== work.id ? <div className="mt-4 rounded-xl border border-blue-100 bg-white p-4">
                <div className="flex items-center justify-between gap-3"><div className="font-black">Latest estimate</div><div className="text-xs font-bold text-slate-400">Revision {work.latestEstimate.revisionNo}</div></div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center"><div><div className="text-lg font-black">{money(work.latestEstimate.quotedCost)}</div><div className="text-[10px] font-black uppercase text-slate-400">Quote</div></div><div><div className="text-lg font-black">{hours(work.latestEstimate.estimatedLaborMinutes)}</div><div className="text-[10px] font-black uppercase text-slate-400">Labor</div></div><div><div className="text-lg font-black">{hours(work.latestEstimate.estimatedElapsedMinutes)}</div><div className="text-[10px] font-black uppercase text-slate-400">Turnaround</div></div></div>
                {work.latestEstimate.notes ? <p className="mt-3 text-sm text-slate-600">{work.latestEstimate.notes}</p> : null}
                <div className="mt-3 text-xs font-black text-slate-600">{estimateGate === "approved" ? "Approved" : estimateGate === "awaiting_review" ? "Awaiting approval" : estimateGate === "revision_requested" ? "Revision requested" : label(estimateGate)}</div>
                {permissions.editEstimate && !["in_progress", "complete", "cancelled"].includes(work.status) ? <button onClick={() => setEditingEstimateId(work.id)} className="mt-3 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-black">Revise Estimate</button> : null}
              </div> : null}

              {permissions.editEstimate && (!work.latestEstimate || editingEstimateId === work.id) ? <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <label className="text-xs font-black text-slate-600">Quote ($)<input inputMode="decimal" value={draft.cost} onChange={(event) => updateDraft(work, "cost", event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold" /></label>
                <label className="text-xs font-black text-slate-600">Hands-on labor (hr)<input inputMode="decimal" value={draft.laborHours} onChange={(event) => updateDraft(work, "laborHours", event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold" /></label>
                <label className="text-xs font-black text-slate-600">Elapsed turnaround (hr)<input inputMode="decimal" value={draft.elapsedHours} onChange={(event) => updateDraft(work, "elapsedHours", event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold" /></label>
                <label className="sm:col-span-3 text-xs font-black text-slate-600">Notes<textarea rows={3} value={draft.notes} onChange={(event) => updateDraft(work, "notes", event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold" /></label>
                <div className="sm:col-span-3 flex flex-wrap gap-2"><button disabled={workingId === work.id} onClick={() => void submitEstimate(work)} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-black text-white disabled:opacity-40">{workingId === work.id ? "Submitting…" : work.latestEstimate ? "Submit Revision" : "Submit Estimate"}</button>{work.latestEstimate ? <button onClick={() => setEditingEstimateId(null)} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-black">Cancel</button> : null}</div>
              </div> : null}

              {!permissions.editEstimate ? <div className="mt-4 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-500">Estimate entry is not enabled for this partner account.</div> : null}
              {message[work.id] ? <div className="mt-3 text-xs font-black text-slate-700">{message[work.id]}</div> : null}
            </div>
          </div>
        </section>;
      })}
    </div>

    {modalWork ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" onMouseDown={() => setVehicleModalId(null)}>
      <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4"><div><div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Vehicle details</div><h2 className="mt-1 text-2xl font-black">{modalWork.vehicleLabel}</h2></div><button onClick={() => setVehicleModalId(null)} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-black">Close</button></div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {[
            ["VIN", modalWork.vin || "—"],
            ["Mileage", mileage(modalWork.mileage)],
            ["Stock number", modalWork.stockNumber || "—"],
            ["Body", modalWork.vehicleDetails.bodyClass || "—"],
            ["Engine", modalWork.vehicleDetails.displacementL ? `${modalWork.vehicleDetails.displacementL}L${modalWork.vehicleDetails.engineCylinders ? ` · ${modalWork.vehicleDetails.engineCylinders} cyl` : ""}` : "—"],
            ["Fuel", modalWork.vehicleDetails.fuelType || "—"],
            ["Drivetrain", modalWork.vehicleDetails.driveType || "—"],
            ["Built in", modalWork.vehicleDetails.plantCountry || "—"],
          ].map(([title, value]) => <div key={title} className="rounded-xl border border-slate-200 p-3"><div className="text-[10px] font-black uppercase text-slate-400">{title}</div><div className={`mt-1 text-sm font-black ${title === "VIN" ? "font-mono" : ""}`}>{value}</div></div>)}
        </div>
        <p className="mt-4 text-xs leading-5 text-slate-500">Only vehicle information useful for completing assigned work is shown here. Internal acquisition, valuation, margin and planning data remain private.</p>
      </div>
    </div> : null}
  </>;
}
