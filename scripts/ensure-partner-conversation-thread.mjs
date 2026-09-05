import { readFileSync, writeFileSync } from "node:fs";

const path = "components/partner/partner-inspection-list.tsx";
const source = readFileSync(path, "utf8");
let next = source;

const clarificationStart = next.indexOf('{submitted && clarificationFindings.length ?');
const clarificationEnd = clarificationStart === -1 ? -1 : next.indexOf('{editable ? <>', clarificationStart);

if (clarificationStart === -1 || clarificationEnd === -1) {
  throw new Error("Could not locate the partner clarification section. Refusing to build without the conversation thread.");
}

let block = next.slice(clarificationStart, clarificationEnd);

// A clarification starts a new reply turn. Never seed the new reply box with
// the prior diagnostic/clarification response.
block = block.replaceAll(
  'findingNotes[finding.id] ?? finding.validationNotes ?? ""',
  'findingNotes[finding.id] ?? ""',
);
block = block.replaceAll(
  '"Answer the Owner\'s question / update your notes"',
  '"Your response to the Owner"',
);

// Remove the legacy one-line Owner asks banner. We intentionally locate it by
// its stable label instead of Tailwind classes so cosmetic changes cannot break
// the patch silently.
const ownerAskLabel = '<span className="font-black">Owner asks:</span> {finding.ownerReviewNotes}';
const ownerAskAt = block.indexOf(ownerAskLabel);
if (ownerAskAt !== -1) {
  const opening = block.lastIndexOf('{finding.ownerReviewNotes ?', ownerAskAt);
  const closing = block.indexOf(' : null}', ownerAskAt);
  if (opening === -1 || closing === -1) {
    throw new Error("Found Owner asks label but could not isolate its legacy banner.");
  }
  block = block.slice(0, opening) + block.slice(closing + ' : null}'.length);
}

// Always place the full shared conversation immediately above the response
// composer. This is the one canonical context area on the inspector side.
const textareaAt = block.indexOf('<textarea ');
if (textareaAt === -1) {
  throw new Error("Could not locate the inspector clarification response field.");
}

if (!block.includes('data-finding-conversation="true"')) {
  const thread = `{(finding.conversation ?? []).length ? <div data-finding-conversation="true" className="mt-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
        <div className="mb-2 text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">Owner / inspector conversation</div>
        <div className="space-y-2">{(finding.conversation ?? []).map((entry) => <div key={entry.id} className={\`rounded-lg px-3 py-2 text-xs leading-5 \${entry.role === "owner" ? "bg-amber-50 text-amber-950" : "bg-blue-50 text-blue-950"}\`}><div className="mb-0.5 text-[9px] font-black uppercase tracking-[0.08em] opacity-60">{entry.role === "owner" ? "Owner" : "Inspector"}</div>{entry.message}</div>)}</div>
      </div> : <div data-finding-conversation="true" className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500">No prior clarification messages.</div>}`;
  block = block.slice(0, textareaAt) + thread + block.slice(textareaAt);
}

// Keep the status cue compact and centered rather than a long floating pill.
block = block.replace(
  'className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-black uppercase text-amber-800">Clarification requested</span>',
  'className="inline-flex w-[118px] items-center justify-center whitespace-normal rounded-xl bg-amber-100 px-3 py-2 text-center text-[10px] font-black uppercase leading-[1.15] text-amber-800">Clarification requested</span>',
);

if (!block.includes('data-finding-conversation="true"') || !block.includes('Owner / inspector conversation')) {
  throw new Error("Partner clarification conversation thread was not inserted. Refusing to continue with a misleading UI.");
}

next = next.slice(0, clarificationStart) + block + next.slice(clarificationEnd);

if (next === source) {
  throw new Error("Partner clarification conversation patch made no source change.");
}

writeFileSync(path, next, "utf8");
console.log("Inserted the canonical Owner / inspector conversation above the partner reply field.");
