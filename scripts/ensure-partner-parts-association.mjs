import { readFileSync, writeFileSync } from "node:fs";

const path = "components/partner/partner-inspection-list.tsx";
let source = readFileSync(path, "utf8");
let changed = false;

if (!source.includes("function candidateDecision(")) {
  const start = source.indexOf("function PartsEditor(");
  const end = source.indexOf("\n\nfunction ProposalEditor", start);
  if (start === -1 || end === -1) {
    throw new Error("Could not find PartsEditor boundaries for parts association cleanup.");
  }

  const replacement = `function candidateDecision(part: PartDraft | undefined) {
  if (!part) return null;
  if (part.notes.startsWith("IN STOCK ·")) return "in_stock" as const;
  if (part.notes.startsWith("NOT NEEDED ·")) return "not_needed" as const;
  return "added" as const;
}

function PartsEditor({ vehicleLabel, jobLabel, contextText, parts, onChange }: { vehicleLabel: string; jobLabel: string; contextText: string; parts: PartDraft[]; onChange: (parts: PartDraft[]) => void }) {
  const [candidates, setCandidates] = useState<AiPartCandidate[]>([]);
  const [thinking, setThinking] = useState(false);
  const [partsMessage, setPartsMessage] = useState("");

  function patch(index: number, value: Partial<PartDraft>) {
    onChange(parts.map((part, partIndex) => partIndex === index ? { ...part, ...value } : part));
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

  function resolveCandidate(candidate: AiPartCandidate, decision: "added" | "in_stock" | "not_needed") {
    const existing = parts.find((part) => part.name.trim().toLowerCase() === candidate.name.toLowerCase());
    if (existing) {
      setPartsMessage(candidate.name + " is already accounted for below.");
      return;
    }
    const prefix = decision === "in_stock" ? "IN STOCK · " : decision === "not_needed" ? "NOT NEEDED · " : "";
    onChange([...parts, {
      name: candidate.name,
      quantity: "1",
      partNumber: "",
      notes: prefix + "Lot Logic search: " + candidate.searchQuery,
    }]);
    setPartsMessage(decision === "in_stock" ? candidate.name + " marked in stock." : decision === "not_needed" ? candidate.name + " marked not needed." : candidate.name + " added to proposed parts.");
  }

  function openSource(source: AiPartCandidate["sources"][number], searchQuery: string) {
    if (source.key === "turn14") {
      void navigator.clipboard?.writeText(searchQuery);
      setPartsMessage("Search phrase copied. Paste it into Turn 14.");
    }
    window.open(source.url, "_blank", "noopener,noreferrer");
  }

  const unresolvedCandidates = candidates.filter((candidate) => !parts.some((part) => part.name.trim().toLowerCase() === candidate.name.toLowerCase()));

  return <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 sm:col-span-2">
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">Parts for this finding</div>
        <div className="mt-0.5 text-sm font-black text-slate-800">{jobLabel || "Current finding"}</div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={thinking} onClick={() => void suggestWithLotLogic()} className="rounded-lg border border-violet-300 bg-white px-3 py-2 text-xs font-black text-violet-800 disabled:opacity-40">{thinking ? "Thinking…" : "Suggest with Lot Logic"}</button>
        <button type="button" onClick={() => onChange([...parts, blankPart()])} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-black">+ Add part</button>
      </div>
    </div>

    {partsMessage ? <div className="mt-2 text-xs font-semibold text-slate-600">{partsMessage}</div> : null}

    {unresolvedCandidates.length ? <div className="mt-3">
      <div className="mb-2 text-[10px] font-black uppercase tracking-[0.1em] text-violet-600">Lot Logic suggestions</div>
      <div className="grid gap-2 lg:grid-cols-2">
        {unresolvedCandidates.map((candidate) => <div key={candidate.name} className="rounded-xl border border-violet-200 bg-white p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="font-black text-slate-950">{candidate.name}</div>
              <div className="mt-0.5 text-[10px] font-black uppercase text-violet-600">{partNeedLabel(candidate.need)}</div>
              <div className="mt-1 truncate text-[11px] font-semibold text-slate-500" title={candidate.searchQuery}>{candidate.searchQuery}</div>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <button type="button" onClick={() => resolveCandidate(candidate, "added")} className="rounded-md bg-violet-700 px-2.5 py-1.5 text-[10px] font-black text-white">Add</button>
            <button type="button" onClick={() => resolveCandidate(candidate, "in_stock")} className="rounded-md border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-[10px] font-black text-emerald-800">In stock</button>
            <button type="button" onClick={() => resolveCandidate(candidate, "not_needed")} className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-[10px] font-black text-slate-600">Not needed</button>
            <span className="mx-0.5 border-l border-slate-200" />
            {candidate.sources.map((source) => <button key={source.key} type="button" onClick={() => openSource(source, candidate.searchQuery)} className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-[10px] font-black text-slate-700">{source.key === "turn14" ? "Turn 14" : source.label}</button>)}
          </div>
        </div>)}
      </div>
    </div> : candidates.length ? <div className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800">All Lot Logic suggestions for this finding are accounted for.</div> : null}

    {parts.length ? <div className="mt-3 border-t border-slate-200 pt-3">
      <div className="mb-2 text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">Parts decisions · {jobLabel || "Current finding"}</div>
      <div className="space-y-2">
        {parts.map((part, index) => { const decision = candidateDecision(part); return <div key={index} className={\`grid gap-2 rounded-lg border p-2 lg:grid-cols-[auto_minmax(180px,1.3fr)_72px_minmax(130px,0.7fr)_minmax(240px,1.5fr)_auto] \${decision === "in_stock" ? "border-emerald-200 bg-emerald-50/40" : decision === "not_needed" ? "border-slate-200 bg-slate-100/70" : "border-slate-200 bg-white"}\`}>
          <div className="flex items-center"><span className={\`rounded-full px-2 py-1 text-[9px] font-black uppercase \${decision === "in_stock" ? "bg-emerald-100 text-emerald-800" : decision === "not_needed" ? "bg-slate-200 text-slate-600" : "bg-violet-100 text-violet-700"}\`}>{decision === "in_stock" ? "In stock" : decision === "not_needed" ? "Not needed" : "Proposed"}</span></div>
          <input value={part.name} onChange={(e) => patch(index, { name: e.target.value })} placeholder="Part / material" className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs" />
          <input inputMode="decimal" value={part.quantity} onChange={(e) => patch(index, { quantity: e.target.value })} placeholder="Qty" className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs" />
          <input value={part.partNumber} onChange={(e) => patch(index, { partNumber: e.target.value })} placeholder="Part # / ref" className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs" />
          <input value={part.notes} onChange={(e) => patch(index, { notes: e.target.value })} placeholder="Sourcing / price note — e.g. I can get for $20; owner may find $10–15" className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs" />
          <button type="button" onClick={() => onChange(parts.filter((_, partIndex) => partIndex !== index))} className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-black text-slate-500">Undo</button>
        </div>; })}
      </div>
    </div> : null}
  </div>;
}`;

  source = source.slice(0, start) + replacement + source.slice(end);
  changed = true;
}

