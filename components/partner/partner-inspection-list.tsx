"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import type { PartnerInspectionItem } from "@/lib/partner-portal/inspections";

function when(value: string | null) {
  if (!value) return "Not scheduled";
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function money(value: number | null) {
  if (value === null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

export function PartnerInspectionList({ items, typicalDurationHours }: { items: PartnerInspectionItem[]; typicalDurationHours: number | null }) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(items.find((item) => !["complete", "submitted"].includes(item.status))?.id || null);
  const [working, setWorking] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [summaries, setSummaries] = useState<Record<string, string>>(() => Object.fromEntries(items.map((item) => [item.id, item.summary || ""])));
  const [findingNotes, setFindingNotes] = useState<Record<string, string>>({});
  const [newFinding, setNewFinding] = useState<Record<string, { title: string; description: string }>>({});

  async function act(item: PartnerInspectionItem, body: Record<string, unknown>) {
    setWorking(item.id); setMessages((current) => ({ ...current, [item.id]: "" }));
    try {
      const response = await fetch(`/api/partner/inspections/${item.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Inspection could not be updated.");
      router.refresh();
    } catch (error) {
      setMessages((current) => ({ ...current, [item.id]: error instanceof Error ? error.message : "Inspection could not be updated." }));
    } finally { setWorking(null); }
  }

  if (!items.length) return <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center text-sm font-semibold text-slate-500">No mechanical inspections are assigned to you right now.</div>;

  return <div className="space-y-3">{items.map((item) => {
    const open = openId === item.id;
    const editable = ["in_progress", "revision_requested"].includes(item.status);
    const submitted = item.status === "submitted";
    const complete = item.status === "complete";
    return <section key={item.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <button type="button" onClick={() => setOpenId(open ? null : item.id)} className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left">
        <div><div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-black">{item.vehicleLabel}</h2><span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black uppercase text-slate-600">{item.status.replaceAll("_", " ")}</span></div><div className="mt-1 text-xs font-semibold text-slate-500">{item.vin || "No VIN"} · {item.mileage === null ? "Mileage —" : `${item.mileage.toLocaleString()} mi`} · {when(item.scheduledStartAt || item.requestedStartAt)}</div></div>
        <div className="text-right"><div className="text-xs font-black text-slate-500">Inspection fee</div><div className="font-black">{money(item.inspectionFee)}</div></div>
      </button>
      {open ? <div className="border-t border-slate-100 px-5 py-5">
        {item.revisionNotes ? <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900"><span className="font-black">Owner requested revision:</span> {item.revisionNotes}</div> : null}

        {item.status === "assigned" ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4"><div><div className="font-black">New inspection assignment</div><div className="mt-1 text-sm text-slate-600">Requested {when(item.requestedStartAt)}</div></div><button disabled={working === item.id} onClick={() => void act(item, { action: "confirm", durationHours: typicalDurationHours || 1.5 })} className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white">Confirm Inspection</button></div> : null}

        {item.status === "confirmed" ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4"><div><div className="font-black">Scheduled</div><div className="mt-1 text-sm text-slate-600">{when(item.scheduledStartAt)}</div></div><button disabled={working === item.id} onClick={() => void act(item, { action: "start" })} className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white">Start Inspection</button></div> : null}

        {submitted ? <div className="rounded-xl border border-blue-200 bg-blue-50 p-4"><div className="font-black text-blue-950">Submitted for Owner review</div><div className="mt-1 text-sm text-blue-800">The inspection is locked while the Owner validates the findings. Approved work will not automatically be assigned to you.</div></div> : null}
        {complete ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4"><div className="font-black text-emerald-950">Owner accepted this inspection</div><div className="mt-1 text-sm text-emerald-800">Any resulting work will appear separately in My Work only if it is assigned to you.</div></div> : null}

        {(editable || item.status === "in_progress") ? <>
          <div className="mt-5"><div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">Lot Logic findings to validate</div><div className="mt-3 space-y-3">{item.findings.map((finding) => <div key={finding.id} className="rounded-xl border border-slate-200 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="font-black">{finding.title}</div>{finding.description ? <div className="mt-1 text-sm text-slate-600">{finding.description}</div> : null}</div><span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black uppercase text-slate-500">{finding.validationStatus.replaceAll("_", " ")}</span></div><textarea value={findingNotes[finding.id] ?? finding.validationNotes ?? ""} onChange={(e) => setFindingNotes((current) => ({ ...current, [finding.id]: e.target.value }))} placeholder="Diagnostic notes" className="mt-3 min-h-16 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" /><div className="mt-2 flex flex-wrap gap-2">{[["confirmed","Confirm"],["not_found","Not Found"],["changed","Changed"],["needs_diagnosis","Needs Diagnosis"]].map(([status,label]) => <button key={status} disabled={working === item.id} onClick={() => void act(item, { action: "validate_finding", findingId: finding.id, status, notes: findingNotes[finding.id] ?? finding.validationNotes ?? "" })} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50">{label}</button>)}</div></div>)}</div></div>

          <div className="mt-5 rounded-xl border border-dashed border-slate-300 p-4"><div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">New mechanical finding</div><div className="mt-2 grid gap-2 sm:grid-cols-2"><input value={newFinding[item.id]?.title || ""} onChange={(e) => setNewFinding((current) => ({ ...current, [item.id]: { title: e.target.value, description: current[item.id]?.description || "" } }))} placeholder="Finding title" className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold" /><input value={newFinding[item.id]?.description || ""} onChange={(e) => setNewFinding((current) => ({ ...current, [item.id]: { title: current[item.id]?.title || "", description: e.target.value } }))} placeholder="What did you find?" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" /></div><button disabled={working === item.id || !newFinding[item.id]?.title.trim()} onClick={() => void act(item, { action: "add_finding", title: newFinding[item.id]?.title, description: newFinding[item.id]?.description })} className="mt-2 rounded-lg border border-slate-300 px-3 py-2 text-xs font-black">Add Finding</button></div>

          <div className="mt-5"><label className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">Inspection summary<textarea value={summaries[item.id] || ""} onChange={(e) => setSummaries((current) => ({ ...current, [item.id]: e.target.value }))} placeholder="Overall mechanical condition, important risks, and recommendations" className="mt-2 min-h-24 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium normal-case tracking-normal" /></label><button disabled={working === item.id} onClick={() => void act(item, { action: item.status === "revision_requested" ? "start" : "submit", summary: summaries[item.id] || "" })} className="mt-3 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white">{item.status === "revision_requested" ? "Reopen Inspection" : "Submit to Owner"}</button></div>
        </> : null}

        {messages[item.id] ? <div className="mt-3 text-sm font-bold text-red-600">{messages[item.id]}</div> : null}
      </div> : null}
    </section>;
  })}</div>;
}
