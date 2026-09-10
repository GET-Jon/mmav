"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { SuggestedTimePicker } from "@/components/scheduling/suggested-time-picker";
import { DETAIL_SCOPE_OPTIONS, type InventoryDetailingView, type InventoryDetailLevel } from "@/lib/mindful-inventory/detailing";
import type { InventoryPerformerOption } from "@/lib/mindful-inventory/performers";

const LEVELS: Array<{ value: InventoryDetailLevel; label: string; description: string }> = [
  { value: "presentation", label: "Presentation Prep", description: "Light cleanup for an already-clean vehicle." },
  { value: "retail", label: "Retail Detail", description: "Standard sale-ready interior and exterior detail." },
  { value: "full", label: "Full Interior + Exterior", description: "Deep clean with more intensive interior and exterior work." },
  { value: "restoration", label: "Restoration / Heavy Recon", description: "Heavy correction for neglected or difficult-condition vehicles." },
  { value: "custom", label: "Custom Scope", description: "Build a vehicle-specific detailing package." },
];

const DEFAULT_SCOPE: Record<Exclude<InventoryDetailLevel, "custom">, string[]> = {
  presentation: [
    "Exterior wash / decontamination",
    "Interior vacuum / wipe-down",
  ],
  retail: [
    "Exterior wash / decontamination",
    "Interior vacuum / wipe-down",
    "Leather cleaning / conditioning",
    "Wheel / tire deep clean",
  ],
  full: [
    "Exterior wash / decontamination",
    "Interior vacuum / wipe-down",
    "Interior extraction",
    "Leather cleaning / conditioning",
    "Paint correction",
    "Scratch / scuff touch-up",
    "Odor treatment",
    "Wheel / tire deep clean",
  ],
  restoration: [...DETAIL_SCOPE_OPTIONS],
};

type EditSection = "detailer" | "service" | "schedule" | "quote" | null;

