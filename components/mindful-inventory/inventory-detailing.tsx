"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { DETAIL_SCOPE_OPTIONS, type InventoryDetailingView, type InventoryDetailLevel } from "@/lib/mindful-inventory/detailing";
import type { InventoryPerformerOption } from "@/lib/mindful-inventory/performers";

const LEVELS: Array<{ value: InventoryDetailLevel; label: string; description: string }> = [
  { value: "presentation", label: "Presentation Prep", description: "Light cleanup for an already-clean vehicle." },
  { value: "retail", label: "Retail Detail", description: "Standard sale-ready interior and exterior detail." },
  { value: "full", label: "Full Interior + Exterior", description: "Deep clean with more intensive interior and exterior work." },
  { value: "restoration", label: "Restoration / Heavy Recon", description: "Heavy correction for neglected or difficult-condition vehicles." },
  { value: "custom", label: "Custom Scope", description: "Build a vehicle-specific detailing package." },
];

function localInput(value: string | null) {
  if (!value) return "";
  const d = new Date(value);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function money(value: number | null) {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

export function InventoryDetailing({ detailing, performers }: { detailing: InventoryDetailingView; performers: InventoryPerformerOption[] }) {
  const router = useRouter();
  const partners = useMemo(() => performers.filter((item) => item.type === "partner"), [performers]);
  const suggestedPartners = useMemo(() => partners.filter((partner) => [...partner.capabilityCodes, ...partner.capabilityNames].some((value) => /detail|paint correction|ceramic|interior|pdr|dent/i.test(value))), [partners]);

  const [partnerId, setPartnerId] = useState(detailing.partnerId || "");
  const [detailLevel, setDetailLevel] = useState<InventoryDetailLevel>(detailing.detailLevel);
  const [scopeItems, setScopeItems] = useState<string[]>(detailing.scopeItems);
  const [customScope, setCustomScope] = useState(detailing.customScope || "");
  const [scheduledStart, setScheduledStart] = useState(localInput(detailing.scheduledStartAt || detailing.proposedStartAt));
  const [turnaroundHours, setTurnaroundHours] = useState(detailing.expectedTurnaroundMinutes == null ? "" : String(Math.round((detailing.expectedTurnaroundMinutes / 60) * 10) / 10));
  const [quotedCost, setQuotedCost] = useState(detailing.quotedCost?.toString() || "");
  const [actualCost, setActualCost] = useState(detailing.actualCost?.toString() || "");
  const [notes, setNotes] = useState(detailing.notes || "");
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");

  function toggleScope(item: string) {
    setScopeItems((current) => current.includes(item) ? current.filter((value) => value !== item) : [...current, item]);
  }

  async function save(status?: string) {
    setWorking(true); setMessage("");
    try {
      const response = await fetch(`/api/mindful/inventory/vehicles/${detailing.vehicleId}/detailing`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partnerId: partnerId || null,
          detailLevel,
          scopeItems,
          customScope: customScope || null,
          scheduledStartAt: scheduledStart ? new Date(scheduledStart).toISOString() : null,
          expectedTurnaroundMinutes: turnaroundHours ? Math.round(Number(turnaroundHours) * 60) : null,
          quotedCost: quotedCost || null,
          actualCost: actualCost || null,
          notes: notes || null,
          ...(status ? { status } : {}),
        }),
      });
      const payload = await response.json() as { error?: string; status?: string };
      if (!response.ok) throw new Error(payload.error || "Failed to update detailing.");
      setMessage(status === "accepted" ? "Detailing accepted. Vehicle moved to Final QC." : "Detailing saved.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to update detailing.");
    } finally { setWorking(false); }
  }

  const statusLabel = detailing.status.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
  const canStart = Boolean(partnerId && scheduledStart) && !["in_progress", "completed", "accepted"].includes(detailing.status);
  const canComplete = detailing.status === "in_progress";
  const canAccept = detailing.status === "completed";

  return <div className="space-y-4">
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">Mandatory Stage</div>
          <h2 className="mt-1 text-2xl font-black">Detailing</h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">Every vehicle passes through a dedicated sale-prep detail before Final QC. Detailing partners remain available for earlier Active Work assignments too.</p>
        </div>
        <span className={`rounded-full px-3 py-1.5 text-xs font-black ${detailing.status === "accepted" ? "bg-emerald-100 text-emerald-800" : detailing.status === "in_progress" ? "bg-blue-100 text-blue-800" : detailing.status === "completed" ? "bg-violet-100 text-violet-800" : "bg-amber-100 text-amber-800"}`}>{statusLabel}</span>
      </div>
      {message ? <div className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700">{message}</div> : null}
    </section>

    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="grid gap-5 lg:grid-cols-2">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">1 · Detailer</div>
          <select value={partnerId} onChange={(e) => setPartnerId(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-bold">
            <option value="">Select detailing partner</option>
            {suggestedPartners.length ? <optgroup label="Suggested for detailing">{suggestedPartners.map((partner) => <option key={partner.id} value={partner.id}>{partner.displayName}{partner.secondaryLabel ? ` · ${partner.secondaryLabel}` : ""}</option>)}</optgroup> : null}
            <optgroup label="All partners">{partners.filter((partner) => !suggestedPartners.some((item) => item.id === partner.id)).map((partner) => <option key={partner.id} value={partner.id}>{partner.displayName}{partner.secondaryLabel ? ` · ${partner.secondaryLabel}` : ""}</option>)}</optgroup>
          </select>
          <div className="mt-2 text-xs text-slate-500">Suggested partners are ranked by detailing-related capabilities. All partners remain selectable.</div>
        </div>

        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">2 · Service Level</div>
          <div className="mt-2 grid gap-2">{LEVELS.map((level) => <button key={level.value} type="button" onClick={() => setDetailLevel(level.value)} className={`rounded-xl border px-3 py-2.5 text-left ${detailLevel === level.value ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white"}`}><div className="text-sm font-black">{level.label}</div><div className={`mt-0.5 text-[11px] ${detailLevel === level.value ? "text-slate-300" : "text-slate-500"}`}>{level.description}</div></button>)}</div>
        </div>
      </div>

      <div className="mt-6 border-t border-slate-200 pt-5">
        <div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">3 · Scope</div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{DETAIL_SCOPE_OPTIONS.map((item) => <label key={item} className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-bold ${scopeItems.includes(item) ? "border-blue-300 bg-blue-50 text-blue-900" : "border-slate-200 bg-white text-slate-700"}`}><input type="checkbox" checked={scopeItems.includes(item)} onChange={() => toggleScope(item)} />{item}</label>)}</div>
        <textarea value={customScope} onChange={(e) => setCustomScope(e.target.value)} placeholder="Custom scope / vehicle-specific instructions" className="mt-3 min-h-24 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm" />
      </div>

      <div className="mt-6 grid gap-4 border-t border-slate-200 pt-5 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs font-black text-slate-600">Scheduled start<input type="datetime-local" value={scheduledStart} onChange={(e) => setScheduledStart(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5" /></label>
        <label className="text-xs font-black text-slate-600">Turnaround (hr)<input type="number" min="0" step="0.5" value={turnaroundHours} onChange={(e) => setTurnaroundHours(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5" /></label>
        <label className="text-xs font-black text-slate-600">Partner quote<input type="number" min="0" step="0.01" value={quotedCost} onChange={(e) => setQuotedCost(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5" /></label>
        <label className="text-xs font-black text-slate-600">Actual cost<input type="number" min="0" step="0.01" value={actualCost} onChange={(e) => setActualCost(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5" /></label>
      </div>
      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Detailing notes" className="mt-4 min-h-20 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm" />

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
        <div className="text-xs font-semibold text-slate-500">Current quote {money(detailing.quotedCost)} · Actual {money(detailing.actualCost)}</div>
        <div className="flex flex-wrap gap-2">
          <button disabled={working} onClick={() => void save()} className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-black">Save Setup</button>
          {canStart ? <button disabled={working} onClick={() => void save("in_progress")} className="rounded-xl bg-blue-700 px-4 py-2.5 text-xs font-black text-white">Start Detailing</button> : null}
          {canComplete ? <button disabled={working} onClick={() => void save("completed")} className="rounded-xl bg-slate-950 px-4 py-2.5 text-xs font-black text-white">Mark Completed</button> : null}
          {canAccept ? <button disabled={working} onClick={() => void save("accepted")} className="rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-black text-white">Accept & Move to QC →</button> : null}
        </div>
      </div>
    </section>
  </div>;
}
