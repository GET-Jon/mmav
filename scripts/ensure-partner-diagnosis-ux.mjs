import { readFileSync, writeFileSync } from "node:fs";

const path = "components/partner/partner-inspection-list.tsx";
let source = readFileSync(path, "utf8");

function replaceOnce(oldText, newText, label) {
  if (source.includes(newText)) return;
  if (!source.includes(oldText)) {
    throw new Error(`Could not find expected ${label} source. Refusing to patch automatically.`);
  }
  source = source.replace(oldText, newText);
}

replaceOnce(
`function ProposalEditor({ draft, onChange, submitLabel, onSubmit, disabled }: { draft: RecommendationDraft; onChange: (draft: RecommendationDraft) => void; submitLabel: string; onSubmit: () => void; disabled: boolean }) {
  return <div className="grid gap-2 sm:grid-cols-2">
    <input value={draft.recommendedAction} onChange={(e) => onChange({ ...draft, recommendedAction: e.target.value })} placeholder="Recommended action" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
    <div className="grid grid-cols-2 gap-2"><input inputMode="decimal" value={draft.laborHours} onChange={(e) => onChange({ ...draft, laborHours: e.target.value })} placeholder="Labor hours" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" /><input inputMode="decimal" value={draft.proposedLaborPrice} onChange={(e) => onChange({ ...draft, proposedLaborPrice: e.target.value })} placeholder="Labor price $" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" /></div>
    <PartsEditor parts={draft.parts} onChange={(parts) => onChange({ ...draft, parts })} />
    <select value={draft.canPerform} onChange={(e) => onChange({ ...draft, canPerform: e.target.value as RecommendationDraft["canPerform"] })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm"><option value="">Can you perform this work?</option><option value="yes">Yes — I can perform it</option><option value="no">No — another specialist is needed</option></select>
    <button type="button" disabled={disabled} onClick={onSubmit} className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-black text-white disabled:bg-slate-200 disabled:text-slate-400">{submitLabel}</button>
  </div>;
}`,
`function ProposalEditor({ draft, onChange, submitLabel, onSubmit, disabled, requiresDiagnosisHandoff = false, diagnosisNotesReady = true }: { draft: RecommendationDraft; onChange: (draft: RecommendationDraft) => void; submitLabel: string; onSubmit: () => void; disabled: boolean; requiresDiagnosisHandoff?: boolean; diagnosisNotesReady?: boolean }) {
  const diagnosisActionReady = draft.recommendedAction.trim().length > 0;
  const diagnosisReady = !requiresDiagnosisHandoff || (diagnosisNotesReady && diagnosisActionReady);
  return <div className="grid gap-2 sm:grid-cols-2">
    <div>
      <input value={draft.recommendedAction} onChange={(e) => onChange({ ...draft, recommendedAction: e.target.value })} placeholder={requiresDiagnosisHandoff ? "Required: next diagnostic action" : "Recommended action"} aria-required={requiresDiagnosisHandoff} className={\`w-full rounded-xl border px-3 py-2 text-sm \${requiresDiagnosisHandoff && !diagnosisActionReady ? "border-amber-400 bg-amber-50/50" : "border-slate-200"}\`} />
      {requiresDiagnosisHandoff ? <div className="mt-1.5 text-[11px] font-semibold text-amber-800">Required for Needs Diagnosis: describe the next specialist check or diagnostic action.</div> : null}
    </div>
    <div className="grid grid-cols-2 gap-2"><input inputMode="decimal" value={draft.laborHours} onChange={(e) => onChange({ ...draft, laborHours: e.target.value })} placeholder="Labor hours" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" /><input inputMode="decimal" value={draft.proposedLaborPrice} onChange={(e) => onChange({ ...draft, proposedLaborPrice: e.target.value })} placeholder="Labor price $" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" /></div>
    <PartsEditor parts={draft.parts} onChange={(parts) => onChange({ ...draft, parts })} />
    <select value={draft.canPerform} onChange={(e) => onChange({ ...draft, canPerform: e.target.value as RecommendationDraft["canPerform"] })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm"><option value="">Can you perform this work?</option><option value="yes">Yes — I can perform it</option><option value="no">No — another specialist is needed</option></select>
    <div>
      <button type="button" disabled={disabled || !diagnosisReady} onClick={onSubmit} className="w-full rounded-xl bg-slate-950 px-4 py-2 text-sm font-black text-white disabled:bg-slate-200 disabled:text-slate-400">{submitLabel}</button>
      {requiresDiagnosisHandoff && !diagnosisNotesReady ? <div className="mt-1.5 text-[11px] font-semibold text-amber-800">Add diagnostic notes above explaining what remains unknown.</div> : null}
    </div>
  </div>;
}`,
"ProposalEditor",
);

