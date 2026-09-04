import { readFileSync, writeFileSync } from "node:fs";

const path = "components/partner/partner-inspection-list.tsx";
let source = readFileSync(path, "utf8");
let changed = false;

if (!source.includes("function PartsEditor({ vehicleLabel, contextText")) {
  const start = source.indexOf("function PartsEditor(");
  const end = source.indexOf("\n\nfunction ProposalEditor", start);
  if (start === -1 || end === -1) {
    throw new Error("Could not find PartsEditor boundaries. Refusing to modify partner inspection parts UX automatically.");
  }

  const replacement = `type AiPartCandidate = {
  name: string;
  need: "likely_required" | "possible" | "consumable";
  searchQuery: string;
  sources: Array<{ key: "turn14" | "amazon" | "ebay"; label: string; url: string; note: string }>;
};

function partNeedLabel(value: AiPartCandidate["need"]) {
  if (value === "likely_required") return "Likely required";
  if (value === "consumable") return "Consumable";
  return "Possible";
}

function PartsEditor({ vehicleLabel, contextText, parts, onChange }: { vehicleLabel: string; contextText: string; parts: PartDraft[]; onChange: (parts: PartDraft[]) => void }) {
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

  function addCandidate(candidate: AiPartCandidate) {
    if (parts.some((part) => part.name.trim().toLowerCase() === candidate.name.toLowerCase())) {
      setPartsMessage(candidate.name + " is already in the proposed parts list.");
      return;
    }
    onChange([...parts, {
      name: candidate.name,
      quantity: "1",
      partNumber: "",
      notes: "Lot Logic search: " + candidate.searchQuery,
    }]);
  }

  function openSource(source: AiPartCandidate["sources"][number], searchQuery: string) {
    if (source.key === "turn14") {
      void navigator.clipboard?.writeText(searchQuery);
      setPartsMessage("Search phrase copied. Paste it into Turn 14.");
    }
    window.open(source.url, "_blank", "noopener,noreferrer");
  }

  return <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 sm:col-span-2">
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">Parts for this job</div>
        <div className="mt-0.5 text-xs text-slate-500">Start with Lot Logic, accept what fits, then add sourcing or price guidance for the Owner.</div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={thinking} onClick={() => void suggestWithLotLogic()} className="rounded-lg border border-violet-300 bg-white px-3 py-2 text-xs font-black text-violet-800 disabled:opacity-40">{thinking ? "Thinking…" : "Suggest with Lot Logic"}</button>
        <button type="button" onClick={() => onChange([...parts, blankPart()])} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-black">+ Add part</button>
      </div>
    </div>

    {partsMessage ? <div className="mt-2 text-xs font-semibold text-slate-600">{partsMessage}</div> : null}

    {candidates.length ? <div className="mt-3 grid gap-2 lg:grid-cols-2">
      {candidates.map((candidate) => <div key={candidate.name} className="rounded-xl border border-violet-200 bg-white p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-black text-slate-950">{candidate.name}</div>
            <div className="mt-0.5 text-[10px] font-black uppercase text-violet-600">{partNeedLabel(candidate.need)}</div>
            <div className="mt-1 truncate text-[11px] font-semibold text-slate-500" title={candidate.searchQuery}>{candidate.searchQuery}</div>
          </div>
          <button type="button" onClick={() => addCandidate(candidate)} className="shrink-0 rounded-lg bg-violet-700 px-3 py-2 text-[10px] font-black text-white">Add</button>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {candidate.sources.map((source) => <button key={source.key} type="button" onClick={() => openSource(source, candidate.searchQuery)} className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-[10px] font-black text-slate-700">{source.key === "turn14" ? "Turn 14" : source.label}</button>)}
        </div>
      </div>)}
    </div> : null}

    {parts.length ? <div className="mt-3 space-y-2">
      {parts.map((part, index) => <div key={index} className="grid gap-2 rounded-lg border border-slate-200 bg-white p-2 lg:grid-cols-[minmax(180px,1.3fr)_72px_minmax(130px,0.7fr)_minmax(240px,1.5fr)_auto]">
        <input value={part.name} onChange={(e) => patch(index, { name: e.target.value })} placeholder="Part / material" className="rounded-lg border border-slate-200 px-2.5 py-2 text-xs" />
        <input inputMode="decimal" value={part.quantity} onChange={(e) => patch(index, { quantity: e.target.value })} placeholder="Qty" className="rounded-lg border border-slate-200 px-2.5 py-2 text-xs" />
        <input value={part.partNumber} onChange={(e) => patch(index, { partNumber: e.target.value })} placeholder="Part # / ref" className="rounded-lg border border-slate-200 px-2.5 py-2 text-xs" />
        <input value={part.notes} onChange={(e) => patch(index, { notes: e.target.value })} placeholder="Sourcing note / price guidance — e.g. I can get for $20; owner may find $10–15" className="rounded-lg border border-slate-200 px-2.5 py-2 text-xs" />
        <button type="button" onClick={() => onChange(parts.filter((_, partIndex) => partIndex !== index))} className="rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-black text-slate-500">Remove</button>
      </div>)}
    </div> : null}
  </div>;
}`;

  source = source.slice(0, start) + replacement + source.slice(end);
  changed = true;
}

const oldSignature = 'function ProposalEditor({ draft, onChange, submitLabel, onSubmit, disabled, requiresDiagnosisHandoff = false, diagnosisNotesReady = true }: { draft: RecommendationDraft; onChange: (draft: RecommendationDraft) => void; submitLabel: string; onSubmit: () => void; disabled: boolean; requiresDiagnosisHandoff?: boolean; diagnosisNotesReady?: boolean }) {';
const newSignature = 'function ProposalEditor({ vehicleLabel, draft, onChange, submitLabel, onSubmit, disabled, requiresDiagnosisHandoff = false, diagnosisNotesReady = true }: { vehicleLabel: string; draft: RecommendationDraft; onChange: (draft: RecommendationDraft) => void; submitLabel: string; onSubmit: () => void; disabled: boolean; requiresDiagnosisHandoff?: boolean; diagnosisNotesReady?: boolean }) {';
if (source.includes(oldSignature)) {
  source = source.replace(oldSignature, newSignature);
  changed = true;
}

const oldPartsCall = '<PartsEditor parts={draft.parts} onChange={(parts) => onChange({ ...draft, parts })} />';
const newPartsCall = '<PartsEditor vehicleLabel={vehicleLabel} contextText={draft.recommendedAction} parts={draft.parts} onChange={(parts) => onChange({ ...draft, parts })} />';
if (source.includes(oldPartsCall)) {
  source = source.replace(oldPartsCall, newPartsCall);
  changed = true;
}

if (source.includes('<ProposalEditor draft=')) {
  source = source.replaceAll('<ProposalEditor draft=', '<ProposalEditor vehicleLabel={item.vehicleLabel} draft=');
  changed = true;
}

if (changed) {
  writeFileSync(path, source, "utf8");
  console.log("Added Lot Logic parts assistance to partner mechanical inspections.");
}