const oldSignature = 'function ProposalEditor({ vehicleLabel, contextText, draft, onChange, submitLabel, onSubmit, disabled, requiresDiagnosisHandoff = false, diagnosisNotesReady = true }: { vehicleLabel: string; contextText: string; draft: RecommendationDraft; onChange: (draft: RecommendationDraft) => void; submitLabel: string; onSubmit: () => void; disabled: boolean; requiresDiagnosisHandoff?: boolean; diagnosisNotesReady?: boolean }) {';
const newSignature = 'function ProposalEditor({ vehicleLabel, jobLabel, contextText, draft, onChange, submitLabel, onSubmit, disabled, requiresDiagnosisHandoff = false, diagnosisNotesReady = true }: { vehicleLabel: string; jobLabel: string; contextText: string; draft: RecommendationDraft; onChange: (draft: RecommendationDraft) => void; submitLabel: string; onSubmit: () => void; disabled: boolean; requiresDiagnosisHandoff?: boolean; diagnosisNotesReady?: boolean }) {';
if (source.includes(oldSignature)) {
  source = source.replace(oldSignature, newSignature);
  changed = true;
}

const oldPartsCall = '<PartsEditor vehicleLabel={vehicleLabel} contextText={partsContext} parts={draft.parts} onChange={(parts) => onChange({ ...draft, parts })} />';
const newPartsCall = '<PartsEditor vehicleLabel={vehicleLabel} jobLabel={jobLabel} contextText={partsContext} parts={draft.parts} onChange={(parts) => onChange({ ...draft, parts })} />';
if (source.includes(oldPartsCall)) {
  source = source.replace(oldPartsCall, newPartsCall);
  changed = true;
}

