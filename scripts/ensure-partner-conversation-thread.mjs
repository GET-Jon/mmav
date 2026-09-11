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

if (next !== source) {
  writeFileSync(path, next, "utf8");
  console.log("Connected partner clarification UI to dedicated live conversation endpoint.");
} else {
  console.log("Partner clarification conversation is already connected.");
}

// Keep the complete Owner ↔ mechanic exchange visible in the compact Owner review
// card. V15 still uses build-time source alignment, so this intentionally patches
// the V2 review component without changing any authorization semantics.
const ownerPath = "components/mindful-inventory/mechanical-owner-finding-review-v2.tsx";
const ownerSource = readFileSync(ownerPath, "utf8");
let ownerNext = ownerSource;

if (!ownerNext.includes("function renderConversation(finding: InventoryFindingView)")) {
  const marker = "  function renderPartnerChoice(finding: InventoryFindingView) {";
  if (!ownerNext.includes(marker)) {
    throw new Error("Could not find Owner review Partner-choice boundary for conversation insertion.");
  }

  const helper = [
    '  function renderConversation(finding: InventoryFindingView) {',
    '    if (!finding.mechanicalConversation.length) return null;',
    '',
    '    return (',
    '      <div className="mt-2.5 border-t border-slate-100 pt-2.5">',
    '        <div className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-400">Conversation</div>',
    '        <div className="mt-1.5 space-y-1.5">',
    '          {finding.mechanicalConversation.map((entry) => (',
    '            <div key={entry.id} className="flex gap-2 text-xs leading-5">',
    '              <span className={"w-16 shrink-0 font-black " + (entry.role === "owner" ? "text-blue-700" : "text-slate-700")}>',
    '                {entry.role === "owner" ? "Owner" : inspector?.displayName || "Mechanic"}',
    '              </span>',
    '              <span className="font-semibold text-slate-600">{entry.message}</span>',
    '            </div>',
    '          ))}',
    '        </div>',
    '      </div>',
    '    );',
    '  }',
    '',
  ].join("\n");

  ownerNext = ownerNext.replace(marker, helper + marker);
}

const normalConversationTarget = `        {renderDecisionSummary(finding)}\n        {renderMechanicEvidence(finding)}\n        {renderPartnerChoice(finding)}`;
const normalConversationReplacement = `        {renderDecisionSummary(finding)}\n        {renderMechanicEvidence(finding)}\n        {renderConversation(finding)}\n        {renderPartnerChoice(finding)}`;
if (!ownerNext.includes(normalConversationReplacement)) {
  if (!ownerNext.includes(normalConversationTarget)) {
    throw new Error("Could not find normal Owner review evidence stack for conversation insertion.");
  }
  ownerNext = ownerNext.replace(normalConversationTarget, normalConversationReplacement);
}

const notFoundConversationTarget = `        </div>\n\n        {clarification && finding.mechanicalOwnerReviewNotes ? (`;
const notFoundConversationReplacement = `        </div>\n\n        {renderConversation(finding)}\n\n        {clarification && finding.mechanicalOwnerReviewNotes && !finding.mechanicalConversation.length ? (`;
if (!ownerNext.includes(notFoundConversationReplacement)) {
  if (!ownerNext.includes(notFoundConversationTarget)) {
    throw new Error("Could not find no-work Owner review conversation boundary.");
  }
  ownerNext = ownerNext.replace(notFoundConversationTarget, notFoundConversationReplacement);
}

ownerNext = ownerNext.replaceAll(
  "{clarification && finding.mechanicalOwnerReviewNotes ? (",
  "{clarification && finding.mechanicalOwnerReviewNotes && !finding.mechanicalConversation.length ? (",
);

const resolvedConversationTarget = `            )}\n            {finding.mechanicalOwnerReviewNotes ? (`;
const resolvedConversationReplacement = `            )}\n            {renderConversation(finding)}\n            {finding.mechanicalOwnerReviewNotes ? (`;
if (!ownerNext.includes(resolvedConversationReplacement)) {
  if (!ownerNext.includes(resolvedConversationTarget)) {
    throw new Error("Could not find resolved finding detail boundary for conversation insertion.");
  }
  ownerNext = ownerNext.replace(resolvedConversationTarget, resolvedConversationReplacement);
}

if (ownerNext !== ownerSource) {
  writeFileSync(ownerPath, ownerNext, "utf8");
  console.log("Displayed the full Owner/mechanic conversation in compact finding review cards.");
} else {
  console.log("Owner finding review already shows the full conversation thread.");
}
