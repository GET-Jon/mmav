import { readFileSync, writeFileSync } from "node:fs";

const path = "components/partner/partner-inspection-list.tsx";
const source = readFileSync(path, "utf8");
let next = source;

const clarificationStart = next.indexOf('{submitted && clarificationFindings.length ?');
const clarificationEnd = clarificationStart === -1 ? -1 : next.indexOf('{editable ? <>', clarificationStart);

if (clarificationStart !== -1 && clarificationEnd !== -1) {
  let block = next.slice(clarificationStart, clarificationEnd);

  // A clarification is a new turn in the conversation. Do not prefill the
  // inspector response composer with the previous diagnostic note.
  block = block.replaceAll(
    'findingNotes[finding.id] ?? finding.validationNotes ?? ""',
    'findingNotes[finding.id] ?? ""',
  );

  const ownerAskTextSm = '{finding.ownerReviewNotes ? <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900"><span className="font-black">Owner asks:</span> {finding.ownerReviewNotes}</div> : null}';
  const ownerAskTextXs = '{finding.ownerReviewStatus === "clarification_requested" && finding.ownerReviewNotes ? <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900"><span className="font-black">Owner asks:</span> {finding.ownerReviewNotes}</div> : null}';
  const thread = `{(finding.conversation ?? []).length ? <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
        <div className="mb-2 text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">Owner / inspector conversation</div>
        <div className="space-y-2">{(finding.conversation ?? []).map((entry) => <div key={entry.id} className={\`rounded-lg px-3 py-2 text-xs leading-5 \${entry.role === "owner" ? "bg-amber-50 text-amber-950" : "bg-blue-50 text-blue-950"}\`}><div className="mb-0.5 text-[9px] font-black uppercase tracking-[0.08em] opacity-60">{entry.role === "owner" ? "Owner" : "Inspector"}</div>{entry.message}</div>)}</div>
      </div> : finding.ownerReviewNotes ? <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900"><span className="font-black">Owner asks:</span> {finding.ownerReviewNotes}</div> : null}`;

  if (!block.includes('Owner / inspector conversation')) {
    block = block.replace(ownerAskTextSm, thread).replace(ownerAskTextXs, thread);
  }

  // Give the finding-level clarification badge a deliberate two-line footprint
  // instead of a long floating pill.
  block = block.replace(
    'className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-black uppercase text-amber-800">Clarification requested</span>',
    'className="inline-flex w-[118px] items-center justify-center whitespace-normal rounded-xl bg-amber-100 px-3 py-2 text-center text-[10px] font-black uppercase leading-[1.15] text-amber-800">Clarification requested</span>',
  );

  next = next.slice(0, clarificationStart) + block + next.slice(clarificationEnd);
}

if (next !== source) {
  writeFileSync(path, next, "utf8");
  console.log("Made partner clarification threads contextual and easier to scan.");
}
