import { readFileSync, writeFileSync } from "node:fs";

function update(path, transform) {
  const source = readFileSync(path, "utf8");
  const next = transform(source);
  if (next !== source) {
    writeFileSync(path, next, "utf8");
    return true;
  }
  return false;
}

const partnerChanged = update("components/partner/partner-inspection-list.tsx", (input) => {
  let source = input;

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
  source = source.replace(oldGroups, newGroups);

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
        textareaBlock = textareaBlock.replace("Answer the Owner's question / update your notes", "Your response to the Owner");
        const replacement = `${textareaBlock}<details className="mt-3 rounded-xl border border-slate-200 bg-slate-50/60">
        <summary className="cursor-pointer list-none px-4 py-3 text-xs font-black text-slate-700">Review details & resubmit <span className="ml-1 text-slate-400">▾</span></summary>
        <div className="border-t border-slate-200 p-3">${statusBlock}${proposalBlock}</div>
      </details>`;
        source = source.slice(0, statusStart) + replacement + source.slice(proposalEnd + ' /></div>'.length);
      }
    }
  }

  const legacyAsk = '{finding.ownerReviewStatus === "clarification_requested" && finding.ownerReviewNotes ? <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900"><span className="font-black">Owner asks:</span> {finding.ownerReviewNotes}</div> : null}';
  const thread = `{(finding.conversation ?? []).length ? <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
        <div className="mb-2 text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">Owner / inspector conversation</div>
        <div className="space-y-2">{(finding.conversation ?? []).map((entry) => <div key={entry.id} className={\`rounded-lg px-3 py-2 text-xs leading-5 \${entry.role === "owner" ? "bg-amber-50 text-amber-950" : "bg-blue-50 text-blue-950"}\`}><div className="mb-0.5 text-[9px] font-black uppercase tracking-[0.08em] opacity-60">{entry.role === "owner" ? "Owner" : "Inspector"}</div>{entry.message}</div>)}</div>
      </div> : finding.ownerReviewStatus === "clarification_requested" && finding.ownerReviewNotes ? <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900"><span className="font-black">Owner asks:</span> {finding.ownerReviewNotes}</div> : null}`;
  source = source.replace(legacyAsk, thread);
  return source;
});