function localInput(value: string | null) {
  if (!value) return "";
  const d = new Date(value);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function dateTimeLabel(value: string | null) {
  if (!value) return "Not scheduled";
  return new Date(value).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function money(value: number | null) {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function levelLabel(value: InventoryDetailLevel) {
  return LEVELS.find((item) => item.value === value)?.label || "Detail service";
}

function SummaryTile({ label, value, done, active, onClick }: { label: string; value: string; done: boolean; active: boolean; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={`cursor-pointer rounded-xl border px-3 py-3 text-left transition ${active ? "border-blue-500 bg-blue-50 ring-1 ring-blue-400" : done ? "border-emerald-200 bg-emerald-50/60" : "border-amber-200 bg-amber-50"}`}>
    <div className={`text-[10px] font-black uppercase tracking-[0.08em] ${done ? "text-emerald-800" : "text-amber-800"}`}>{done ? "✓ " : ""}{label}</div>
    <div className="mt-1 truncate text-xs font-bold text-slate-600">{value}</div>
  </button>;
}

export function InventoryDetailing({ detailing, performers }: { detailing: InventoryDetailingView; performers: InventoryPerformerOption[] }) {
  const router = useRouter();
  const partners = useMemo(() => performers.filter((item) => item.type === "partner"), [performers]);
  const suggestedPartners = useMemo(() => partners.filter((partner) => [...partner.capabilityCodes, ...partner.capabilityNames].some((value) => /detail|paint correction|ceramic|interior|pdr|dent/i.test(value))), [partners]);

  const [partnerId, setPartnerId] = useState(detailing.partnerId || "");
  const [detailLevel, setDetailLevel] = useState<InventoryDetailLevel>(detailing.detailLevel);
  const [scopeItems, setScopeItems] = useState<string[]>(detailing.scopeItems.length ? detailing.scopeItems : detailing.detailLevel === "custom" ? [] : DEFAULT_SCOPE[detailing.detailLevel]);
  const [scopeExpanded, setScopeExpanded] = useState(detailing.detailLevel === "custom");
  const [customScope, setCustomScope] = useState(detailing.customScope || "");
  const [scheduledStart, setScheduledStart] = useState(localInput(detailing.scheduledStartAt || detailing.proposedStartAt));
  const [manualSchedule, setManualSchedule] = useState(false);
  const [turnaroundHours, setTurnaroundHours] = useState(detailing.expectedTurnaroundMinutes == null ? "2" : String(Math.round((detailing.expectedTurnaroundMinutes / 60) * 10) / 10));
  const [quotedCost, setQuotedCost] = useState(detailing.quotedCost?.toString() || "");
  const [actualCost, setActualCost] = useState(detailing.actualCost?.toString() || "");
  const [notes, setNotes] = useState(detailing.notes || "");
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState<EditSection>(() => !detailing.partnerId ? "detailer" : !(detailing.scheduledStartAt || detailing.proposedStartAt) ? "schedule" : detailing.quotedCost == null ? "quote" : null);

  const selectedPartner = partners.find((item) => item.id === partnerId) || null;
  const scheduleValue = scheduledStart ? new Date(scheduledStart).toISOString() : null;

  function toggleSection(section: Exclude<EditSection, null>) {
    setEditing((current) => current === section ? null : section);
  }

  function selectLevel(value: InventoryDetailLevel) {
    setDetailLevel(value);
    if (value === "custom") {
      setScopeExpanded(true);
      return;
    }
    setScopeItems(DEFAULT_SCOPE[value]);
    setScopeExpanded(false);
  }

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
          scheduledStartAt: scheduleValue,
          expectedTurnaroundMinutes: turnaroundHours ? Math.round(Number(turnaroundHours) * 60) : null,
          quotedCost: quotedCost || null,
          actualCost: actualCost || null,
          notes: notes || null,
          ...(status ? { status } : {}),
        }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Failed to update detailing.");
      setMessage(status === "accepted" ? "Detailing accepted. Vehicle moved to Final QC." : status === "completed" ? "Detailing marked complete." : "Detailing setup saved.");
      if (!status) setEditing(null);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to update detailing.");
    } finally { setWorking(false); }
  }

  const statusLabel = detailing.status.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
  const canStart = Boolean(partnerId && scheduledStart) && !["in_progress", "completed", "accepted"].includes(detailing.status);
  const canComplete = detailing.status === "in_progress";
  const canAccept = detailing.status === "completed";
  const quoteDone = Boolean(quotedCost);

  return <div className="space-y-4">
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">Mandatory Stage</div>
          <h2 className="mt-1 text-2xl font-black">Detailing</h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">Set the detailer, service, timing, and price here. Fine-grained scope stays tucked away unless the package needs adjustment.</p>
        </div>
        <span className={`rounded-full px-3 py-1.5 text-xs font-black ${detailing.status === "accepted" ? "bg-emerald-100 text-emerald-800" : detailing.status === "in_progress" ? "bg-blue-100 text-blue-800" : detailing.status === "completed" ? "bg-violet-100 text-violet-800" : "bg-amber-100 text-amber-800"}`}>{statusLabel}</span>
      </div>
      {message ? <div className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700">{message}</div> : null}
    </section>

    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryTile label="Detailer" value={selectedPartner ? `${selectedPartner.displayName}${selectedPartner.secondaryLabel ? ` · ${selectedPartner.secondaryLabel}` : ""}` : "Choose detailer"} done={Boolean(partnerId)} active={editing === "detailer"} onClick={() => toggleSection("detailer")} />
        <SummaryTile label="Service" value={levelLabel(detailLevel)} done={Boolean(detailLevel)} active={editing === "service"} onClick={() => toggleSection("service")} />
        <SummaryTile label="Schedule" value={scheduleValue ? dateTimeLabel(scheduleValue) : "Choose time"} done={Boolean(scheduleValue)} active={editing === "schedule"} onClick={() => toggleSection("schedule")} />
        <SummaryTile label="Quote" value={quoteDone ? money(Number(quotedCost)) : "Awaiting quote"} done={quoteDone} active={editing === "quote"} onClick={() => toggleSection("quote")} />
      </div>

      {editing === "detailer" ? <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50/30 p-4">
        <div className="text-[10px] font-black uppercase tracking-[0.08em] text-blue-700">Detailer</div>
        <select value={partnerId} onChange={(e) => setPartnerId(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-bold">
          <option value="">Select detailing partner</option>
          {suggestedPartners.length ? <optgroup label="Suggested for detailing">{suggestedPartners.map((partner) => <option key={partner.id} value={partner.id}>{partner.displayName}{partner.secondaryLabel ? ` · ${partner.secondaryLabel}` : ""}</option>)}</optgroup> : null}
          <optgroup label="All partners">{partners.filter((partner) => !suggestedPartners.some((item) => item.id === partner.id)).map((partner) => <option key={partner.id} value={partner.id}>{partner.displayName}{partner.secondaryLabel ? ` · ${partner.secondaryLabel}` : ""}</option>)}</optgroup>
        </select>
        <div className="mt-2 text-[11px] font-semibold text-slate-500">Detailing-capable partners appear first; all active partners remain selectable.</div>
      </div> : null}

      {editing === "service" ? <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50/30 p-4">
        <div className="text-[10px] font-black uppercase tracking-[0.08em] text-blue-700">Service</div>
        <div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-5">{LEVELS.map((level) => <button key={level.value} type="button" onClick={() => selectLevel(level.value)} className={`cursor-pointer rounded-xl border px-3 py-3 text-left ${detailLevel === level.value ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white"}`}><div className="text-xs font-black">{level.label}</div><div className={`mt-1 text-[10px] leading-4 ${detailLevel === level.value ? "text-slate-300" : "text-slate-500"}`}>{level.description}</div></button>)}</div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3">
          <div><div className="text-xs font-black text-slate-800">{scopeItems.length} services included</div><div className="mt-0.5 text-[10px] font-semibold text-slate-500">The selected package defines the normal scope.</div></div>
          <button type="button" onClick={() => setScopeExpanded((value) => !value)} className="cursor-pointer text-xs font-black text-blue-700">{scopeExpanded ? "Hide scope" : "View / adjust scope"}</button>
        </div>

        {scopeExpanded ? <div className="mt-3">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{DETAIL_SCOPE_OPTIONS.map((item) => <label key={item} className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-bold ${scopeItems.includes(item) ? "border-blue-300 bg-blue-50 text-blue-900" : "border-slate-200 bg-white text-slate-700"}`}><input type="checkbox" checked={scopeItems.includes(item)} onChange={() => toggleScope(item)} />{item}</label>)}</div>
          <textarea value={customScope} onChange={(e) => setCustomScope(e.target.value)} placeholder="Vehicle-specific scope or instructions" className="mt-3 min-h-20 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm" />
        </div> : null}
      </div> : null}

      {editing === "schedule" ? <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50/30 p-4">
        <SuggestedTimePicker
          endpoint={`/api/mindful/inventory/vehicles/${detailing.vehicleId}/detailing/availability?partnerId=${encodeURIComponent(partnerId)}&durationMinutes=${turnaroundHours ? Math.round(Number(turnaroundHours) * 60) : 120}`}
          calendarHref="/mindful/inventory/schedule?embed=1"
          selectedStartAt={scheduleValue}
          onSelect={(startAt) => setScheduledStart(localInput(startAt))}
          onManualRequest={() => setManualSchedule((value) => !value)}
          manualExpanded={manualSchedule}
        />
        {manualSchedule ? <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-black text-slate-600">Proposed time<input type="datetime-local" value={scheduledStart} onChange={(e) => setScheduledStart(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5" /></label>
          <label className="text-xs font-black text-slate-600">Turnaround (hr)<input type="number" min="0" step="0.5" value={turnaroundHours} onChange={(e) => setTurnaroundHours(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5" /></label>
        </div> : <div className="mt-2 text-[10px] font-semibold text-slate-500">Expected turnaround: {turnaroundHours || "—"} hr</div>}
      </div> : null}

      {editing === "quote" ? <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50/30 p-4">
        <div className="text-[10px] font-black uppercase tracking-[0.08em] text-blue-700">Partner quote</div>
        <div className="mt-2 max-w-sm"><label className="text-xs font-black text-slate-600">Quoted cost<input type="number" min="0" step="0.01" value={quotedCost} onChange={(e) => setQuotedCost(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5" /></label></div>
      </div> : null}

      <div className="mt-4">
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Detail-specific instructions or notes" className="min-h-20 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm" />
      </div>

      {canComplete || canAccept ? <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
        <div className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-500">Completion / reconciliation</div>
        <label className="mt-2 block max-w-sm text-xs font-black text-slate-600">Actual cost<input type="number" min="0" step="0.01" value={actualCost} onChange={(e) => setActualCost(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5" /></label>
      </div> : null}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
        <div className="text-xs font-semibold text-slate-500">Quote {quotedCost ? money(Number(quotedCost)) : "—"}{detailing.actualCost != null ? ` · Actual ${money(detailing.actualCost)}` : ""}</div>
        <div className="flex flex-wrap gap-2">
          <button disabled={working} onClick={() => void save()} className="cursor-pointer rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-black disabled:opacity-50">Save setup</button>
          {canStart ? <button disabled={working} onClick={() => void save("in_progress")} className="cursor-pointer rounded-xl bg-blue-700 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50">Start Detailing</button> : null}
          {canComplete ? <button disabled={working} onClick={() => void save("completed")} className="cursor-pointer rounded-xl bg-slate-950 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50">Mark Completed</button> : null}
          {canAccept ? <button disabled={working} onClick={() => void save("accepted")} className="cursor-pointer rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50">Accept & Move to QC →</button> : null}
        </div>
      </div>
    </section>
  </div>;
}
