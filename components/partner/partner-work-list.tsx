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

function label(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function PartnerWorkList({ workItems, permissions }: { workItems: PartnerWorkItem[]; permissions: PartnerPortalPermissions }) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [message, setMessage] = useState<Record<string, string>>({});
  const [drafts, setDrafts] = useState<Record<string, { cost: string; laborHours: string; elapsedHours: string; notes: string }>>({});

  function draftFor(work: PartnerWorkItem) {
    return drafts[work.id] ?? {
      cost: work.latestEstimate?.quotedCost == null ? "" : String(work.latestEstimate.quotedCost),
      laborHours: work.latestEstimate?.estimatedLaborMinutes == null ? "" : String(Math.round((work.latestEstimate.estimatedLaborMinutes / 60) * 10) / 10),
      elapsedHours: work.latestEstimate?.estimatedElapsedMinutes == null ? "" : String(Math.round((work.latestEstimate.estimatedElapsedMinutes / 60) * 10) / 10),
      notes: work.latestEstimate?.notes ?? "",
    };
  }

  function updateDraft(work: PartnerWorkItem, key: "cost" | "laborHours" | "elapsedHours" | "notes", value: string) {
    setDrafts((current) => ({ ...current, [work.id]: { ...draftFor(work), [key]: value } }));
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
      setEditingId(null);
      setMessage((current) => ({ ...current, [work.id]: `Estimate submitted as revision ${payload.revisionNo}.` }));
      router.refresh();
    } catch (error) {
      setMessage((current) => ({ ...current, [work.id]: error instanceof Error ? error.message : "Estimate could not be submitted." }));
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

  return <div className="space-y-4">
    {workItems.map((work) => {
      const draft = draftFor(work);
      const scheduled = work.scheduledStartAt || work.proposedStartAt;
      const canStart = permissions.startWork && !["in_progress", "complete", "cancelled"].includes(work.status);
      const canComplete = permissions.completeWork && work.status === "in_progress";
      return <section key={work.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">{work.vehicleLabel}</div>
              <h2 className="mt-1 text-xl font-black">{work.title}</h2>
              {work.description ? <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">{work.description}</p> : null}
            </div>
            <span className="self-start rounded-full bg-white px-3 py-1.5 text-xs font-black text-slate-700 shadow-sm">{label(work.status)}</span>
          </div>
        </div>

        <div className="grid gap-5 p-5 xl:grid-cols-[1fr_1fr]">
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-200 p-3"><div className="text-[10px] font-black uppercase text-slate-400">Schedule</div><div className="mt-1 text-sm font-black">{dateTime(scheduled)}</div>{work.scheduledEndAt || work.proposedEndAt ? <div className="mt-1 text-xs text-slate-500">Expected handoff: {dateTime(work.scheduledEndAt || work.proposedEndAt)}</div> : null}</div>
              <div className="rounded-xl border border-slate-200 p-3"><div className="text-[10px] font-black uppercase text-slate-400">Location</div><div className="mt-1 text-sm font-black">{work.locationName || "To be confirmed"}</div></div>
              <div className="rounded-xl border border-slate-200 p-3"><div className="text-[10px] font-black uppercase text-slate-400">VIN</div><div className="mt-1 break-all font-mono text-xs font-bold">{work.vin || "—"}</div></div>
              <div className="rounded-xl border border-slate-200 p-3"><div className="text-[10px] font-black uppercase text-slate-400">Work type</div><div className="mt-1 text-sm font-black">{label(work.subcategory || work.category)}</div></div>
            </div>

            {work.blockerReason ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800"><span className="font-black">Blocked:</span> {work.blockerReason}</div> : null}

            <div className="flex flex-wrap gap-2">
              {canStart ? <button disabled={workingId === work.id} onClick={() => void setStatus(work, "in_progress")} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-black text-slate-800 disabled:opacity-40">Start Work</button> : null}
              {canComplete ? <button disabled={workingId === work.id} onClick={() => void setStatus(work, "complete")} className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-black text-white disabled:opacity-40">Mark Complete</button> : null}
            </div>
          </div>

          <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-4">
            <div className="text-[10px] font-black uppercase tracking-[0.12em] text-blue-700">Independent estimate</div>
            <h3 className="mt-1 text-lg font-black">Your price and timing</h3>
            <p className="mt-1 text-xs leading-5 text-slate-600">Enter your own estimate based on the scope above. Lot Logic&apos;s internal planning estimate is intentionally not shown so your quote remains independent.</p>

            {work.latestEstimate && editingId !== work.id ? <div className="mt-4 rounded-xl border border-blue-100 bg-white p-4">
              <div className="flex items-center justify-between gap-3"><div className="font-black">Latest estimate</div><div className="text-xs font-bold text-slate-400">Revision {work.latestEstimate.revisionNo}</div></div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center"><div><div className="text-lg font-black">{money(work.latestEstimate.quotedCost)}</div><div className="text-[10px] font-black uppercase text-slate-400">Quote</div></div><div><div className="text-lg font-black">{hours(work.latestEstimate.estimatedLaborMinutes)}</div><div className="text-[10px] font-black uppercase text-slate-400">Labor</div></div><div><div className="text-lg font-black">{hours(work.latestEstimate.estimatedElapsedMinutes)}</div><div className="text-[10px] font-black uppercase text-slate-400">Turnaround</div></div></div>
              {work.latestEstimate.notes ? <p className="mt-3 text-sm text-slate-600">{work.latestEstimate.notes}</p> : null}
              {permissions.editEstimate ? <button onClick={() => setEditingId(work.id)} className="mt-3 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-black">Revise Estimate</button> : null}
            </div> : null}

            {permissions.editEstimate && (!work.latestEstimate || editingId === work.id) ? <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <label className="text-xs font-black text-slate-600">Quote ($)<input inputMode="decimal" value={draft.cost} onChange={(event) => updateDraft(work, "cost", event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold" /></label>
              <label className="text-xs font-black text-slate-600">Hands-on labor (hr)<input inputMode="decimal" value={draft.laborHours} onChange={(event) => updateDraft(work, "laborHours", event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold" /></label>
              <label className="text-xs font-black text-slate-600">Elapsed turnaround (hr)<input inputMode="decimal" value={draft.elapsedHours} onChange={(event) => updateDraft(work, "elapsedHours", event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold" /></label>
              <label className="sm:col-span-3 text-xs font-black text-slate-600">Notes<textarea rows={3} value={draft.notes} onChange={(event) => updateDraft(work, "notes", event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold" /></label>
              <div className="sm:col-span-3 flex flex-wrap gap-2"><button disabled={workingId === work.id} onClick={() => void submitEstimate(work)} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-black text-white disabled:opacity-40">{workingId === work.id ? "Submitting…" : work.latestEstimate ? "Submit Revision" : "Submit Estimate"}</button>{work.latestEstimate ? <button onClick={() => setEditingId(null)} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-black">Cancel</button> : null}</div>
            </div> : null}

            {!permissions.editEstimate ? <div className="mt-4 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-500">Estimate entry is not enabled for this partner account.</div> : null}
            {message[work.id] ? <div className="mt-3 text-xs font-black text-slate-700">{message[work.id]}</div> : null}
          </div>
        </div>
      </section>;
    })}
  </div>;
}