source = source.replaceAll('vehicleLabel={item.vehicleLabel} contextText={`${finding.title} ${finding.description || ""}`}', 'vehicleLabel={item.vehicleLabel} jobLabel={finding.title} contextText={`${finding.title} ${finding.description || ""}`}');
source = source.replaceAll('vehicleLabel={item.vehicleLabel} contextText={`${upgrade.title} ${upgrade.description || ""} ${upgrade.desiredOutcome || ""}`}', 'vehicleLabel={item.vehicleLabel} jobLabel={upgrade.title} contextText={`${upgrade.title} ${upgrade.description || ""} ${upgrade.desiredOutcome || ""}`}');
source = source.replaceAll('vehicleLabel={item.vehicleLabel} contextText={`${fresh.title} ${fresh.description}`}', 'vehicleLabel={item.vehicleLabel} jobLabel={fresh.title || "New mechanical finding"} contextText={`${fresh.title} ${fresh.description}`}');

if (changed) {
  writeFileSync(path, source, "utf8");
  console.log("Tightened parts association and disposition UX in partner inspections.");
}

const routePath = "app/api/partner/inspections/[inspectionId]/route.ts";
let routeSource = readFileSync(routePath, "utf8");
const oldRecommendation = `function recommendationPatch(body: Record<string, unknown>) {
  const suggestions = partSuggestions(body.partSuggestions);
  const legacyParts = optionalText(body.partsRequired);
  const summary = suggestions.length
    ? suggestions.map((part) => \`${'${part.quantity > 1 ? `${part.quantity}x ` : ""}'}${'${part.name}'}${'${part.partNumber ? ` (${part.partNumber})` : ""}'}\`).join(", ")
    : legacyParts;`;
const newRecommendation = `function recommendationPatch(body: Record<string, unknown>) {
  const suggestions = partSuggestions(body.partSuggestions);
  const requiredSuggestions = suggestions.filter((part) => !part.notes?.startsWith("NOT NEEDED ·"));
  const legacyParts = optionalText(body.partsRequired);
  const summary = requiredSuggestions.length
    ? requiredSuggestions.map((part) => \`${'${part.quantity > 1 ? `${part.quantity}x ` : ""}'}${'${part.name}'}${'${part.partNumber ? ` (${part.partNumber})` : ""}'}\`).join(", ")
    : suggestions.length ? null : legacyParts;`;
if (!routeSource.includes("const requiredSuggestions = suggestions.filter")) {
  if (!routeSource.includes(oldRecommendation)) {
    throw new Error("Could not find inspection recommendation summary for not-needed parts cleanup.");
  }
  routeSource = routeSource.replace(oldRecommendation, newRecommendation);
  writeFileSync(routePath, routeSource, "utf8");
  console.log("Excluded not-needed inspection parts from required-parts summary.");
}
