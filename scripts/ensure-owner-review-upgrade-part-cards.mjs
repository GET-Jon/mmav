import { readFileSync, writeFileSync } from "node:fs";

const dataPath = "lib/mindful-inventory/overview-intake.ts";
let dataSource = readFileSync(dataPath, "utf8");
let dataUpdated = dataSource;

const oldType = `export type InventoryUpgradeMechanicalPartSuggestion = {\n  description: string;\n  quantity: number;\n  partNumber: string | null;\n  notes: string | null;\n};`;
const newType = `export type InventoryUpgradeMechanicalPartSuggestion = {\n  description: string;\n  quantity: number;\n  partNumber: string | null;\n  notes: string | null;\n  aiEstimatedUnitPriceLow: number | null;\n  aiEstimatedUnitPriceHigh: number | null;\n  aiPriceBasis: string | null;\n  partnerOfferUnitPrice: number | null;\n};`;
if (!dataUpdated.includes(newType)) {
  if (!dataUpdated.includes(oldType)) throw new Error("Could not find upgrade part suggestion type.");
  dataUpdated = dataUpdated.replace(oldType, newType);
}

const oldNormalize = `      partNumber: String(row.partNumber ?? row.part_number ?? "").trim() || null,\n      notes: String(row.notes || "").trim() || null,`;
const newNormalize = `      partNumber: String(row.partNumber ?? row.part_number ?? "").trim() || null,\n      notes: String(row.notes || "").trim() || null,\n      aiEstimatedUnitPriceLow: toNullableNumber((row.aiEstimatedUnitPriceLow ?? row.ai_estimated_unit_price_low) as number | string | null | undefined),\n      aiEstimatedUnitPriceHigh: toNullableNumber((row.aiEstimatedUnitPriceHigh ?? row.ai_estimated_unit_price_high) as number | string | null | undefined),\n      aiPriceBasis: String(row.aiPriceBasis ?? row.ai_price_basis ?? "").trim() || null,\n      partnerOfferUnitPrice: toNullableNumber((row.partnerOfferUnitPrice ?? row.partner_offer_unit_price) as number | string | null | undefined),`;
if (!dataUpdated.includes("partnerOfferUnitPrice: toNullableNumber")) {
  if (!dataUpdated.includes(oldNormalize)) throw new Error("Could not find upgrade part normalization block.");
  dataUpdated = dataUpdated.replace(oldNormalize, newNormalize);
}

if (dataUpdated !== dataSource) {
  writeFileSync(dataPath, dataUpdated, "utf8");
  console.log("Preserved inspector upgrade-part pricing for Owner review.");
}

const reviewPath = "components/mindful-inventory/mechanical-owner-upgrade-review.tsx";
let source = readFileSync(reviewPath, "utf8");

if (!source.includes("function upgradePartStatus(")) {
  const marker = `function statusTone(value: InventoryUpgradeView["mechanicalValidationStatus"]) {\n  if (value === "feasible") return "bg-emerald-100 text-emerald-800";\n  if (value === "feasible_with_changes") return "bg-blue-100 text-blue-800";\n  if (value === "not_recommended") return "bg-slate-200 text-slate-700";\n  if (value === "needs_info") return "bg-amber-100 text-amber-800";\n  return "bg-violet-100 text-violet-700";\n}`;
  if (!source.includes(marker)) throw new Error("Could not find upgrade review statusTone helper.");
  const helpers = `${marker}\n\nfunction upgradePartStatus(part: InventoryUpgradeView["mechanicalPartSuggestions"][number]) {\n  const notes = part.notes || "";\n  if (notes.startsWith("IN STOCK ·")) return { label: "In stock ✓", tone: "border-emerald-200 bg-emerald-50 text-emerald-800" };\n  if (notes.startsWith("NOT NEEDED ·")) return { label: "Not needed", tone: "border-slate-200 bg-slate-100 text-slate-600" };\n  return { label: "Purchase required", tone: "border-amber-200 bg-amber-50 text-amber-800" };\n}\n\nfunction upgradePartUrl(part: InventoryUpgradeView["mechanicalPartSuggestions"][number]) {\n  const partNumber = part.partNumber?.trim() || "";\n  if (/^https?:\\/\\//i.test(partNumber)) return partNumber;\n  const match = (part.notes || "").match(/https?:\\/\\/[^\\s]+/i);\n  return match?.[0] || null;\n}\n\nfunction upgradePartNote(part: InventoryUpgradeView["mechanicalPartSuggestions"][number]) {\n  let note = (part.notes || "").replace(/^(IN STOCK|NOT NEEDED) · /, "").trim();\n  note = note.replace(/https?:\\/\\/[^\\s]+/gi, "").trim();\n  if (/^Lot Logic search:/i.test(note)) return null;\n  return note || null;\n}\n\nfunction upgradePartPrice(part: InventoryUpgradeView["mechanicalPartSuggestions"][number]) {\n  if (part.partnerOfferUnitPrice !== null) return { value: money(part.partnerOfferUnitPrice), label: "Inspector price", tone: "text-emerald-700" };\n  if (part.aiEstimatedUnitPriceLow !== null || part.aiEstimatedUnitPriceHigh !== null) {\n    const low = part.aiEstimatedUnitPriceLow;\n    const high = part.aiEstimatedUnitPriceHigh;\n    const value = low !== null && high !== null ? (low === high ? money(low) : money(low) + "–" + money(high)) : money(low ?? high);\n    return { value, label: "AI estimate", tone: "text-blue-700" };\n  }\n  return null;\n}`;
  source = source.replace(marker, helpers);
}

