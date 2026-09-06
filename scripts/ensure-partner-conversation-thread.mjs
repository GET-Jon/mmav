import { readFileSync, writeFileSync } from "node:fs";

const path = "components/partner/partner-inspection-list.tsx";
const source = readFileSync(path, "utf8");
let next = source;

if (!next.includes('from "@/components/partner/partner-finding-conversation"')) {
  next = next.replace(
    'import { useRouter } from "next/navigation";\n',
    'import { useRouter } from "next/navigation";\n\nimport { PartnerFindingConversation } from "@/components/partner/partner-finding-conversation";\n',
  );
}

const clarificationStart = next.indexOf('{submitted && clarificationFindings.length ?');
const clarificationEnd = clarificationStart === -1 ? -1 : next.indexOf('{editable ? <>', clarificationStart);

if (clarificationStart === -1 || clarificationEnd === -1) {
  throw new Error("Could not locate the partner clarification section. Refusing to build without the conversation thread.");
}

let block = next.slice(clarificationStart, clarificationEnd);

block = block.replaceAll(
  'findingNotes[finding.id] ?? finding.validationNotes ?? ""',
  'findingNotes[finding.id] ?? ""',
);
block = block.replaceAll(
  '"Answer the Owner\'s question / update your notes"',
  '"Your response to the Owner"',
);

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

const textareaAt = block.indexOf('<textarea ');
if (textareaAt === -1) {
  throw new Error("Could not locate the inspector clarification response field.");
}

if (!block.includes('<PartnerFindingConversation findingId={finding.id} />')) {
  block = block.slice(0, textareaAt) + '<PartnerFindingConversation findingId={finding.id} />' + block.slice(textareaAt);
}

block = block.replace(
  'className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-black uppercase text-amber-800">Clarification requested</span>',
  'className="inline-flex w-[118px] items-center justify-center whitespace-normal rounded-xl bg-amber-100 px-3 py-2 text-center text-[10px] font-black uppercase leading-[1.15] text-amber-800">Clarification requested</span>',
);

if (!block.includes('<PartnerFindingConversation findingId={finding.id} />')) {
  throw new Error("Partner clarification conversation component was not inserted.");
}

next = next.slice(0, clarificationStart) + block + next.slice(clarificationEnd);

if (next === source) {
  throw new Error("Partner clarification conversation patch made no source change.");
}

writeFileSync(path, next, "utf8");
console.log("Connected partner clarification UI to dedicated live conversation endpoint.");
