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

  const thread = `{(finding.conversation ?? []).length ? <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
        <div className="mb-2 text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">Owner / inspector conversation</div>
        <div className="space-y-2">{(finding.conversation ?? []).map((entry) => <div key={entry.id} className={\`rounded-lg px-3 py-2 text-xs leading-5 \${entry.role === "owner" ? "bg-amber-50 text-amber-950" : "bg-blue-50 text-blue-950"}\`}><div className="mb-0.5 text-[9px] font-black uppercase tracking-[0.08em] opacity-60">{entry.role === "owner" ? "Owner" : "Inspector"}</div>{entry.message}</div>)}</div>
      </div> : finding.ownerReviewNotes ? <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900"><span className="font-black">Owner asks:</span> {finding.ownerReviewNotes}</div> : null}`;

  // Remove the legacy one-line Owner asks block by locating its stable label,
  // then insert the shared conversation thread directly before the response
  // composer. This avoids depending on exact Tailwind class strings.
  if (!block.includes('Owner / inspector conversation')) {
    const ownerLabel = 'Owner asks:</span>';
    const ownerLabelIndex = block.indexOf(ownerLabel);
    if (ownerLabelIndex !== -1) {
      const ownerBlockStart = block.lastIndexOf('{finding.ownerReviewNotes ?', ownerLabelIndex);
      const ownerBlockEnd = block.indexOf(' : null}', ownerLabelIndex);
      if (ownerBlockStart !== -1 && ownerBlockEnd !== -1) {
        block = block.slice(0, ownerBlockStart) + block.slice(ownerBlockEnd + ' : null}'.length);
      }
    }

    const responseComposerIndex = block.indexOf('<textarea ');
    if (responseComposerIndex !== -1) {
      block = block.slice(0, responseComposerIndex) + thread + block.slice(responseComposerIndex);
    }
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
