"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import type { PartnerDetailingAssignment } from "@/lib/partner-portal/detailing";

function localInput(value: string | null) {
  if (!value) return "";
  const d = new Date(value);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function when(value: string | null) {
  return value ? new Date(value).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "Time not confirmed";
}

export function PartnerDetailingList({ items }: { items: PartnerDetailingAssignment[] }) {
  const router = useRouter();
  const [expandedId, setExpandedId] = useState<string | null>(items.find((item) => item.status === "in_progress")?.id || items[0]?.id || null);
  const [drafts, setDrafts] = useState<Record<string, { time: string; turnaround: string; quote: string; notes: string }>>({});
  const [working, setWorking] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  function draftFor(item: PartnerDetailingAssignment) {
    return drafts[item.id] || {
      time: localInput(item.scheduledStartAt),
      turnaround: item.expectedTurnaroundMinutes == null ? "" : String(Math.round((item.expectedTurnaroundMinutes / 60) * 10) / 10),
      quote: item.quotedCost?.toString() || "",
      notes: item.notes || "",
    };
  }

  function setDraft(item: PartnerDetailingAssignment, patch: Partial<ReturnType<typeof draftFor>>) {
    setDrafts((current) => ({ ...current, [item.id]: { ...draftFor(item), ...patch } }));
  }

  async function save(item: PartnerDetailingAssignment, status?: string) {
    const draft = draftFor(item);
    setWorking(item.id); setMessage("");
    try {
      const response = await fetch(`/api/partner/detailing/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduledStartAt: draft.time ? new Date(draft.time).toISOString() : null,
          expectedTurnaroundMinutes: draft.turnaround ? Math.round(Number(draft.turnaround) * 60) : null,
          quotedCost: draft.quote || null,
          notes: draft.notes || null,
          ...(status ? { status } : {}),
        }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Failed to update detailing.");
      setMessage(status === "completed" ? "Detailing marked complete and sent for manager acceptance." : "Detailing updated.");
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Failed to update detailing."); }
    finally { setWorking(null); }
  }

  if (!items.length) return null;

  return <section className="mb-5 rounded-2xl border border-blue-200 bg-blue-50/40 p-4 shadow-sm">
    <div className="flex items-center justify-between gap-3">
      <div><div className="text-[10px] font-black uppercase tracking-[0.12em] text-blue-700">Detailing Stage</div><h2 className="mt-1 text-lg font-black">Assigned sale-prep details</h2></div>
      <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-black text-blue-800">{items.length}</span>
    </div>
    {message ? <div className="mt-3 rounded-xl bg-white px-3 py-2 text-xs font-bold text-slate-700">{message}</div> : null}
    <div className="mt-3 space-y-2">{items.map((item) => {
      const expanded = expandedId === item.id;
      const draft = draftFor(item);
      return <article key={item.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <button type="button" onClick={() => setExpandedId(expanded ? null : item.id)} className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left">
          <div><div className="flex flex-wrap items-center gap-2"><span className="text-sm font-black">{item.vehicleLabel}</span><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-black uppercase text-slate-600">{item.status.replaceAll("_", " ")}</span></div><div className="mt-1 text-xs text-slate-500">{item.detailLevel.replaceAll("_", " ")} · {when(item.scheduledStartAt)}{item.vin ? ` · VIN …${item.vin.slice(-8)}` : ""}</div></div>
          <span className="text-lg font-black text-slate-400">{expanded ? "⌃" : "⌄"}</span>
        </button>
        {expanded ? <div className="border-t border-slate-200 px-4 py-4">
          <div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">Scope</div>
          <div className="mt-2 flex flex-wrap gap-1.5">{item.scopeItems.map((scope) => <span key={scope} className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-700">{scope}</span>)}</div>
          {item.customScope ? <p className="mt-2 text-xs text-slate-600">{item.customScope}</p> : null}
          <div className="mt-4 grid gap-2 sm:grid-cols-3"><label className="text-[10px] font-black text-slate-500">Schedule<input type="datetime-local" value={draft.time} onChange={(e) => setDraft(item, { time: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-xs" /></label><label className="text-[10px] font-black text-slate-500">Turnaround (hr)<input type="number" min="0" step="0.5" value={draft.turnaround} onChange={(e) => setDraft(item, { turnaround: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-xs" /></label><label className="text-[10px] font-black text-slate-500">Your quote<input type="number" min="0" step="0.01" value={draft.quote} onChange={(e) => setDraft(item, { quote: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-xs" /></label></div>
          <textarea value={draft.notes} onChange={(e) => setDraft(item, { notes: e.target.value })} placeholder="Notes for Mindful" className="mt-2 min-h-16 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs" />
          <div className="mt-3 flex flex-wrap justify-end gap-2"><button disabled={working === item.id} onClick={() => void save(item)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-black">Save</button>{!["in_progress", "completed"].includes(item.status) ? <button disabled={working === item.id || !draft.time} onClick={() => void save(item, "scheduled")} className="rounded-lg bg-blue-700 px-3 py-2 text-xs font-black text-white">Confirm Schedule</button> : null}{item.status === "scheduled" ? <button disabled={working === item.id} onClick={() => void save(item, "in_progress")} className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-black text-white">Start Detailing</button> : null}{item.status === "in_progress" ? <button disabled={working === item.id} onClick={() => void save(item, "completed")} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-black text-white">Complete</button> : null}</div>
        </div> : null}
      </article>;
    })}</div>
  </section>;
}
