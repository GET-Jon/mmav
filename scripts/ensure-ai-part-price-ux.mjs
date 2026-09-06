import { readFileSync, writeFileSync } from "node:fs";

const path = "components/partner/partner-inspection-list.tsx";
let source = readFileSync(path, "utf8");
let updated = source;

function replaceOnce(oldText, newText, label) {
  if (updated.includes(newText)) return;
  if (!updated.includes(oldText)) throw new Error(`Could not find ${label}. Refusing to patch AI part-price UX automatically.`);
  updated = updated.replace(oldText, newText);
}

replaceOnce(
  'type PartDraft = { name: string; quantity: string; partNumber: string; notes: string };',
  'type PartDraft = { name: string; quantity: string; partNumber: string; notes: string; aiEstimatedUnitPriceLow: number | null; aiEstimatedUnitPriceHigh: number | null; aiPriceBasis: string | null; partnerOfferUnitPrice: string };',
  "PartDraft type",
);

replaceOnce(
  '  searchQuery: string;\n  sources: Array<{ key: "turn14" | "amazon" | "ebay"; label: string; url: string; note: string }>;\n};',
  '  searchQuery: string;\n  estimatedUnitPriceLow: number | null;\n  estimatedUnitPriceHigh: number | null;\n  priceBasis: string | null;\n  sources: Array<{ key: "turn14" | "amazon" | "ebay"; label: string; url: string; note: string }>;\n};',
  "AI candidate price fields",
);

replaceOnce(
  'const blankPart = (): PartDraft => ({ name: "", quantity: "1", partNumber: "", notes: "" });',
  'const blankPart = (): PartDraft => ({ name: "", quantity: "1", partNumber: "", notes: "", aiEstimatedUnitPriceLow: null, aiEstimatedUnitPriceHigh: null, aiPriceBasis: null, partnerOfferUnitPrice: "" });',
  "blank part",
);

replaceOnce(
  '  return { name: part.name, quantity: String(part.quantity || 1), partNumber: part.partNumber || "", notes: part.notes || "" };',
  '  return { name: part.name, quantity: String(part.quantity || 1), partNumber: part.partNumber || "", notes: part.notes || "", aiEstimatedUnitPriceLow: part.aiEstimatedUnitPriceLow, aiEstimatedUnitPriceHigh: part.aiEstimatedUnitPriceHigh, aiPriceBasis: part.aiPriceBasis, partnerOfferUnitPrice: part.partnerOfferUnitPrice == null ? "" : String(part.partnerOfferUnitPrice) };',
  "part draft hydration",
);

replaceOnce(
  '    partNumber: part.partNumber.trim() || null,\n    notes: part.notes.trim() || null,',
  '    partNumber: part.partNumber.trim() || null,\n    notes: part.notes.trim() || null,\n    aiEstimatedUnitPriceLow: part.aiEstimatedUnitPriceLow,\n    aiEstimatedUnitPriceHigh: part.aiEstimatedUnitPriceHigh,\n    aiPriceBasis: part.aiPriceBasis,\n    partnerOfferUnitPrice: part.partnerOfferUnitPrice.trim() ? Number(part.partnerOfferUnitPrice) : null,',
  "clean parts pricing",
);

replaceOnce(
  'function partNeedLabel(value: AiPartCandidate["need"]) {\n  if (value === "likely_required") return "Likely required";\n  if (value === "consumable") return "Consumable";\n  return "Possible";\n}',
  'function partNeedLabel(value: AiPartCandidate["need"]) {\n  if (value === "likely_required") return "Likely required";\n  if (value === "consumable") return "Consumable";\n  return "Possible";\n}\nfunction aiPartPrice(candidate: Pick<AiPartCandidate, "estimatedUnitPriceLow" | "estimatedUnitPriceHigh">) {\n  const low = candidate.estimatedUnitPriceLow;\n  const high = candidate.estimatedUnitPriceHigh;\n  if (low == null && high == null) return null;\n  if (low != null && high != null) return low === high ? money(low) : `${money(low)}–${money(high)}`;\n  return money(low ?? high);\n}',
  "AI part price formatter",
);

