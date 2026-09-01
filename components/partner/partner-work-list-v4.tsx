"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import type { PartnerPortalPermissions } from "@/lib/partner-portal/access";
import type { PartnerWorkItem } from "@/lib/partner-portal/work";

function dateTime(value: string | null) {
  if (!value) return "Not scheduled";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not scheduled";
  return date.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
function shortDate(value: string | null) {
  if (!value) return "ETA not entered";
  const date = new Date(value);
  return `Expected ${date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}
function localInputValue(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}
function label(value: string | null | undefined) {
  if (!value) return "—";
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function money(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}
function hours(minutes: number | null) {
  return minutes == null ? "—" : `${Math.round((minutes / 60) * 10) / 10} hr`;
}
async function payload(response: Response) {
  const text = await response.text();
  if (!text.trim()) return {} as Record<string, unknown>;
  try { return JSON.parse(text) as Record<string, unknown>; } catch { return { error: `Unreadable response (${response.status}).` }; }
}

export function PartnerWorkListV4({ workItems, permissions }: { workItems: PartnerWorkItem[]; permissions: PartnerPortalPermissions }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [scheduleDrafts, setScheduleDrafts] = useState<Record<string, string>>({});
  const [estimateDrafts, setEstimateDrafts] = useState<Record<string, { cost: string; labor: string; elapsed: string; notes: string }>>({});

  async function post(workId: string, url: string, body: Record<string, unknown>, success: string) {
    setWorking(workId); setMessages((c) => ({ ...c, [workId]: "" }));
    try {
      const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await payload(response);
      if (!response.ok) throw new Error(String(data.error || "Update failed."));
      setMessages((c) => ({ ...c, [workId]: success }));
      setEditing(null);
      router.refresh();
    } catch (error) {
      setMessages((c) => ({ ...c, [workId]: error instanceof Error ? error.message : "Update failed." }));
    } finally { setWorking(null); }
  }

  async function updatePart(work: PartnerWorkItem, partId: string, action: "partner_supplied" | "received" | "delayed") {
    await post(work.id, `/api/partner/work-orders/${work.id}/parts/${partId}`, { action }, action === "partner_supplied" ? "Part marked Partner Supplied." : action === "received" ? "Part marked received." : "Part delay reported.");
  }

  async function submitEstimate(work: PartnerWorkItem) {
    const draft = estimateDrafts[work.id] || {
      cost: work.latestEstimate?.quotedCost?.toString() || "",
      labor: work.latestEstimate?.estimatedLaborMinutes ? String(work.latestEstimate.estimatedLaborMinutes / 60) : "",
      elapsed: work.latestEstimate?.estimatedElapsedMinutes ? String(work.latestEstimate.estimatedElapsedMinutes / 60) : "",
      notes: work.latestEstimate?.notes || "",
    };
    await post(work.id, `/api/intelligence/work-orders/${work.id}/estimate`, {
      quotedCost: draft.cost ? Number(draft.cost) : null,
      estimatedLaborMinutes: draft.labor ? Math.round(Number(draft.labor) * 60) : null,
      estimatedElapsedMinutes: draft.elapsed ? Math.round(Number(draft.elapsed) * 60) : null,
      notes: draft.notes,
    }, "Labor estimate submitted.");
  }

  return <div className="space-y-3">
    {workItems.map((work) => {
      const scheduleConfirmed = work.partnerConfirmationStatus === "confirmed";
      const locationConfirmed = work.partnerLocationConfirmationStatus === "confirmed";
      const partsConfirmed = work.partnerPartsConfirmationStatus === "confirmed";
      const estimateGate = work.partnerEstimateStatus || (permissions.editEstimate ? "awaiting_estimate" : "not_required");
      const estimateApproved = ["approved", "not_required"].includes(estimateGate);
      const needsEstimate = permissions.editEstimate && (!work.latestEstimate || ["awaiting_estimate", "revision_requested"].includes(estimateGate));
      const canStart = permissions.startWork && estimateApproved && !["in_progress", "complete", "cancelled"].includes(work.status);
      const canComplete = permissions.completeWork && work.status === "in_progress";
      const scheduleValue = work.scheduledStartAt || work.proposedStartAt;
      const estimate = estimateDrafts[work.id] || {
        cost: work.latestEstimate?.quotedCost?.toString() || "",
        labor: work.latestEstimate?.estimatedLaborMinutes ? String(work.latestEstimate.estimatedLaborMinutes / 60) : "",
        elapsed: work.latestEstimate?.estimatedElapsedMinutes ? String(work.latestEstimate.estimatedElapsedMinutes / 60) : "",
        notes: work.latestEstimate?.notes || "",
      };
      const unresolvedParts = work.parts.filter((p) => !["received", "installed", "cancelled"].includes(p.status));

      return <section key={work.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2"><h3 className="text-base font-black">{work.title}</h3><span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${work.status === "in_progress" ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-600"}`}>{label(work.status)}</span></div>
            {work.description ? <p className="mt-1 text-xs leading-5 text-slate-500">{work.description}</p> : null}
          </div>
          <div className="text-xs font-bold text-slate-500">{dateTime(scheduleValue)}</div>
        </div>

        <div className="divide-y divide-slate-100">
          <div className="px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div><div className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">Schedule</div><div className="mt-0.5 text-sm font-black">{dateTime(scheduleValue)}</div><div className={`mt-1 text-xs font-bold ${scheduleConfirmed ? "text-emerald-700" : "text-amber-700"}`}>{scheduleConfirmed ? "✓ Confirmed" : "Needs your confirmation"}</div></div>
              {permissions.rescheduleWork && !["in_progress", "complete"].includes(work.status) ? <div className="flex gap-2">{!scheduleConfirmed ? <button disabled={working === work.id} onClick={() => void post(work.id, `/api/partner/work-orders/${work.id}/schedule`, { startAt: localInputValue(work.proposedStartAt || work.scheduledStartAt), endAt: localInputValue(work.proposedEndAt || work.scheduledEndAt) }, "Schedule confirmed.")} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[10px] font-black text-white">Confirm</button> : null}<button onClick={() => setEditing(editing === `${work.id}:schedule` ? null : `${work.id}:schedule`)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-[10px] font-black">Edit</button></div> : null}
            </div>
            {editing === `${work.id}:schedule` ? <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3"><input type="datetime-local" value={scheduleDrafts[work.id] ?? localInputValue(scheduleValue)} onChange={(e) => setScheduleDrafts((c) => ({ ...c, [work.id]: e.target.value }))} className="rounded-lg border border-slate-200 px-3 py-2 text-xs"/><button onClick={() => void post(work.id, `/api/partner/work-orders/${work.id}/schedule`, { startAt: scheduleDrafts[work.id] ?? localInputValue(scheduleValue), endAt: localInputValue(work.scheduledEndAt || work.proposedEndAt) }, "Schedule updated.")} className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-black text-white">Save</button></div> : null}
          </div>

          <div className="px-4 py-3">
            <div className="flex items-center justify-between gap-3"><div><div className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">Location</div><div className="mt-0.5 text-sm font-black">{work.locationName || "Not set"}</div><div className={`mt-1 text-xs font-bold ${locationConfirmed ? "text-emerald-700" : "text-amber-700"}`}>{locationConfirmed ? "✓ Confirmed" : "Needs your confirmation"}</div></div><div className="flex gap-2">{!locationConfirmed ? <button disabled={!work.locationName || working === work.id} onClick={() => void post(work.id, `/api/partner/work-orders/${work.id}/logistics`, { kind: "location", action: "confirm", note: "" }, "Location confirmed.")} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[10px] font-black text-white disabled:opacity-40">Confirm</button> : null}<button onClick={() => setEditing(editing === `${work.id}:location` ? null : `${work.id}:location`)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-[10px] font-black">Change</button></div></div>
            {editing === `${work.id}:location` ? <div className="mt-3 border-t border-slate-100 pt-3"><textarea rows={2} value={notes[`${work.id}:location`] || ""} onChange={(e) => setNotes((c) => ({ ...c, [`${work.id}:location`]: e.target.value }))} placeholder="What should change?" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs"/><button onClick={() => void post(work.id, `/api/partner/work-orders/${work.id}/logistics`, { kind: "location", action: "adjust", note: notes[`${work.id}:location`] || "" }, "Location change requested.")} className="mt-2 rounded-lg bg-slate-950 px-3 py-2 text-xs font-black text-white">Send Request</button></div> : null}
          </div>

          <div className="px-4 py-3">
            <div className="flex items-start justify-between gap-3"><div><div className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">Parts</div><div className="mt-0.5 text-sm font-black">{work.parts.length ? `${work.parts.length} tracked · ${unresolvedParts.length} pending` : "No parts listed"}</div><div className={`mt-1 text-xs font-bold ${partsConfirmed ? "text-emerald-700" : "text-amber-700"}`}>{partsConfirmed ? "✓ Parts reviewed" : "Review the parts for this job"}</div></div><div className="flex gap-2">{!partsConfirmed ? <button onClick={() => void post(work.id, `/api/partner/work-orders/${work.id}/logistics`, { kind: "parts", action: "confirm", note: "" }, work.parts.length ? "Parts confirmed." : "Confirmed no parts needed.")} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[10px] font-black text-white">{work.parts.length ? "Confirm" : "Confirm No Parts"}</button> : null}<button onClick={() => setEditing(editing === `${work.id}:parts` ? null : `${work.id}:parts`)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-[10px] font-black">{editing === `${work.id}:parts` ? "Close" : "View / Update"}</button></div></div>
            {(editing === `${work.id}:parts` || (!partsConfirmed && work.parts.length > 0)) ? <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">{work.parts.map((part) => <div key={part.id} className="rounded-lg bg-slate-50 px-3 py-2"><div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><span className="text-sm font-black">{part.description}{part.quantity && part.quantity !== 1 ? ` × ${part.quantity}` : ""}</span><span className="rounded-full bg-white px-2 py-0.5 text-[9px] font-black text-slate-600">{part.dependencyResolution === "partner_supplied" ? "Partner Supplied" : label(part.status)}</span></div><div className="mt-1 text-xs text-slate-500">{part.etaAt ? shortDate(part.etaAt) : ["ordered", "backordered"].includes(part.status) ? "ETA not entered" : part.partNumber ? `Part ${part.partNumber}` : ""}</div></div>{permissions.updateParts ? <div className="flex flex-wrap gap-1.5">{part.dependencyResolution !== "partner_supplied" && !["received", "installed"].includes(part.status) ? <button onClick={() => void updatePart(work, part.id, "partner_supplied")} className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[9px] font-black">I’m Supplying This</button> : null}{["ordered", "backordered"].includes(part.status) ? <button onClick={() => void updatePart(work, part.id, "received")} className="rounded-full bg-emerald-600 px-2.5 py-1 text-[9px] font-black text-white">Mark Received</button> : null}{part.status === "ordered" ? <button onClick={() => void updatePart(work, part.id, "delayed")} className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[9px] font-black text-amber-800">Report Delay</button> : null}</div> : null}</div></div>)}<div className="pt-1"><textarea rows={2} value={notes[`${work.id}:parts`] || ""} onChange={(e) => setNotes((c) => ({ ...c, [`${work.id}:parts`]: e.target.value }))} placeholder="Missing part, wrong part, or another parts issue?" className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"/><button onClick={() => void post(work.id, `/api/partner/work-orders/${work.id}/logistics`, { kind: "parts", action: "adjust", note: notes[`${work.id}:parts`] || "" }, "Parts update sent to the dealer.")} className="mt-2 rounded-lg border border-slate-300 px-3 py-1.5 text-[10px] font-black">Report Parts Issue</button></div></div> : null}
          </div>

          <div className="px-4 py-3">
            <div className="flex items-center justify-between gap-3"><div><div className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">Your labor estimate</div>{work.latestEstimate ? <div className="mt-1 flex flex-wrap gap-3 text-xs font-bold text-slate-600"><span>{money(work.latestEstimate.quotedCost)}</span><span>{hours(work.latestEstimate.estimatedLaborMinutes)} hands-on</span><span>{hours(work.latestEstimate.estimatedElapsedMinutes)} turnaround</span><span className={estimateGate === "approved" ? "text-emerald-700" : "text-amber-700"}>{estimateGate === "approved" ? "✓ Approved" : label(estimateGate)}</span></div> : <div className="mt-1 text-xs font-bold text-amber-700">Estimate required</div>}</div>{permissions.editEstimate && !["in_progress", "complete"].includes(work.status) ? <button onClick={() => setEditing(editing === `${work.id}:estimate` ? null : `${work.id}:estimate`)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-[10px] font-black">{work.latestEstimate ? "Revise" : "Add Estimate"}</button> : null}</div>
            {editing === `${work.id}:estimate` ? <div className="mt-3 grid gap-2 border-t border-slate-100 pt-3 sm:grid-cols-3"><input value={estimate.cost} onChange={(e) => setEstimateDrafts((c) => ({ ...c, [work.id]: { ...estimate, cost: e.target.value } }))} placeholder="Labor quote $" className="rounded-lg border border-slate-200 px-3 py-2 text-xs"/><input value={estimate.labor} onChange={(e) => setEstimateDrafts((c) => ({ ...c, [work.id]: { ...estimate, labor: e.target.value } }))} placeholder="Hands-on hours" className="rounded-lg border border-slate-200 px-3 py-2 text-xs"/><input value={estimate.elapsed} onChange={(e) => setEstimateDrafts((c) => ({ ...c, [work.id]: { ...estimate, elapsed: e.target.value } }))} placeholder="Turnaround hours" className="rounded-lg border border-slate-200 px-3 py-2 text-xs"/><textarea rows={2} value={estimate.notes} onChange={(e) => setEstimateDrafts((c) => ({ ...c, [work.id]: { ...estimate, notes: e.target.value } }))} placeholder="Notes" className="rounded-lg border border-slate-200 px-3 py-2 text-xs sm:col-span-3"/><button onClick={() => void submitEstimate(work)} className="rounded-lg bg-blue-700 px-3 py-2 text-xs font-black text-white sm:col-span-3">Submit Labor Estimate</button></div> : null}
          </div>

          <div className="bg-slate-50 px-4 py-3"><div className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">Next action</div>{needsEstimate ? <div className="mt-1 text-sm font-black">Submit your labor estimate</div> : estimateGate === "awaiting_review" ? <div className="mt-1 text-sm font-black">Awaiting estimate approval</div> : canStart ? <button disabled={working === work.id} onClick={() => void post(work.id, `/api/partner/work-orders/${work.id}/status`, { status: "in_progress" }, "Work started.")} className="mt-2 rounded-lg bg-slate-950 px-4 py-2 text-xs font-black text-white">Start Work</button> : canComplete ? <button disabled={working === work.id} onClick={() => void post(work.id, `/api/partner/work-orders/${work.id}/status`, { status: "complete" }, "Work marked complete.")} className="mt-2 rounded-lg bg-slate-950 px-4 py-2 text-xs font-black text-white">Mark Complete</button> : <div className="mt-1 text-sm font-black">{work.status === "complete" ? "Work complete" : "All going to plan"}</div>}</div>
        </div>
        {work.blockerReason ? <div className="border-t border-red-200 bg-red-50 px-4 py-3 text-xs font-bold text-red-800"><span className="font-black">Blocked:</span> {work.blockerReason}</div> : null}
        {messages[work.id] ? <div className="border-t border-slate-100 px-4 py-2 text-xs font-bold text-slate-600">{messages[work.id]}</div> : null}
      </section>;
    })}
  </div>;
}
