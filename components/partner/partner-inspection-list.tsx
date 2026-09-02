"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import type { MechanicalPartSuggestion, PartnerInspectionItem } from "@/lib/partner-portal/inspections";

function when(value: string | null) {
  if (!value) return "Not scheduled";
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function money(value: number | null) {
  if (value === null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

type ValidationStatus = "confirmed" | "not_found" | "changed" | "needs_diagnosis";
type PartDraft = { name: string; quantity: string; partNumber: string; notes: string };
type RecommendationDraft = {
  recommendedAction: string;
  laborHours: string;
  proposedLaborPrice: string;
  canPerform: "" | "yes" | "no";
  parts: PartDraft[];
};
type NewFindingDraft = RecommendationDraft & { title: string; description: string };

const blankPart = (): PartDraft => ({ name: "", quantity: "1", partNumber: "", notes: "" });
const emptyRecommendation = (): RecommendationDraft => ({ recommendedAction: "", laborHours: "", proposedLaborPrice: "", canPerform: "", parts: [] });
const emptyNewFinding = (): NewFindingDraft => ({ title: "", description: "", ...emptyRecommendation() });
const validationChoices: Array<{ value: ValidationStatus; label: string }> = [
  { value: "confirmed", label: "Confirm" },
  { value: "not_found", label: "Not Found" },
  { value: "changed", label: "Changed" },
  { value: "needs_diagnosis", label: "Needs Diagnosis" },
];

function statusLabel(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function dispositionTone(value: string) {
  if (value === "not_found") return "bg-slate-100 text-slate-700";
  if (value === "needs_diagnosis") return "bg-amber-100 text-amber-800";
  if (value === "changed") return "bg-blue-100 text-blue-800";
  return "bg-emerald-100 text-emerald-800";
}

function toPartDraft(part: MechanicalPartSuggestion): PartDraft {
  return {
    name: part.name,
    quantity: String(part.quantity || 1),
    partNumber: part.partNumber || "",
    notes: part.notes || "",
  };
}

function cleanParts(parts: PartDraft[]) {
  return parts.filter((part) => part.name.trim()).map((part) => ({
    name: part.name.trim(),
    quantity: Number(part.quantity) > 0 ? Number(part.quantity) : 1,
    partNumber: part.partNumber.trim() || null,
    notes: part.notes.trim() || null,
  }));
}

function PartsEditor({ parts, onChange }: { parts: PartDraft[]; onChange: (parts: PartDraft[]) => void }) {
  function patch(index: number, patchValue: Partial<PartDraft>) {
    onChange(parts.map((part, partIndex) => partIndex === index ? { ...part, ...patchValue } : part));
  }

  return <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 sm:col-span-2">
    <div className="flex items-center justify-between gap-3">
      <div><div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">Suggested parts</div><div className="mt-0.5 text-xs text-slate-500">Propose what this repair needs. These remain suggestions until the Owner approves the work.</div></div>
      <button type="button" onClick={() => onChange([...parts, blankPart()])} className="shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-black">+ Add Part</button>
    </div>
    {parts.length ? <div className="mt-3 space-y-2">{parts.map((part, index) => <div key={index} className="grid gap-2 rounded-lg border border-slate-200 bg-white p-2 sm:grid-cols-[minmax(180px,1.4fr)_90px_minmax(130px,0.8fr)_minmax(160px,1fr)_auto]">
      <input value={part.name} onChange={(e) => patch(index, { name: e.target.value })} placeholder="Part / description" className="rounded-lg border border-slate-200 px-2.5 py-2 text-xs" />
      <input inputMode="decimal" value={part.quantity} onChange={(e) => patch(index, { quantity: e.target.value })} placeholder="Qty" className="rounded-lg border border-slate-200 px-2.5 py-2 text-xs" />
      <input value={part.partNumber} onChange={(e) => patch(index, { partNumber: e.target.value })} placeholder="Part # / ref" className="rounded-lg border border-slate-200 px-2.5 py-2 text-xs" />
      <input value={part.notes} onChange={(e) => patch(index, { notes: e.target.value })} placeholder="Notes / preferred source" className="rounded-lg border border-slate-200 px-2.5 py-2 text-xs" />
      <button type="button" onClick={() => onChange(parts.filter((_, partIndex) => partIndex !== index))} className="rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-black text-slate-500">Remove</button>
    </div>)}</div> : <button type="button" onClick={() => onChange([blankPart()])} className="mt-3 w-full rounded-lg border border-dashed border-slate-300 bg-white px-3 py-3 text-xs font-bold text-slate-500">No parts suggested · Add a part</button>}
  </div>;
}

export function PartnerInspectionList({ items, typicalDurationHours }: { items: PartnerInspectionItem[]; typicalDurationHours: number | null }) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(items.find((item) => !["complete", "submitted"].includes(item.status))?.id || null);
  const [working, setWorking] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [summaries, setSummaries] = useState<Record<string, string>>(() => Object.fromEntries(items.map((item) => [item.id, item.summary || ""])));
  const [findingNotes, setFindingNotes] = useState<Record<string, string>>({});
  const [recommendations, setRecommendations] = useState<Record<string, RecommendationDraft>>({});
  const [selectedStatuses, setSelectedStatuses] = useState<Record<string, ValidationStatus>>({});
  const [expandedFindings, setExpandedFindings] = useState<Record<string, string | null>>({});
  const [newFinding, setNewFinding] = useState<Record<string, NewFindingDraft>>({});

  function recommendationFor(finding: PartnerInspectionItem["findings"][number]): RecommendationDraft {
    const existing = recommendations[finding.id];
    if (existing) return existing;
    const structured = finding.partSuggestions.map(toPartDraft);
    const legacy = !structured.length && finding.partsRequired ? [{ ...blankPart(), name: finding.partsRequired }] : [];
    return {
      recommendedAction: finding.recommendedAction || "",
      laborHours: finding.laborHours === null ? "" : String(finding.laborHours),
      proposedLaborPrice: finding.proposedLaborPrice === null ? "" : String(finding.proposedLaborPrice),
      canPerform: finding.canPerform === true ? "yes" : finding.canPerform === false ? "no" : "",
      parts: structured.length ? structured : legacy,
    };
  }

  async function act(item: PartnerInspectionItem, body: Record<string, unknown>) {
    setWorking(item.id);
    setMessages((current) => ({ ...current, [item.id]: "" }));
    try {
      const response = await fetch(`/api/partner/inspections/${item.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Inspection could not be updated.");
      router.refresh();
      return true;
    } catch (error) {
      setMessages((current) => ({ ...current, [item.id]: error instanceof Error ? error.message : "Inspection could not be updated." }));
      return false;
    } finally { setWorking(null); }
  }

  async function submitFinding(item: PartnerInspectionItem, finding: PartnerInspectionItem["findings"][number]) {
    const status = selectedStatuses[finding.id] || (finding.validationStatus !== "pending" ? finding.validationStatus as ValidationStatus : null);
    if (!status) {
      setMessages((current) => ({ ...current, [item.id]: "Choose Confirm, Not Found, Changed, or Needs Diagnosis before submitting this finding." }));
      return;
    }
    const recommendation = recommendationFor(finding);
    const saved = await act(item, {
      action: "validate_finding",
      findingId: finding.id,
      status,
      notes: findingNotes[finding.id] ?? finding.validationNotes ?? "",
      recommendedAction: recommendation.recommendedAction,
      laborHours: recommendation.laborHours,
      proposedLaborPrice: recommendation.proposedLaborPrice,
      partSuggestions: cleanParts(recommendation.parts),
      canPerform: recommendation.canPerform === "" ? null : recommendation.canPerform === "yes",
    });
    if (!saved) return;
    const nextPending = item.findings.find((candidate) => candidate.id !== finding.id && candidate.validationStatus === "pending");
    setExpandedFindings((current) => ({ ...current, [item.id]: nextPending?.id || null }));
  }

  async function addFinding(item: PartnerInspectionItem, fresh: NewFindingDraft) {
    const saved = await act(item, {
      action: "add_finding",
      title: fresh.title,
      description: fresh.description,
      recommendedAction: fresh.recommendedAction,
      laborHours: fresh.laborHours,
      proposedLaborPrice: fresh.proposedLaborPrice,
      partSuggestions: cleanParts(fresh.parts),
      canPerform: fresh.canPerform === "" ? null : fresh.canPerform === "yes",
    });
    if (saved) setNewFinding((current) => ({ ...current, [item.id]: emptyNewFinding() }));
  }

  if (!items.length) return <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center text-sm font-semibold text-slate-500">No mechanical inspections are assigned to you right now.</div>;

  return <div className="space-y-3">{items.map((item) => {
    const open = openId === item.id;
    const editable = ["in_progress", "revision_requested"].includes(item.status);
    const submitted = item.status === "submitted";
    const complete = item.status === "complete";
    const fresh = newFinding[item.id] || emptyNewFinding();
    const firstPendingId = item.findings.find((finding) => finding.validationStatus === "pending")?.id || null;
    const activeFindingId = expandedFindings[item.id] === undefined ? firstPendingId : expandedFindings[item.id];

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

        {editable ? <>
          <div className="mt-5"><div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">Findings to validate</div><div className="mt-3 space-y-3">{item.findings.map((finding) => {
            const recommendation = recommendationFor(finding);
            const reviewed = finding.validationStatus !== "pending";
            const expanded = activeFindingId === finding.id;
            const selectedStatus = selectedStatuses[finding.id] || (reviewed ? finding.validationStatus as ValidationStatus : undefined);
            return <div key={finding.id} className={`rounded-xl border ${reviewed ? "border-emerald-200 bg-emerald-50/20" : "border-slate-200"}`}>
              <div className="flex flex-wrap items-start justify-between gap-3 p-4"><div className="min-w-0 flex-1"><div className="font-black">{finding.title}</div>{finding.description ? <div className="mt-1 text-sm text-slate-600">{finding.description}</div> : null}<div className="mt-3 flex flex-wrap gap-2">{validationChoices.map((choice) => { const selected = selectedStatus === choice.value; return <button key={choice.value} type="button" disabled={working === item.id} onClick={() => { setSelectedStatuses((current) => ({ ...current, [finding.id]: choice.value })); setExpandedFindings((current) => ({ ...current, [item.id]: finding.id })); }} className={`rounded-lg border px-3 py-2 text-xs font-black ${selected ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}>{choice.label}</button>; })}</div></div><div className="flex items-center gap-2">{reviewed ? <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-black uppercase text-emerald-800">Reviewed ✓</span> : <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase text-slate-500">Pending</span>}{reviewed ? <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${dispositionTone(finding.validationStatus)}`}>{statusLabel(finding.validationStatus)}</span> : null}<button type="button" onClick={() => setExpandedFindings((current) => ({ ...current, [item.id]: expanded ? null : finding.id }))} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-black text-slate-600">{expanded ? "Collapse" : "Open"}</button></div></div>
              {expanded ? <div className="border-t border-slate-100 p-4"><textarea value={findingNotes[finding.id] ?? finding.validationNotes ?? ""} onChange={(e) => setFindingNotes((current) => ({ ...current, [finding.id]: e.target.value }))} placeholder="Diagnostic notes" className="min-h-16 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" /><div className="mt-3 grid gap-2 sm:grid-cols-2"><input value={recommendation.recommendedAction} onChange={(e) => setRecommendations((current) => ({ ...current, [finding.id]: { ...recommendation, recommendedAction: e.target.value } }))} placeholder="Recommended action" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" /><input inputMode="decimal" value={recommendation.laborHours} onChange={(e) => setRecommendations((current) => ({ ...current, [finding.id]: { ...recommendation, laborHours: e.target.value } }))} placeholder="Labor hours" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" /><input inputMode="decimal" value={recommendation.proposedLaborPrice} onChange={(e) => setRecommendations((current) => ({ ...current, [finding.id]: { ...recommendation, proposedLaborPrice: e.target.value } }))} placeholder="Your proposed labor price ($)" className="rounded-xl border border-slate-200 px-3 py-2 text-sm sm:col-span-2" /><PartsEditor parts={recommendation.parts} onChange={(parts) => setRecommendations((current) => ({ ...current, [finding.id]: { ...recommendation, parts } }))} /><select value={recommendation.canPerform} onChange={(e) => setRecommendations((current) => ({ ...current, [finding.id]: { ...recommendation, canPerform: e.target.value as RecommendationDraft["canPerform"] } }))} className="rounded-xl border border-slate-200 px-3 py-2 text-sm"><option value="">Can you perform this work?</option><option value="yes">Yes — I can perform it</option><option value="no">No — another specialist needed</option></select><button type="button" disabled={working === item.id || !selectedStatus} onClick={() => void submitFinding(item, finding)} className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-black text-white disabled:bg-slate-200 disabled:text-slate-400">Submit Finding</button></div></div> : null}
            </div>;
          })}</div></div>

          <div className="mt-5 rounded-xl border border-dashed border-slate-300 p-4"><div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">New mechanical finding</div><div className="mt-2 grid gap-2 sm:grid-cols-2"><input value={fresh.title} onChange={(e) => setNewFinding((current) => ({ ...current, [item.id]: { ...fresh, title: e.target.value } }))} placeholder="Finding title" className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold" /><input value={fresh.description} onChange={(e) => setNewFinding((current) => ({ ...current, [item.id]: { ...fresh, description: e.target.value } }))} placeholder="What did you find?" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" /><input value={fresh.recommendedAction} onChange={(e) => setNewFinding((current) => ({ ...current, [item.id]: { ...fresh, recommendedAction: e.target.value } }))} placeholder="Recommended action" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" /><input inputMode="decimal" value={fresh.laborHours} onChange={(e) => setNewFinding((current) => ({ ...current, [item.id]: { ...fresh, laborHours: e.target.value } }))} placeholder="Labor hours" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" /><input inputMode="decimal" value={fresh.proposedLaborPrice} onChange={(e) => setNewFinding((current) => ({ ...current, [item.id]: { ...fresh, proposedLaborPrice: e.target.value } }))} placeholder="Your proposed labor price ($)" className="rounded-xl border border-slate-200 px-3 py-2 text-sm sm:col-span-2" /><PartsEditor parts={fresh.parts} onChange={(parts) => setNewFinding((current) => ({ ...current, [item.id]: { ...fresh, parts } }))} /><select value={fresh.canPerform} onChange={(e) => setNewFinding((current) => ({ ...current, [item.id]: { ...fresh, canPerform: e.target.value as RecommendationDraft["canPerform"] } }))} className="rounded-xl border border-slate-200 px-3 py-2 text-sm"><option value="">Can you perform this work?</option><option value="yes">Yes — I can perform it</option><option value="no">No — another specialist needed</option></select><button disabled={working === item.id || !fresh.title.trim()} onClick={() => void addFinding(item, fresh)} className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-black text-white disabled:bg-slate-200 disabled:text-slate-400">Add Finding</button></div></div>

          <div className="mt-5"><label className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">Inspection summary<textarea value={summaries[item.id] || ""} onChange={(e) => setSummaries((current) => ({ ...current, [item.id]: e.target.value }))} placeholder="Overall mechanical condition, important risks, and recommendations" className="mt-2 min-h-24 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium normal-case tracking-normal" /></label><button disabled={working === item.id} onClick={() => void act(item, { action: item.status === "revision_requested" ? "start" : "submit", summary: summaries[item.id] || "" })} className="mt-3 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white">{item.status === "revision_requested" ? "Reopen Inspection" : "Submit to Owner"}</button></div>
        </> : null}
        {messages[item.id] ? <div className="mt-3 text-sm font-bold text-red-600">{messages[item.id]}</div> : null}
      </div> : null}
    </section>;
  })}</div>;
}