replaceOnce(
`    const draft = findingDraft(finding);
    const saved = await act(item, { action: "validate_finding", findingId: finding.id, status, notes: findingNotes[finding.id] ?? finding.validationNotes ?? "", recommendedAction: draft.recommendedAction, laborHours: draft.laborHours, proposedLaborPrice: draft.proposedLaborPrice, partSuggestions: cleanParts(draft.parts), canPerform: draft.canPerform === "" ? null : draft.canPerform === "yes" });`,
`    const draft = findingDraft(finding);
    const notes = findingNotes[finding.id] ?? finding.validationNotes ?? "";
    if (status === "needs_diagnosis" && (!notes.trim() || !draft.recommendedAction.trim())) {
      setMessages((current) => ({ ...current, [item.id]: "Needs Diagnosis requires notes explaining what remains unknown and a recommended next diagnostic action." }));
      return;
    }
    const saved = await act(item, { action: "validate_finding", findingId: finding.id, status, notes, recommendedAction: draft.recommendedAction, laborHours: draft.laborHours, proposedLaborPrice: draft.proposedLaborPrice, partSuggestions: cleanParts(draft.parts), canPerform: draft.canPerform === "" ? null : draft.canPerform === "yes" });`,
"Needs Diagnosis submit guard",
);

replaceOnce(
`placeholder="Diagnostic notes" className="mb-3 min-h-16 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />`,
`placeholder={selected === "needs_diagnosis" ? "Required: explain what remains unknown and why further diagnosis is needed" : "Diagnostic notes"} aria-required={selected === "needs_diagnosis"} className={\`mb-3 min-h-16 w-full rounded-xl border px-3 py-2 text-sm \${selected === "needs_diagnosis" && !(findingNotes[finding.id] ?? finding.validationNotes ?? "").trim() ? "border-amber-400 bg-amber-50/50" : "border-slate-200"}\`} />`,
"diagnostic notes field",
);

replaceOnce(
`submitLabel="Submit Finding" onSubmit={() => void submitFinding(item, finding)} disabled={working === item.id || !selected} />`,
`submitLabel="Submit Finding" onSubmit={() => void submitFinding(item, finding)} disabled={working === item.id || !selected} requiresDiagnosisHandoff={selected === "needs_diagnosis"} diagnosisNotesReady={Boolean((findingNotes[finding.id] ?? finding.validationNotes ?? "").trim())} />`,
"finding ProposalEditor call",
);

replaceOnce(
`submitLabel="Resubmit Finding" onSubmit={() => void submitFinding(item, finding)} disabled={working === item.id} />`,
`submitLabel="Resubmit Finding" onSubmit={() => void submitFinding(item, finding)} disabled={working === item.id} requiresDiagnosisHandoff={selected === "needs_diagnosis"} diagnosisNotesReady={Boolean((findingNotes[finding.id] ?? finding.validationNotes ?? "").trim())} />`,
"clarification ProposalEditor call",
);

writeFileSync(path, source, "utf8");
console.log("Ensured Needs Diagnosis handoff UX in partner inspection findings.");