const oldParts = `{upgrade.mechanicalPartSuggestions.length ? <div className="mt-3 border-t border-slate-200 pt-3"><div className="text-[10px] font-black uppercase text-slate-400">Suggested parts</div><div className="mt-2 space-y-1.5">{upgrade.mechanicalPartSuggestions.map((part, index) => <div key={\`${'${part.description}'}-${'${index}'}\`} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"><span className="font-black">{part.quantity}× {part.description}</span>{part.partNumber ? \` · Part # ${'${part.partNumber}'}\` : ""}{part.notes ? \` · ${'${part.notes}'}\` : ""}</div>)}</div></div> : null}`;
const newParts = `{upgrade.mechanicalPartSuggestions.length ? <div className="mt-4 border-t border-slate-200 pt-3"><div className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-400">Suggested parts</div><div className="mt-1 text-xs font-semibold text-slate-500">Parts considered by the inspector for this upgrade.</div><div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-3">{upgrade.mechanicalPartSuggestions.map((part, index) => { const partStatus = upgradePartStatus(part); const price = upgradePartPrice(part); const sourceUrl = upgradePartUrl(part); const note = upgradePartNote(part); const partNumber = part.partNumber && !/^https?:\\/\\//i.test(part.partNumber) ? part.partNumber : null; const notNeeded = partStatus.label === "Not needed"; return <div key={\`${'${part.description}'}-${'${index}'}\`} className={\`rounded-xl border p-3 ${'${notNeeded ? "border-slate-200 bg-slate-50/70 opacity-80" : "border-slate-200 bg-white"}'}\`}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="text-sm font-black leading-5 text-slate-950">{part.description}</div><div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-slate-500"><span>Qty {part.quantity}</span>{partNumber ? <span>· #{partNumber}</span> : null}</div></div>{price ? <div className="shrink-0 text-right"><div className={\`text-sm font-black ${'${price.tone}'}\`}>{price.value}</div><div className="mt-0.5 text-[9px] font-black uppercase tracking-[0.06em] text-slate-400">{price.label}</div></div> : <div className="shrink-0 text-sm font-black text-slate-400">TBD</div>}</div><div className="mt-3 flex flex-wrap items-center justify-between gap-2"><span className={\`rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.06em] ${'${partStatus.tone}'}\`}>{partStatus.label}</span>{sourceUrl && !notNeeded ? <a href={sourceUrl} target="_blank" rel="noreferrer" className="text-[11px] font-black text-blue-700 hover:text-blue-900">Source reference ↗</a> : null}</div>{note ? <div className="mt-2 text-[11px] font-semibold leading-4 text-slate-500">{note}</div> : null}</div>; })}</div></div> : null}`;

if (!source.includes("Parts considered by the inspector for this upgrade.")) {
  if (!source.includes(oldParts)) throw new Error("Could not find legacy upgrade suggested-parts rendering.");
  source = source.replace(oldParts, newParts);
}

writeFileSync(reviewPath, source, "utf8");
console.log("Aligned Owner upgrade-review parts with priced, skimmable part cards.");
