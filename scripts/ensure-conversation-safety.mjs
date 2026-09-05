import { readFileSync, writeFileSync } from "node:fs";

function guard(path, replacements) {
  const source = readFileSync(path, "utf8");
  let next = source;
  for (const [from, to] of replacements) {
    next = next.replaceAll(from, to);
  }
  if (next !== source) {
    writeFileSync(path, next, "utf8");
    return true;
  }
  return false;
}

const partnerChanged = guard("components/partner/partner-inspection-list.tsx", [
  ["finding.conversation.length", "(finding.conversation || []).length"],
  ["finding.conversation.map", "(finding.conversation || []).map"],
]);

const ownerChanged = guard("components/mindful-inventory/mechanical-owner-finding-review.tsx", [
  ["finding.mechanicalConversation.length", "(finding.mechanicalConversation || []).length"],
  ["finding.mechanicalConversation.map", "(finding.mechanicalConversation || []).map"],
  ["finding.mechanicalConversation.some", "(finding.mechanicalConversation || []).some"],
]);

const workPlanChanged = guard("app/api/mindful/inventory/vehicles/[id]/work-plan/generate/route.ts", [
  ["mechanicalSuggestedParts: finding.mechanicalSuggestedParts,\\n          mechanicalConversation", "mechanicalSuggestedParts: finding.mechanicalSuggestedParts,\n          mechanicalConversation"],
]);

if (partnerChanged || ownerChanged || workPlanChanged) {
  console.log("Guarded owner/inspector conversation rendering and AI handoff output.");
}
