import { readFileSync, writeFileSync } from "node:fs";

const path = "components/partner/partner-inspection-list.tsx";
let source = readFileSync(path, "utf8");

source = source.replace('import { useState } from "react";', 'import { useEffect, useState } from "react";');

const start = source.indexOf("function candidateDecision(");
const end = source.indexOf("\n\nfunction ProposalEditor", start);
if (start === -1 || end === -1) throw new Error("Could not find final parts-decision block.");

const replacement = `function candidateDecision(part: PartDraft | undefined) {
  if (!part) return null;
  if (part.notes.startsWith("IN STOCK ·")) return "in_stock" as const;
  if (part.notes.startsWith("NOT NEEDED ·")) return "not_needed" as const;
  return "added" as const;
}

function partPriceSummary(part: PartDraft | undefined) {
  if (!part?.partnerOfferUnitPrice.trim()) return null;
  const value = Number(part.partnerOfferUnitPrice);
  return Number.isFinite(value) ? money(value) : null;
}

function PartsEditor({ vehicleLabel, jobLabel, contextText, parts, onChange, onReadinessChange }: { vehicleLabel: string; jobLabel: string; contextText: string; parts: PartDraft[]; onChange: (parts: PartDraft[]) => void; onReadinessChange: (ready: boolean, message: string) => void }) {
  const [candidates, setCandidates] = useState<AiPartCandidate[]>([]);
  const [thinking, setThinking] = useState(false);
  const [partsMessage, setPartsMessage] = useState("");
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [pendingCandidateNames, setPendingCandidateNames] = useState<string[]>([]);
  const [pendingManualIndexes, setPendingManualIndexes] = useState<number[]>([]);

  function patch(index: number, value: Partial<PartDraft>) {
    onChange(parts.map((part, partIndex) => partIndex === index ? { ...part, ...value } : part));
  }

  function partIndexFor(candidate: AiPartCandidate) {
    return parts.findIndex((part) => part.name.trim().toLowerCase() === candidate.name.toLowerCase());
  }

  async function suggestWithLotLogic() {
    if (!contextText.trim()) {
      setPartsMessage("Enter a recommended action first so Lot Logic knows what job it is sourcing for.");
      return;
    }
    setThinking(true);
    setPartsMessage("");
    try {
      const response = await fetch("/api/partner/part-suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vehicleLabel, contextText }),
      });
      const payload = await response.json() as { items?: AiPartCandidate[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "Lot Logic could not suggest parts.");
      setCandidates(payload.items || []);
      if (!payload.items?.length) setPartsMessage("Lot Logic did not identify a clear purchasable part or material for this job.");
    } catch (error) {
      setPartsMessage(error instanceof Error ? error.message : "Lot Logic could not suggest parts.");
    } finally {
      setThinking(false);
    }
  }

  function addCandidate(candidate: AiPartCandidate) {
    const existingIndex = partIndexFor(candidate);
    if (existingIndex >= 0) {
      setExpandedKey("candidate:" + candidate.name);
      return;
    }
    onChange([...parts, {
      name: candidate.name,
      quantity: "1",
      partNumber: "",
      notes: "Lot Logic search: " + candidate.searchQuery,
      aiEstimatedUnitPriceLow: candidate.estimatedUnitPriceLow,
      aiEstimatedUnitPriceHigh: candidate.estimatedUnitPriceHigh,
      aiPriceBasis: candidate.priceBasis,
      partnerOfferUnitPrice: "",
    }]);
    setPendingCandidateNames((current) => current.includes(candidate.name) ? current : [...current, candidate.name]);
    setExpandedKey("candidate:" + candidate.name);
    setPartsMessage(candidate.name + " added. Review the details below, then click Update Part.");
  }

  function setSimpleDecision(candidate: AiPartCandidate, decision: "in_stock" | "not_needed") {
    const existingIndex = partIndexFor(candidate);
    const prefix = decision === "in_stock" ? "IN STOCK · " : "NOT NEEDED · ";
    const next: PartDraft = {
      name: candidate.name,
      quantity: "1",
      partNumber: "",
      notes: prefix + "Lot Logic search: " + candidate.searchQuery,
      aiEstimatedUnitPriceLow: candidate.estimatedUnitPriceLow,
      aiEstimatedUnitPriceHigh: candidate.estimatedUnitPriceHigh,
      aiPriceBasis: candidate.priceBasis,
      partnerOfferUnitPrice: "",
    };
    onChange(existingIndex >= 0 ? parts.map((part, index) => index === existingIndex ? next : part) : [...parts, next]);
    setPendingCandidateNames((current) => current.filter((name) => name !== candidate.name));
    setExpandedKey(null);
    setPartsMessage(candidate.name + (decision === "in_stock" ? " marked in stock." : " marked not needed."));
  }

  function resetCandidate(candidate: AiPartCandidate) {
    const index = partIndexFor(candidate);
    if (index >= 0) onChange(parts.filter((_, partIndex) => partIndex !== index));
    setPendingCandidateNames((current) => current.filter((name) => name !== candidate.name));
    setExpandedKey(null);
  }

  function updateCandidate(candidate: AiPartCandidate) {
    const index = partIndexFor(candidate);
    if (index < 0 || !parts[index]?.name.trim()) return;
    setPendingCandidateNames((current) => current.filter((name) => name !== candidate.name));
    setExpandedKey(null);
    setPartsMessage(candidate.name + " updated.");
  }

  function addManualPart() {
    const index = parts.length;
    onChange([...parts, blankPart()]);
    setPendingManualIndexes((current) => [...current, index]);
    setExpandedKey("manual:" + index);
  }

  function removeManualPart(index: number) {
    onChange(parts.filter((_, partIndex) => partIndex !== index));
    setPendingManualIndexes((current) => current.filter((value) => value !== index).map((value) => value > index ? value - 1 : value));
    setExpandedKey(null);
  }

  function updateManualPart(index: number) {
    if (!parts[index]?.name.trim()) {
      setPartsMessage("Add a part or material name before updating this part.");
      return;
    }
    setPendingManualIndexes((current) => current.filter((value) => value !== index));
    setExpandedKey(null);
    setPartsMessage(parts[index].name + " updated.");
  }

  function openSource(source: AiPartCandidate["sources"][number], searchQuery: string) {
    if (source.key === "turn14") {
      void navigator.clipboard?.writeText(searchQuery);
      setPartsMessage("Search phrase copied. Paste it into Turn 14.");
    }
    window.open(source.url, "_blank", "noopener,noreferrer");
  }

  const candidateNames = new Set(candidates.map((candidate) => candidate.name.toLowerCase()));
  const manualParts = parts.map((part, index) => ({ part, index })).filter(({ part }) => !candidateNames.has(part.name.trim().toLowerCase()));
  const unresolvedCandidates = candidates.filter((candidate) => partIndexFor(candidate) < 0 || pendingCandidateNames.includes(candidate.name));
  const invalidManual = pendingManualIndexes.some((index) => !parts[index]?.name.trim());
  const ready = unresolvedCandidates.length === 0 && !invalidManual;
  const addressed = candidates.length - unresolvedCandidates.length;
  const readinessMessage = candidates.length
    ? ready ? "All " + candidates.length + " suggested parts addressed ✓" : addressed + " of " + candidates.length + " suggested parts addressed"
    : pendingManualIndexes.length ? "Finish the manually added part before submitting." : "Parts are ready.";

  useEffect(() => {
    onReadinessChange(ready, readinessMessage);
  }, [ready, readinessMessage, onReadinessChange]);

  function partFields(index: number, updateLabel: string, onUpdate: () => void) {
    const part = parts[index];
    if (!part) return null;
    return <div className="mt-3 border-t border-slate-200 pt-3">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(180px,1.2fr)_72px_minmax(120px,0.7fr)_120px_minmax(220px,1.2fr)]">
        <div><input value={part.name} onChange={(e) => patch(index, { name: e.target.value })} placeholder="Part / material" className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs" />{part.aiEstimatedUnitPriceLow != null || part.aiEstimatedUnitPriceHigh != null ? <div className="mt-1 px-1 text-[10px] font-bold text-blue-700" title={part.aiPriceBasis || "Lot Logic planning estimate; not a live quote"}>AI baseline: {part.aiEstimatedUnitPriceLow != null && part.aiEstimatedUnitPriceHigh != null ? money(part.aiEstimatedUnitPriceLow) + "–" + money(part.aiEstimatedUnitPriceHigh) : money(part.aiEstimatedUnitPriceLow ?? part.aiEstimatedUnitPriceHigh)}</div> : null}</div>
        <input inputMode="decimal" value={part.quantity} onChange={(e) => patch(index, { quantity: e.target.value })} placeholder="Qty" className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs" />
        <input value={part.partNumber} onChange={(e) => patch(index, { partNumber: e.target.value })} placeholder="Part # / ref" className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs" />
        <input inputMode="decimal" value={part.partnerOfferUnitPrice} onChange={(e) => patch(index, { partnerOfferUnitPrice: e.target.value })} placeholder="My cost $" title="Optional: enter your expected unit cost." className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs" />
        <input value={part.notes} onChange={(e) => patch(index, { notes: e.target.value })} placeholder="Sourcing / price note or link" className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs" />
      </div>
      <div className="mt-3 flex justify-end"><button type="button" onClick={onUpdate} className="rounded-lg bg-slate-950 px-4 py-2 text-xs font-black text-white">{updateLabel}</button></div>
    </div>;
  }

  return <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 sm:col-span-2">
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">Parts for this finding</div>
        <div className="mt-0.5 text-sm font-black text-slate-800">{jobLabel || "Current finding"}</div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={thinking} onClick={() => void suggestWithLotLogic()} className="rounded-lg border border-violet-300 bg-white px-3 py-2 text-xs font-black text-violet-800 disabled:opacity-40">{thinking ? "Thinking…" : "Suggest with Lot Logic"}</button>
        <button type="button" onClick={addManualPart} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-black">+ Add part</button>
      </div>
    </div>

    {partsMessage ? <div className="mt-2 text-xs font-semibold text-slate-600">{partsMessage}</div> : null}

    {candidates.length ? <div className="mt-3">
      <div className="mb-2 flex items-center justify-between gap-3"><div className="text-[10px] font-black uppercase tracking-[0.1em] text-violet-600">Lot Logic suggestions</div><div className={\`text-xs font-black \${ready ? "text-emerald-700" : "text-slate-500"}\`}>{readinessMessage}</div></div>
      <div className="grid gap-3 lg:grid-cols-2">
        {candidates.map((candidate) => {
          const index = partIndexFor(candidate);
          const part = index >= 0 ? parts[index] : undefined;
          const decision = candidateDecision(part);
          const pending = pendingCandidateNames.includes(candidate.name);
          const expanded = expandedKey === "candidate:" + candidate.name;
          const complete = Boolean(decision) && !pending;
          const amber = decision === "not_needed";
          return <div key={candidate.name} className={\`rounded-xl border p-4 transition \${complete ? amber ? "border-amber-300 bg-amber-50/50" : "border-emerald-300 bg-emerald-50/40" : "border-violet-200 bg-white"}\`}>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1"><div className="font-black text-slate-950">{candidate.name}</div><div className="mt-0.5 text-[10px] font-black uppercase text-violet-600">{partNeedLabel(candidate.need)}</div>{aiPartPrice(candidate) ? <div className="mt-1 text-xs font-black text-blue-700" title={candidate.priceBasis || "Lot Logic planning estimate; not a live quote"}>AI estimate: {aiPartPrice(candidate)}</div> : null}<div className="mt-1 truncate text-[11px] font-semibold text-slate-500" title={candidate.searchQuery}>{candidate.searchQuery}</div></div>
              <div className="flex shrink-0 flex-col items-center gap-1">{complete ? <div className={\`flex h-11 w-11 items-center justify-center rounded-full text-2xl font-black \${amber ? "bg-amber-200 text-amber-800" : "bg-emerald-500 text-white"}\`}>✓</div> : <div className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-xl font-black text-slate-400">?</div>}<div className={\`text-[10px] font-black uppercase \${amber ? "text-amber-700" : complete ? "text-emerald-700" : "text-slate-400"}\`}>{decision === "in_stock" ? "In stock" : decision === "not_needed" ? "Not needed" : complete ? "Added" : pending ? "Needs update" : "Choose"}</div>{decision === "added" && complete && partPriceSummary(part) ? <div className="text-[10px] font-bold text-slate-500">{partPriceSummary(part)}</div> : null}</div>
            </div>

            {!complete || pending ? <div className="mt-3 flex flex-wrap items-end justify-between gap-3"><div><div className="mb-1 text-[9px] font-black uppercase tracking-[0.1em] text-violet-600">Decision</div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => addCandidate(candidate)} className="rounded-lg bg-violet-700 px-3 py-2 text-[10px] font-black text-white">Add</button><button type="button" onClick={() => setSimpleDecision(candidate, "in_stock")} className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-[10px] font-black text-emerald-800">In stock</button><button type="button" onClick={() => setSimpleDecision(candidate, "not_needed")} className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[10px] font-black text-amber-800">Not needed</button></div></div><div><div className="mb-1 text-[9px] font-black uppercase tracking-[0.1em] text-slate-500">Source</div><div className="flex flex-wrap gap-1.5">{candidate.sources.map((source) => <button key={source.key} type="button" onClick={() => openSource(source, candidate.searchQuery)} className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-[10px] font-black text-slate-700">{source.key === "turn14" ? "Turn 14" : source.label}</button>)}</div></div></div> : <div className="mt-3 flex justify-end gap-2">{decision === "added" || decision === "in_stock" ? <button type="button" onClick={() => setExpandedKey(expanded ? null : "candidate:" + candidate.name)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] font-black text-slate-600">{expanded ? "Collapse" : "Edit"}</button> : null}<button type="button" onClick={() => resetCandidate(candidate)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] font-black text-slate-600">Change decision</button></div>}
            {expanded && index >= 0 && decision !== "not_needed" ? partFields(index, "Update Part", () => updateCandidate(candidate)) : null}
          </div>;
        })}
      </div>
    </div> : null}

    {manualParts.length ? <div className="mt-4 border-t border-slate-200 pt-3"><div className="mb-2 text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">Manually added parts</div><div className="grid gap-3 lg:grid-cols-2">{manualParts.map(({ part, index }) => { const expanded = expandedKey === "manual:" + index; const pending = pendingManualIndexes.includes(index); const complete = Boolean(part.name.trim()) && !pending; return <div key={index} className={\`rounded-xl border p-4 \${complete ? "border-emerald-300 bg-emerald-50/40" : "border-slate-200 bg-white"}\`}><div className="flex items-center justify-between gap-3"><div><div className="font-black">{part.name || "New part"}</div><div className="mt-1 text-[10px] font-black uppercase text-slate-500">Manually added</div></div><div className="flex items-center gap-2">{complete ? <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500 text-xl font-black text-white">✓</div> : <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-xl font-black text-slate-400">?</div>}<button type="button" onClick={() => setExpandedKey(expanded ? null : "manual:" + index)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] font-black">{expanded ? "Collapse" : "Edit"}</button><button type="button" onClick={() => removeManualPart(index)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] font-black text-slate-500">Remove</button></div></div>{expanded ? partFields(index, "Update Part", () => updateManualPart(index)) : null}</div>; })}</div></div> : null}
  </div>;
}`;