const ownerChanged = update("components/mindful-inventory/mechanical-owner-finding-review.tsx", (input) => {
  let source = input;
  source = source.replace('        finding.mechanicalOwnerReviewNotes || "",', '        "",');
  source = source.replace(
    `  const [openNotes, setOpenNotes] = useState<Record<string, boolean>>(() =>\n    Object.fromEntries(\n      findings.map((finding) => [\n        finding.id,\n        Boolean(\n          finding.mechanicalOwnerReviewStatus === "clarification_requested" ||\n            finding.mechanicalOwnerReviewNotes,\n        ),\n      ]),\n    ),\n  );`,
    `  const [openNotes, setOpenNotes] = useState<Record<string, boolean>>(() =>\n    Object.fromEntries(findings.map((finding) => [finding.id, false])),\n  );`,
  );
  source = source.replace(
    '        {finding.mechanicalValidationNotes ? (',
    '        {finding.mechanicalValidationNotes && !(finding.mechanicalConversation ?? []).some((entry) => entry.role === "partner" && entry.message === finding.mechanicalValidationNotes) ? (',
  );

  const oldQuestion = `        {clarification && finding.mechanicalOwnerReviewNotes ? (\n          <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">\n            <span className="font-black">Question sent:</span>{" "}\n            {finding.mechanicalOwnerReviewNotes}\n          </div>\n        ) : null}`;
  const newThread = `        {(finding.mechanicalConversation ?? []).length ? (\n          <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3">\n            <div className="mb-2 text-[10px] font-black uppercase tracking-[0.08em] text-slate-400">Owner / inspector conversation</div>\n            <div className="space-y-2">\n              {(finding.mechanicalConversation ?? []).map((entry) => (\n                <div key={entry.id} className={\`rounded-lg px-3 py-2 text-xs leading-5 \${entry.role === "owner" ? "bg-amber-50 text-amber-950" : "bg-blue-50 text-blue-950"}\`}>\n                  <div className="mb-0.5 text-[9px] font-black uppercase tracking-[0.08em] opacity-60">{entry.role === "owner" ? "Owner" : "Inspector"}</div>\n                  {entry.message}\n                </div>\n              ))}\n            </div>\n          </div>\n        ) : clarification && finding.mechanicalOwnerReviewNotes ? (\n          <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900"><span className="font-black">Question sent:</span>{" "}{finding.mechanicalOwnerReviewNotes}</div>\n        ) : null}`;
  source = source.replace(oldQuestion, newThread);

  const oldResolvedNote = `            {finding.mechanicalOwnerReviewNotes ? (\n              <div className="mt-3 text-xs font-semibold text-slate-600">\n                <span className="font-black text-slate-800">Owner note:</span>{" "}\n                {finding.mechanicalOwnerReviewNotes}\n              </div>\n            ) : null}`;
  const resolvedThread = `            {(finding.mechanicalConversation ?? []).length ? (\n              <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">\n                <div className="mb-2 text-[10px] font-black uppercase tracking-[0.08em] text-slate-400">Owner / inspector conversation</div>\n                <div className="space-y-2">{(finding.mechanicalConversation ?? []).map((entry) => (\n                  <div key={entry.id} className={\`rounded-lg px-3 py-2 text-xs leading-5 \${entry.role === "owner" ? "bg-amber-50 text-amber-950" : "bg-blue-50 text-blue-950"}\`}><div className="mb-0.5 text-[9px] font-black uppercase tracking-[0.08em] opacity-60">{entry.role === "owner" ? "Owner" : "Inspector"}</div>{entry.message}</div>\n                ))}</div>\n              </div>\n            ) : finding.mechanicalOwnerReviewNotes ? (\n              <div className="mt-3 text-xs font-semibold text-slate-600"><span className="font-black text-slate-800">Owner note:</span>{" "}{finding.mechanicalOwnerReviewNotes}</div>\n            ) : null}`;
  source = source.replace(oldResolvedNote, resolvedThread);

  source = source.replace(
    `              >\n                + Add note or question\n              </button>`,
    `              >\n                {clarification ? "+ Add another question" : "+ Add note or question"}\n              </button>`,
  );

  const refreshMarker = `      router.refresh();`;
  if (!source.includes('setOpenNotes((current) => ({ ...current, [finding.id]: false }))')) {
    source = source.replace(refreshMarker, `      if (decision === "clarification") {\n        setNotes((current) => ({ ...current, [finding.id]: "" }));\n        setOpenNotes((current) => ({ ...current, [finding.id]: false }));\n      }\n      router.refresh();`);
  }
  return source;
});

const planChanged = update("app/api/mindful/inventory/vehicles/[id]/work-plan/generate/route.ts", (source) =>
  source.replace(
    '          mechanicalSuggestedParts: finding.mechanicalSuggestedParts,',
    '          mechanicalSuggestedParts: finding.mechanicalSuggestedParts,\\n          mechanicalConversation: finding.mechanicalConversation.map(({ role, message, createdAt }) => ({ role, message, createdAt })),',
  ),
);

const promptChanged = update("lib/ai/prompts/work-plan.ts", (source) => {
  if (source.includes("mechanicalConversation contains the owner/inspector clarification thread")) return source;
  return source.replace(
    '- mechanicalSuggestedParts are inspector-suggested dependencies, not proof that those parts have been sourced or purchased.',
    '- mechanicalSuggestedParts are inspector-suggested dependencies, not proof that those parts have been sourced or purchased.\\n- mechanicalConversation contains the owner/inspector clarification thread for a Finding. Treat it as first-party project evidence: preserve resolved answers, owner constraints, and corrections when planning, and do not contradict the latest clarified response without stronger evidence.',
  );
});

if (partnerChanged || ownerChanged || planChanged || promptChanged) {
  console.log("Added threaded owner/inspector clarification context and AI handoff.");
}