if (!updated.includes('aiEstimatedUnitPriceLow: candidate.estimatedUnitPriceLow,')) {
  const candidateNotes = '      notes: `Lot Logic search: ${candidate.searchQuery}`,';
  if (!updated.includes(candidateNotes)) throw new Error("Could not find candidate add pricing. Refusing to patch AI part-price UX automatically.");
  updated = updated.replace(
    candidateNotes,
    `${candidateNotes}\n      aiEstimatedUnitPriceLow: candidate.estimatedUnitPriceLow,\n      aiEstimatedUnitPriceHigh: candidate.estimatedUnitPriceHigh,\n      aiPriceBasis: candidate.priceBasis,\n      partnerOfferUnitPrice: "",`,
  );
}

replaceOnce(
  '<div className="mt-0.5 text-[10px] font-black uppercase text-violet-600">{partNeedLabel(candidate.need)}</div>\n            <div className="mt-1 truncate text-[11px] font-semibold text-slate-500" title={candidate.searchQuery}>{candidate.searchQuery}</div>',
  '<div className="mt-0.5 text-[10px] font-black uppercase text-violet-600">{partNeedLabel(candidate.need)}</div>\n            {aiPartPrice(candidate) ? <div className="mt-1 text-xs font-black text-blue-700" title={candidate.priceBasis || "Lot Logic planning estimate; not a live quote"}>AI estimate: {aiPartPrice(candidate)}</div> : null}\n            <div className="mt-1 truncate text-[11px] font-semibold text-slate-500" title={candidate.searchQuery}>{candidate.searchQuery}</div>',
  "candidate price display",
);

replaceOnce(
  'className="grid gap-2 rounded-lg border border-slate-200 bg-white p-2 lg:grid-cols-[minmax(180px,1.3fr)_72px_minmax(130px,0.7fr)_minmax(240px,1.5fr)_auto]"',
  'className="grid gap-2 rounded-lg border border-slate-200 bg-white p-2 lg:grid-cols-[minmax(180px,1.25fr)_72px_minmax(120px,0.7fr)_120px_minmax(220px,1.3fr)_auto]"',
  "part row grid",
);

replaceOnce(
  '<input value={part.name} onChange={(e) => patch(index, { name: e.target.value })} placeholder="Part / material" className="rounded-lg border border-slate-200 px-2.5 py-2 text-xs" />',
  '<div><input value={part.name} onChange={(e) => patch(index, { name: e.target.value })} placeholder="Part / material" className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-xs" />{part.aiEstimatedUnitPriceLow != null || part.aiEstimatedUnitPriceHigh != null ? <div className="mt-1 px-1 text-[10px] font-bold text-blue-700" title={part.aiPriceBasis || "Lot Logic planning estimate; not a live quote"}>AI baseline: {part.aiEstimatedUnitPriceLow != null && part.aiEstimatedUnitPriceHigh != null ? `${money(part.aiEstimatedUnitPriceLow)}–${money(part.aiEstimatedUnitPriceHigh)}` : money(part.aiEstimatedUnitPriceLow ?? part.aiEstimatedUnitPriceHigh)}</div> : null}</div>',
  "part row AI baseline",
);

replaceOnce(
  '<input value={part.partNumber} onChange={(e) => patch(index, { partNumber: e.target.value })} placeholder="Part # / ref" className="rounded-lg border border-slate-200 px-2.5 py-2 text-xs" />\n        <input value={part.notes}',
  '<input value={part.partNumber} onChange={(e) => patch(index, { partNumber: e.target.value })} placeholder="Part # / ref" className="rounded-lg border border-slate-200 px-2.5 py-2 text-xs" />\n        <input inputMode="decimal" value={part.partnerOfferUnitPrice} onChange={(e) => patch(index, { partnerOfferUnitPrice: e.target.value })} placeholder="My cost $" title="Optional: enter your expected unit cost. Leave blank to keep the AI estimate as the Owner planning baseline." className="rounded-lg border border-slate-200 px-2.5 py-2 text-xs" />\n        <input value={part.notes}',
  "partner part cost input",
);

if (updated !== source) {
  writeFileSync(path, updated, "utf8");
  console.log("Added AI part-cost baselines and partner price confirmation to mechanical inspections.");
}
