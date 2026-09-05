import { readFileSync, writeFileSync } from "node:fs";

const path = "components/partner/partner-inspection-list.tsx";
const source = readFileSync(path, "utf8");
let next = source;

const clarificationStart = next.indexOf('{submitted && clarificationFindings.length ?');
const clarificationEnd = clarificationStart === -1 ? -1 : next.indexOf('{editable ? <>', clarificationStart);

if (clarificationStart !== -1 && clarificationEnd !== -1) {
  let block = next.slice(clarificationStart, clarificationEnd);

  // A clarification starts a new reply turn. Never seed the new reply box with
  // the prior diagnostic/clarification response.
  block = block.replaceAll(
    'findingNotes[finding.id] ?? finding.validationNotes ?? ""',
    'findingNotes[finding.id] ?? ""',
  );

  // Remove the legacy one-line Owner asks banner. The full thread below is the
  // single source of context for both parties.
  const ownerAskLabel = '<span className="font-black">Owner asks:</span> {finding.ownerReviewNotes}';
  const ownerAskAt = block.indexOf(ownerAskLabel);
  if (ownerAskAt !== -1) {
    const opening = block.lastIndexOf('{finding.ownerReviewNotes ?', ownerAskAt);
    const closing = block.indexOf(' : null}', ownerAskAt);
    if (opening !== -1 && closing !== -1) {
      block = block.slice(0, opening) + block.slice(closing + ' : null}'.length);
    }
  }

  // Insert the conversation immediately before the clarification response
  // composer. This is deliberately anchored to the response textarea rather
  // than to Tailwind class strings, which have changed several times.
  if (!block.includes('data-finding-conversation="true"')) {
    const textareaAt = block.indexOf('<textarea ');
    if (textareaAt !== -1) {
      const thread = `{(finding.conversation ?? []).length ? <div data-finding-conversation="true" className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
        <div className="mb-2 text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">Owner / inspector conversation</div>
        <div className="space-y-2">{(finding.conversation ?? []).map((entry) => <div key={entry.id} className={\`rounded-lg px-3 py-2 text-xs leading-5 \${entry.role === "owner" ? "bg-amber-50 text-amber-950" : "bg-blue-50 text-blue-950"}\`}><div className="mb-0.5 text-[9px] font-black uppercase tracking-[0.08em] opacity-60">{entry.role === "owner" ? "Owner" : "Inspector"}</div>{entry.message}</div>)}</div>
      </div> : finding.ownerReviewNotes ? <div data-finding-conversation="true" className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900"><span className="font-black">Owner asks:</span> {finding.ownerReviewNotes}</div> : null}`;
      block = block.slice(0, textareaAt) + thread + block.slice(textareaAt);
    }
  }

  // Keep the status cue compact and centered rather than a long floating pill.
  block = block.replace(
    'className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-black uppercase text-amber-800">Clarification requested</span>',
    'className="inline-flex w-[118px] items-center justify-center whitespace-normal rounded-xl bg-amber-100 px-3 py-2 text-center text-[10px] font-black uppercase leading-[1.15] text-amber-800">Clarification requested</span>',
  );

  next = next.slice(0, clarificationStart) + block + next.slice(clarificationEnd);
}

if (next !== source) {
  writeFileSync(path, next, "utf8");
  console.log("Inserted the full Owner / inspector thread in partner clarification review.");
}