source = source.slice(0, start) + replacement + source.slice(end);

const proposalStart = source.indexOf("function ProposalEditor(");
const proposalEnd = source.indexOf("\n\nexport function PartnerInspectionList", proposalStart);
if (proposalStart === -1 || proposalEnd === -1) throw new Error("Could not find ProposalEditor boundaries.");
let proposal = source.slice(proposalStart, proposalEnd);
proposal = proposal.replace(
  '  const diagnosisReady = !requiresDiagnosisHandoff || (diagnosisNotesReady && diagnosisActionReady);',
  '  const diagnosisReady = !requiresDiagnosisHandoff || (diagnosisNotesReady && diagnosisActionReady);\n  const [partsReady, setPartsReady] = useState(true);\n  const [partsReadyMessage, setPartsReadyMessage] = useState("Parts are ready.");\n  const handlePartsReadiness = (ready: boolean, message: string) => { setPartsReady(ready); setPartsReadyMessage(message); };',
);
proposal = proposal.replace(
  '<PartsEditor vehicleLabel={vehicleLabel} jobLabel={jobLabel} contextText={partsContext} parts={draft.parts} onChange={(parts) => onChange({ ...draft, parts })} />',
  '<PartsEditor vehicleLabel={vehicleLabel} jobLabel={jobLabel} contextText={partsContext} parts={draft.parts} onChange={(parts) => onChange({ ...draft, parts })} onReadinessChange={handlePartsReadiness} />',
);
proposal = proposal.replace(
  'disabled={disabled || !diagnosisReady}',
  'disabled={disabled || !diagnosisReady || !partsReady}',
);
proposal = proposal.replace(
  '<div>\n      <button type="button"',
  '<div>\n      <div className={`mb-2 text-xs font-black ${partsReady ? "text-emerald-700" : "text-amber-700"}`}>{partsReadyMessage}</div>\n      <button type="button"',
);
source = source.slice(0, proposalStart) + proposal + source.slice(proposalEnd);

writeFileSync(path, source, "utf8");
console.log("Unified mechanical part suggestions, decisions, editing, and completion gating.");
