"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import type { MechanicalPartSuggestion, PartnerInspectionItem, PartnerInspectionUpgrade } from "@/lib/partner-portal/inspections";

function when(value: string | null) {
  if (!value) return "Not scheduled";
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function money(value: number | null) {
  if (value === null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

type ValidationStatus = "confirmed" | "not_found" | "changed" | "needs_diagnosis";
type UpgradeStatus = "feasible" | "feasible_with_changes" | "not_recommended" | "needs_info";
type PartDraft = { name: string; quantity: string; partNumber: string; notes: string };
type RecommendationDraft = { recommendedAction: string; laborHours: string; proposedLaborPrice: string; canPerform: "" | "yes" | "no"; parts: PartDraft[] };
type NewFindingDraft = RecommendationDraft & { title: string; description: string };

const findingChoices: Array<{ value: ValidationStatus; label: string }> = [
  { value: "confirmed", label: "Confirm" },
  { value: "not_found", label: "Not Found" },
  { value: "changed", label: "Changed" },
  { value: "needs_diagnosis", label: "Needs Diagnosis" },
];
const upgradeChoices: Array<{ value: UpgradeStatus; label: string }> = [
  { value: "feasible", label: "Good to Proceed" },
  { value: "feasible_with_changes", label: "Change Recommended" },
  { value: "not_recommended", label: "Not Recommended" },
  { value: "needs_info", label: "Needs More Info" },
];

const blankPart = (): PartDraft => ({ name: "", quantity: "1", partNumber: "", notes: "" });
const emptyRecommendation = (): RecommendationDraft => ({ recommendedAction: "", laborHours: "", proposedLaborPrice: "", canPerform: "", parts: [] });
const emptyNewFinding = (): NewFindingDraft => ({ title: "", description: "", ...emptyRecommendation() });

function toPartDraft(part: MechanicalPartSuggestion): PartDraft {
  return { name: part.name, quantity: String(part.quantity || 1), partNumber: part.partNumber || "", notes: part.notes || "" };
}
function cleanParts(parts: PartDraft[]) {
  return parts.filter((part) => part.name.trim()).map((part) => ({
    name: part.name.trim(),
    quantity: Number(part.quantity) > 0 ? Number(part.quantity) : 1,
    partNumber: part.partNumber.trim() || null,
    notes: part.notes.trim() || null,
  }));
}
function recommendationFrom(source: { recommendedAction: string | null; laborHours: number | null; proposedLaborPrice: number | null; canPerform: boolean | null; partSuggestions: MechanicalPartSuggestion[] }): RecommendationDraft {
  return {
    recommendedAction: source.recommendedAction || "",
    laborHours: source.laborHours === null ? "" : String(source.laborHours),
    proposedLaborPrice: source.proposedLaborPrice === null ? "" : String(source.proposedLaborPrice),
    canPerform: source.canPerform === true ? "yes" : source.canPerform === false ? "no" : "",
    parts: source.partSuggestions.map(toPartDraft),
  };
}
function statusLabel(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function dispositionTone(value: string) {
  if (value === "not_found" || value === "not_recommended") return "bg-slate-100 text-slate-700";
  if (value === "needs_diagnosis" || value === "needs_info") return "bg-amber-100 text-amber-800";
  if (value === "changed" || value === "feasible_with_changes") return "bg-blue-100 text-blue-800";
  return "bg-emerald-100 text-emerald-800";
}

function PartsEditor({ parts, onChange }: { parts: PartDraft[]; onChange: (parts: PartDraft[]) => void }) {
  function patch(index: number, value: Partial<PartDraft>) {
    onChange(parts.map((part, partIndex) => partIndex === index ? { ...part, ...value } : part));
  }
  return <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 sm:col-span-2">
    <div className="flex items-center justify-between gap-3">
      <div><div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">Suggested parts</div><div className="mt-0.5 text-xs text-slate-500">Suggest what the work needs. The Owner will decide what enters the Work Plan.</div></div>
      <button type="button" onClick={() => onChange([...parts, blankPart()])} className="shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-black">+ Add Part</button>
    </div>
    {parts.length ? <div className="mt-3 space-y-2">{parts.map((part, index) => <div key={index} className="grid gap-2 rounded-lg border border-slate-200 bg-white p-2 sm:grid-cols-[minmax(180px,1.4fr)_90px_minmax(130px,0.8fr)_minmax(160px,1fr)_auto]">
      <input value={part.name} onChange={(e) => patch(index, { name: e.target.value })} placeholder="Part / description" className="rounded-lg border border-slate-200 px-2.5 py-2 text-xs" />
      <input inputMode="decimal" value={part.quantity} onChange={(e) => patch(index, { quantity: e.target.value })} placeholder="Qty" className="rounded-lg border border-slate-200 px-2.5 py-2 text-xs" />
      <input value={part.partNumber} onChange={(e) => patch(index, { partNumber: e.target.value })} placeholder="Part # / ref" className="rounded-lg border border-slate-200 px-2.5 py-2 text-xs" />
      <input value={part.notes} onChange={(e) => patch(index, { notes: e.target.value })} placeholder="Notes / preferred source" className="rounded-lg border border-slate-200 px-2.5 py-2 text-xs" />
      <button type="button" onClick={() => onChange(parts.filter((_, partIndex) => partIndex !== index))} className="rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-black text-slate-500">Remove</button>
    </div>)}</div> : null}
  </div>;
}

function ProposalEditor({ draft, onChange, submitLabel, onSubmit, disabled }: { draft: RecommendationDraft; onChange: (draft: RecommendationDraft) => void; submitLabel: string; onSubmit: () => void; disabled: boolean }) {
  return <div className="grid gap-2 sm:grid-cols-2">
    <input value={draft.recommendedAction} onChange={(e) => onChange({ ...draft, recommendedAction: e.target.value })} placeholder="Recommended action" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
    <div className="grid grid-cols-2 gap-2"><input inputMode="decimal" value={draft.laborHours} onChange={(e) => onChange({ ...draft, laborHours: e.target.value })} placeholder="Labor hours" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" /><input inputMode="decimal" value={draft.proposedLaborPrice} onChange={(e) => onChange({ ...draft, proposedLaborPrice: e.target.value })} placeholder="Labor price $" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" /></div>
    <PartsEditor parts={draft.parts} onChange={(parts) => onChange({ ...draft, parts })} />
    <select value={draft.canPerform} onChange={(e) => onChange({ ...draft, canPerform: e.target.value as RecommendationDraft["canPerform"] })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm"><option value="">Can you perform this work?</option><option value="yes">Yes — I can perform it</option><option value="no">No — another specialist is needed</option></select>
    <button type="button" disabled={disabled} onClick={onSubmit} className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-black text-white disabled:bg-slate-200 disabled:text-slate-400">{submitLabel}</button>
  </div>;
}

export function PartnerInspectionList({ items, typicalDurationHours }: { items: PartnerInspectionItem[]; typicalDurationHours: number | null }) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(items.find((item) => !["complete"].includes(item.status))?.id || null);
  const [working, setWorking] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [summaries, setSummaries] = useState<Record<string, string>>(() => Object.fromEntries(items.map((item) => [item.id, item.summary || ""])));
  const [findingNotes, setFindingNotes] = useState<Record<string, string>>({});
  const [recommendations, setRecommendations] = useState<Record<string, RecommendationDraft>>({});
  const [selectedStatuses, setSelectedStatuses] = useState<Record<string, ValidationStatus>>({});
  const [expandedFindings, setExpandedFindings] = useState<Record<string, string | null>>({});
  const [upgradeNotes, setUpgradeNotes] = useState<Record<string, string>>({});
  const [upgradeRecommendations, setUpgradeRecommendations] = useState<Record<string, RecommendationDraft>>({});
  const [selectedUpgradeStatuses, setSelectedUpgradeStatuses] = useState<Record<string, UpgradeStatus>>({});
  const [expandedUpgrades, setExpandedUpgrades] = useState<Record<string, string | null>>({});
  const [newFinding, setNewFinding] = useState<Record<string, NewFindingDraft>>({});

  function findingDraft(finding: PartnerInspectionItem["findings"][number]) {
    return recommendations[finding.id] || recommendationFrom(finding);
  }
  function upgradeDraft(upgrade: PartnerInspectionUpgrade) {
    return upgradeRecommendations[upgrade.id] || recommendationFrom(upgrade);
  }
  async function act(item: PartnerInspectionItem, body: Record<string, unknown>) {
    setWorking(item.id); setMessages((current) => ({ ...current, [item.id]: "" }));
    try {
      const response = await fetch(`/api/partner/inspections/${item.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Inspection could not be updated.");
      router.refresh(); return true;
    } catch (error) {
      setMessages((current) => ({ ...current, [item.id]: error instanceof Error ? error.message : "Inspection could not be updated." })); return false;
    } finally { setWorking(null); }
  }

  async function submitFinding(item: PartnerInspectionItem, finding: PartnerInspectionItem["findings"][number]) {
    const status = selectedStatuses[finding.id] || (finding.validationStatus !== "pending" ? finding.validationStatus as ValidationStatus : null);
    if (!status) { setMessages((current) => ({ ...current, [item.id]: "Choose a finding outcome before submitting." })); return; }
    const draft = findingDraft(finding);
    const saved = await act(item, { action: "validate_finding", findingId: finding.id, status, notes: findingNotes[finding.id] ?? finding.validationNotes ?? "", recommendedAction: draft.recommendedAction, laborHours: draft.laborHours, proposedLaborPrice: draft.proposedLaborPrice, partSuggestions: cleanParts(draft.parts), canPerform: draft.canPerform === "" ? null : draft.canPerform === "yes" });
    if (saved) setExpandedFindings((current) => ({ ...current, [item.id]: null }));
  }
  async function submitUpgrade(item: PartnerInspectionItem, upgrade: PartnerInspectionUpgrade) {
    const status = selectedUpgradeStatuses[upgrade.id] || (upgrade.validationStatus !== "pending" ? upgrade.validationStatus as UpgradeStatus : null);
    if (!status) { setMessages((current) => ({ ...current, [item.id]: "Choose an outcome for the requested upgrade before submitting it." })); return; }
    const draft = upgradeDraft(upgrade);
    const saved = await act(item, { action: "validate_upgrade", upgradeId: upgrade.id, status, notes: upgradeNotes[upgrade.id] ?? upgrade.validationNotes ?? "", recommendedAction: draft.recommendedAction, laborHours: draft.laborHours, proposedLaborPrice: draft.proposedLaborPrice, partSuggestions: cleanParts(draft.parts), canPerform: draft.canPerform === "" ? null : draft.canPerform === "yes" });
    if (saved) setExpandedUpgrades((current) => ({ ...current, [item.id]: null }));
  }
  async function addFinding(item: PartnerInspectionItem, fresh: NewFindingDraft) {
    const saved = await act(item, { action: "add_finding", title: fresh.title, description: fresh.description, recommendedAction: fresh.recommendedAction, laborHours: fresh.laborHours, proposedLaborPrice: fresh.proposedLaborPrice, partSuggestions: cleanParts(fresh.parts), canPerform: fresh.canPerform === "" ? null : fresh.canPerform === "yes" });
    if (saved) setNewFinding((current) => ({ ...current, [item.id]: emptyNewFinding() }));
  }

  if (!items.length) return <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center text-sm font-semibold text-slate-500">No mechanical inspections are assigned to you right now.</div>;

  return <div className="space-y-3">{items.map((item) => {
    const open = openId === item.id;
    const editable = ["in_progress", "revision_requested"].includes(item.status);
    const submitted = item.status === "submitted";
    const complete = item.status === "complete";
    const clarificationFindings = item.findings.filter((finding) => finding.ownerReviewStatus === "clarification_requested");
    const fresh = newFinding[item.id] || emptyNewFinding();
    const firstPendingFinding = item.findings.find((finding) => finding.validationStatus === "pending")?.id || null;
    const activeFindingId = expandedFindings[item.id] === undefined ? firstPendingFinding : expandedFindings[item.id];
    const firstPendingUpgrade = item.upgrades.find((upgrade) => upgrade.validationStatus === "pending")?.id || null;
    const activeUpgradeId = expandedUpgrades[item.id] === undefined ? firstPendingUpgrade : expandedUpgrades[item.id];

    return <section key={item.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <button type="button" onClick={() => setOpenId(open ? null : item.id)} className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left">
        <div><div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-black">{item.vehicleLabel}</h2><span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black uppercase text-slate-600">{item.status.replaceAll("_", " ")}</span>{clarificationFindings.length ? <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-black uppercase text-amber-800">Clarification needed</span> : null}</div><div className="mt-1 text-xs font-semibold text-slate-500">{item.vin || "No VIN"} · {item.mileage === null ? "Mileage —" : `${item.mileage.toLocaleString()} mi`} · {when(item.scheduledStartAt || item.requestedStartAt)}</div></div>
        <div className="text-right"><div className="text-xs font-black text-slate-500">Inspection fee</div><div className="font-black">{money(item.inspectionFee)}</div></div>
      </button>
      {open ? <div className="border-t border-slate-100 px-5 py-5">
        {item.revisionNotes ? <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900"><span className="font-black">Owner requested revision:</span> {item.revisionNotes}</div> : null}
        {item.status === "assigned" ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4"><div><div className="font-black">New inspection assignment</div><div className="mt-1 text-sm text-slate-600">Requested {when(item.requestedStartAt)}</div></div><button disabled={working === item.id} onClick={() => void act(item, { action: "confirm", durationHours: typicalDurationHours || 1.5 })} className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white">Confirm Inspection</button></div> : null}
        {item.status === "confirmed" ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4"><div><div className="font-black">Scheduled</div><div className="mt-1 text-sm text-slate-600">{when(item.scheduledStartAt)}</div></div><button disabled={working === item.id} onClick={() => void act(item, { action: "start" })} className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white">Start Inspection</button></div> : null}
        {submitted && !clarificationFindings.length ? <div className="rounded-xl border border-blue-200 bg-blue-50 p-4"><div className="font-black text-blue-950">Submitted for Owner review</div><div className="mt-1 text-sm text-blue-800">The inspection is locked while the Owner reviews it. Work will only appear in My Work if it is later assigned to you.</div></div> : null}
        {complete ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4"><div className="font-black text-emerald-950">Owner accepted this inspection</div><div className="mt-1 text-sm text-emerald-800">Any resulting work will appear separately in My Work only if it is assigned to you.</div></div> : null}

        {submitted && clarificationFindings.length ? <div className="space-y-3"><div className="rounded-xl border border-amber-300 bg-amber-50 p-4"><div className="font-black text-amber-950">Owner needs clarification</div><div className="mt-1 text-sm text-amber-800">Only the finding(s) below are reopened. The rest of the submitted inspection remains locked.</div></div>{clarificationFindings.map((finding) => { const draft = findingDraft(finding); const selected = selectedStatuses[finding.id] || finding.validationStatus as ValidationStatus; return <div key={finding.id} className="rounded-xl border border-amber-300 bg-white p-4"><div className="flex flex-wrap justify-between gap-3"><div><div className="font-black">{finding.title}</div>{finding.description ? <div className="mt-1 text-sm text-slate-600">{finding.description}</div> : null}</div><span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-black uppercase text-amber-800">Clarification requested</span></div>{finding.ownerReviewNotes ? <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900"><span className="font-black">Owner asks:</span> {finding.ownerReviewNotes}</div> : null}<div className="mt-3 flex flex-wrap gap-2">{findingChoices.map((choice) => <button key={choice.value} type="button" onClick={() => setSelectedStatuses((current) => ({ ...current, [finding.id]: choice.value }))} className={`rounded-lg border px-3 py-2 text-xs font-black ${selected === choice.value ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200"}`}>{choice.label}</button>)}</div><textarea value={findingNotes[finding.id] ?? finding.validationNotes ?? ""} onChange={(e) => setFindingNotes((current) => ({ ...current, [finding.id]: e.target.value }))} placeholder="Answer the Owner's question / update your notes" className="mt-3 min-h-20 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" /><div className="mt-3"><ProposalEditor draft={draft} onChange={(value) => setRecommendations((current) => ({ ...current, [finding.id]: value }))} submitLabel="Resubmit Finding" onSubmit={() => void submitFinding(item, finding)} disabled={working === item.id} /></div></div>; })}</div> : null}

        {editable ? <>
          <div className="mt-5"><div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">Findings to validate</div><div className="mt-3 space-y-3">{item.findings.map((finding) => { const draft = findingDraft(finding); const reviewed = finding.validationStatus !== "pending"; const expanded = activeFindingId === finding.id; const selected = selectedStatuses[finding.id] || (reviewed ? finding.validationStatus as ValidationStatus : undefined); return <div key={finding.id} className={`rounded-xl border ${reviewed ? "border-emerald-200 bg-emerald-50/20" : "border-slate-200"}`}><div className="flex flex-wrap items-start justify-between gap-3 p-4"><div className="min-w-0 flex-1"><div className="font-black">{finding.title}</div>{finding.description ? <div className="mt-1 text-sm text-slate-600">{finding.description}</div> : null}<div className="mt-3 flex flex-wrap gap-2">{findingChoices.map((choice) => <button key={choice.value} type="button" disabled={working === item.id} onClick={() => { setSelectedStatuses((current) => ({ ...current, [finding.id]: choice.value })); setExpandedFindings((current) => ({ ...current, [item.id]: finding.id })); }} className={`rounded-lg border px-3 py-2 text-xs font-black ${selected === choice.value ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-700"}`}>{choice.label}</button>)}</div></div><div className="flex items-center gap-2">{reviewed ? <><span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-black uppercase text-emerald-800">Reviewed ✓</span><span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${dispositionTone(finding.validationStatus)}`}>{statusLabel(finding.validationStatus)}</span></> : <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase text-slate-500">Pending</span>}<button type="button" onClick={() => setExpandedFindings((current) => ({ ...current, [item.id]: expanded ? null : finding.id }))} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-black text-slate-600">{expanded ? "Collapse" : "Open"}</button></div></div>{expanded ? <div className="border-t border-slate-100 p-4"><textarea value={findingNotes[finding.id] ?? finding.validationNotes ?? ""} onChange={(e) => setFindingNotes((current) => ({ ...current, [finding.id]: e.target.value }))} placeholder="Diagnostic notes" className="mb-3 min-h-16 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" /><ProposalEditor draft={draft} onChange={(value) => setRecommendations((current) => ({ ...current, [finding.id]: value }))} submitLabel="Submit Finding" onSubmit={() => void submitFinding(item, finding)} disabled={working === item.id || !selected} /></div> : null}</div>; })}</div></div>

          {item.upgrades.length ? <div className="mt-6"><div className="text-xs font-black uppercase tracking-[0.1em] text-violet-500">Owner-requested upgrades</div><div className="mt-1 text-sm text-slate-500">Review technical feasibility before the Owner finalizes the Work Plan. These remain upgrades, not mechanical defects.</div><div className="mt-3 space-y-3">{item.upgrades.map((upgrade) => { const draft = upgradeDraft(upgrade); const reviewed = upgrade.validationStatus !== "pending"; const expanded = activeUpgradeId === upgrade.id; const selected = selectedUpgradeStatuses[upgrade.id] || (reviewed ? upgrade.validationStatus as UpgradeStatus : undefined); return <div key={upgrade.id} className={`rounded-xl border ${reviewed ? "border-violet-200 bg-violet-50/20" : "border-slate-200 bg-white"}`}><div className="flex flex-wrap items-start justify-between gap-3 p-4"><div className="min-w-0 flex-1"><div className="font-black">{upgrade.title}</div>{upgrade.description ? <div className="mt-1 text-sm text-slate-600">{upgrade.description}</div> : null}{upgrade.desiredOutcome ? <div className="mt-1 text-xs font-semibold text-violet-700">Owner goal: {upgrade.desiredOutcome}</div> : null}<div className="mt-3 flex flex-wrap gap-2">{upgradeChoices.map((choice) => <button key={choice.value} type="button" onClick={() => { setSelectedUpgradeStatuses((current) => ({ ...current, [upgrade.id]: choice.value })); setExpandedUpgrades((current) => ({ ...current, [item.id]: upgrade.id })); }} className={`rounded-lg border px-3 py-2 text-xs font-black ${selected === choice.value ? "border-violet-700 bg-violet-700 text-white" : "border-slate-200 bg-white text-slate-700"}`}>{choice.label}</button>)}</div></div><div className="flex items-center gap-2">{reviewed ? <><span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-black uppercase text-emerald-800">Reviewed ✓</span><span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${dispositionTone(upgrade.validationStatus)}`}>{statusLabel(upgrade.validationStatus)}</span></> : <span className="rounded-full bg-violet-100 px-2.5 py-1 text-[10px] font-black uppercase text-violet-700">Pending review</span>}<button type="button" onClick={() => setExpandedUpgrades((current) => ({ ...current, [item.id]: expanded ? null : upgrade.id }))} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-black text-slate-600">{expanded ? "Collapse" : "Open"}</button></div></div>{expanded ? <div className="border-t border-slate-100 p-4"><textarea value={upgradeNotes[upgrade.id] ?? upgrade.validationNotes ?? ""} onChange={(e) => setUpgradeNotes((current) => ({ ...current, [upgrade.id]: e.target.value }))} placeholder="Technical notes, fitment concerns, or recommended changes" className="mb-3 min-h-16 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" /><ProposalEditor draft={draft} onChange={(value) => setUpgradeRecommendations((current) => ({ ...current, [upgrade.id]: value }))} submitLabel="Submit Upgrade Review" onSubmit={() => void submitUpgrade(item, upgrade)} disabled={working === item.id || !selected} /></div> : null}</div>; })}</div></div> : null}

          <div className="mt-6 rounded-xl border border-dashed border-slate-300 p-4"><div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">New mechanical finding</div><div className="mt-2 grid gap-2 sm:grid-cols-2"><input value={fresh.title} onChange={(e) => setNewFinding((current) => ({ ...current, [item.id]: { ...fresh, title: e.target.value } }))} placeholder="Finding title" className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold" /><input value={fresh.description} onChange={(e) => setNewFinding((current) => ({ ...current, [item.id]: { ...fresh, description: e.target.value } }))} placeholder="What did you find?" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" /></div><div className="mt-3"><ProposalEditor draft={fresh} onChange={(value) => setNewFinding((current) => ({ ...current, [item.id]: { ...fresh, ...value } }))} submitLabel="Add Finding" onSubmit={() => void addFinding(item, fresh)} disabled={working === item.id || !fresh.title.trim()} /></div></div>

          <div className="mt-5"><label className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">Inspection summary<textarea value={summaries[item.id] || ""} onChange={(e) => setSummaries((current) => ({ ...current, [item.id]: e.target.value }))} placeholder="Overall mechanical condition, important risks, and recommendations" className="mt-2 min-h-24 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium normal-case tracking-normal" /></label><button disabled={working === item.id} onClick={() => void act(item, { action: item.status === "revision_requested" ? "start" : "submit", summary: summaries[item.id] || "" })} className="mt-3 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white">{item.status === "revision_requested" ? "Reopen Inspection" : "Submit to Owner"}</button></div>
        </> : null}

        {messages[item.id] ? <div className="mt-3 text-sm font-bold text-red-600">{messages[item.id]}</div> : null}
      </div> : null}
    </section>;
  })}</div>;
}
