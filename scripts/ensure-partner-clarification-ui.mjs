import { readFileSync, writeFileSync } from "node:fs";

const path = "components/partner/partner-inspection-list.tsx";
let source = readFileSync(path, "utf8");
let changed = false;

const oldGroups = `          <div className="mt-2 flex flex-wrap gap-1.5">
            <button type="button" onClick={() => resolveCandidate(candidate, "added")} className="rounded-md bg-violet-700 px-2.5 py-1.5 text-[10px] font-black text-white">Add</button>
            <button type="button" onClick={() => resolveCandidate(candidate, "in_stock")} className="rounded-md border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-[10px] font-black text-emerald-800">In stock</button>
            <button type="button" onClick={() => resolveCandidate(candidate, "not_needed")} className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-[10px] font-black text-slate-600">Not needed</button>
            <span className="mx-0.5 border-l border-slate-200" />
            {candidate.sources.map((source) => <button key={source.key} type="button" onClick={() => openSource(source, candidate.searchQuery)} className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-[10px] font-black text-slate-700">{source.key === "turn14" ? "Turn 14" : source.label}</button>)}
          </div>`;

const newGroups = `          <div className="mt-3 grid gap-2 xl:grid-cols-2">
            <div className="rounded-lg border border-violet-100 bg-violet-50/60 p-2">
              <div className="mb-1.5 text-[9px] font-black uppercase tracking-[0.1em] text-violet-600">Decision</div>
              <div className="flex flex-wrap gap-1.5">
                <button type="button" onClick={() => resolveCandidate(candidate, "added")} className="rounded-md bg-violet-700 px-2.5 py-1.5 text-[10px] font-black text-white">Add</button>
                <button type="button" onClick={() => resolveCandidate(candidate, "in_stock")} className="rounded-md border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-[10px] font-black text-emerald-800">In stock</button>
                <button type="button" onClick={() => resolveCandidate(candidate, "not_needed")} className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-[10px] font-black text-slate-600">Not needed</button>
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
              <div className="mb-1.5 text-[9px] font-black uppercase tracking-[0.1em] text-slate-500">Source</div>
              <div className="flex flex-wrap gap-1.5">
                {candidate.sources.map((source) => <button key={source.key} type="button" onClick={() => openSource(source, candidate.searchQuery)} className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[10px] font-black text-slate-700">{source.key === "turn14" ? "Turn 14" : source.label}</button>)}
              </div>
            </div>
          </div>`;

if (source.includes(oldGroups)) {
  source = source.replace(oldGroups, newGroups);
  changed = true;
}

if (!source.includes("Review details & resubmit")) {
  const ownerAskMarker = '<span className="font-black">Owner asks:</span> {finding.ownerReviewNotes}</div> : null}';
  const ownerAskIndex = source.indexOf(ownerAskMarker);
  if (ownerAskIndex !== -1) {
    const afterOwnerAsk = ownerAskIndex + ownerAskMarker.length;
    const statusStart = source.indexOf('<div className="mt-3 flex flex-wrap gap-2">', afterOwnerAsk);
    const textareaStart = source.indexOf('<textarea ', statusStart);
    const proposalStart = source.indexOf('<div className="mt-3"><ProposalEditor', textareaStart);
    const resubmitIndex = source.indexOf('submitLabel="Resubmit Finding"', proposalStart);
    const proposalEnd = source.indexOf(' /></div>', resubmitIndex);

    if (statusStart !== -1 && textareaStart !== -1 && proposalStart !== -1 && resubmitIndex !== -1 && proposalEnd !== -1) {
      const statusBlock = source.slice(statusStart, textareaStart);
      let textareaBlock = source.slice(textareaStart, proposalStart);
      const proposalBlock = source.slice(proposalStart, proposalEnd + ' /></div>'.length);

      textareaBlock = textareaBlock.replace('placeholder={selected === "needs_diagnosis" ? "Required: explain what remains unknown and why further diagnosis is needed" : "Answer the Owner\'s question / update your notes"}', 'placeholder={selected === "needs_diagnosis" ? "Required: explain what remains unknown and why further diagnosis is needed" : "Your response to the Owner"}');

      const replacement = `${textareaBlock}<details className="mt-3 rounded-xl border border-slate-200 bg-slate-50/60">
        <summary className="cursor-pointer list-none px-4 py-3 text-xs font-black text-slate-700">Review details & resubmit <span className="ml-1 text-slate-400">▾</span></summary>
        <div className="border-t border-slate-200 p-3">${statusBlock}${proposalBlock}</div>
      </details>`;

      source = source.slice(0, statusStart) + replacement + source.slice(proposalEnd + ' /></div>'.length);
      changed = true;
    }
  }
}

if (changed) {
  writeFileSync(path, source, "utf8");
  console.log("Separated parts actions and simplified Owner clarification response UX.");
}
