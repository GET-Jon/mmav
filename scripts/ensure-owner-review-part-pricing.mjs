import { readFileSync, writeFileSync } from "node:fs";

const dataPath = "lib/mindful-inventory/intake-inspection.ts";
let dataSource = readFileSync(dataPath, "utf8");
let dataUpdated = dataSource;

const oldType = 'export type MechanicalSuggestedPart = { description: string; quantity: number; partNumber: string | null; notes: string | null };';
const newType = 'export type MechanicalSuggestedPart = { description: string; quantity: number; partNumber: string | null; notes: string | null; aiEstimatedUnitPriceLow: number | null; aiEstimatedUnitPriceHigh: number | null; aiPriceBasis: string | null; partnerOfferUnitPrice: number | null };';
if (!dataUpdated.includes(newType)) {
  if (!dataUpdated.includes(oldType)) throw new Error("Could not find MechanicalSuggestedPart type.");
  dataUpdated = dataUpdated.replace(oldType, newType);
}

const oldNormalize = `      partNumber: String(row.partNumber ?? row.part_number ?? "").trim() || null,\n      notes: String(row.notes || "").trim() || null,`;
const newNormalize = `      partNumber: String(row.partNumber ?? row.part_number ?? "").trim() || null,\n      notes: String(row.notes || "").trim() || null,\n      aiEstimatedUnitPriceLow: toNullableNumber(row.aiEstimatedUnitPriceLow ?? row.ai_estimated_unit_price_low as number | string | null | undefined),\n      aiEstimatedUnitPriceHigh: toNullableNumber(row.aiEstimatedUnitPriceHigh ?? row.ai_estimated_unit_price_high as number | string | null | undefined),\n      aiPriceBasis: String(row.aiPriceBasis ?? row.ai_price_basis ?? "").trim() || null,\n      partnerOfferUnitPrice: toNullableNumber(row.partnerOfferUnitPrice ?? row.partner_offer_unit_price as number | string | null | undefined),`;
if (!dataUpdated.includes("partnerOfferUnitPrice: toNullableNumber")) {
  if (!dataUpdated.includes(oldNormalize)) throw new Error("Could not find suggested-part normalization block.");
  dataUpdated = dataUpdated.replace(oldNormalize, newNormalize);
}

if (dataUpdated !== dataSource) {
  writeFileSync(dataPath, dataUpdated, "utf8");
  console.log("Preserved inspector part-price fields for Owner review.");
}

const reviewPath = "components/mindful-inventory/mechanical-owner-finding-review.tsx";
let reviewSource = readFileSync(reviewPath, "utf8");
let reviewUpdated = reviewSource;

const marker = `function sourceLabel(source: string) {\n  return source.toLowerCase() === "ai"\n    ? "AI finding"\n    : source.replaceAll("_", " ");\n}`;
const helper = `${marker}\n\nfunction partPriceLabel(part: InventoryFindingView["mechanicalSuggestedParts"][number]) {\n  if (part.partnerOfferUnitPrice !== null) return { label: "Inspector price", value: money(part.partnerOfferUnitPrice), tone: "text-emerald-700" };\n  if (part.aiEstimatedUnitPriceLow !== null || part.aiEstimatedUnitPriceHigh !== null) {\n    const low = part.aiEstimatedUnitPriceLow;\n    const high = part.aiEstimatedUnitPriceHigh;\n    const value = low !== null && high !== null ? (low === high ? money(low) : money(low) + "–" + money(high)) : money(low ?? high);\n    return { label: "AI estimate", value, tone: "text-blue-700" };\n  }\n  return null;\n}`;
if (!reviewUpdated.includes("function partPriceLabel(")) {
  if (!reviewUpdated.includes(marker)) throw new Error("Could not find owner review sourceLabel helper.");
  reviewUpdated = reviewUpdated.replace(marker, helper);
}

const oldPart = `                <span className="font-black">\n                  {part.quantity}× {part.description}\n                </span>\n                {part.partNumber ? \` · #\${part.partNumber}\` : ""}\n                {part.notes ? \` · \${part.notes}\` : ""}`;
const newPart = `                <span className="font-black">\n                  {part.quantity}× {part.description}\n                </span>\n                {part.partNumber ? \` · #\${part.partNumber}\` : ""}\n                {partPriceLabel(part) ? (\n                  <span className={\`ml-2 font-black \${partPriceLabel(part)?.tone}\`}>\n                    · {partPriceLabel(part)?.label}: {partPriceLabel(part)?.value}\n                  </span>\n                ) : null}\n                {part.notes ? <span className="block mt-1 text-[11px] font-medium text-slate-500">{part.notes}</span> : null}`;
if (!reviewUpdated.includes("partPriceLabel(part)?.label")) {
  if (!reviewUpdated.includes(oldPart)) throw new Error("Could not find Owner review suggested-part rendering.");
  reviewUpdated = reviewUpdated.replace(oldPart, newPart);
}

if (reviewUpdated !== reviewSource) {
  writeFileSync(reviewPath, reviewUpdated, "utf8");
  console.log("Displayed inspector or AI part pricing in Owner review.");
}
