import { readFileSync, writeFileSync } from "node:fs";

const path = "components/mindful-inventory/inventory-part-suggestions-v4.tsx";
const source = readFileSync(path, "utf8");
let updated = source;

function replaceOnce(oldText, newText, label) {
  if (updated.includes(newText)) return;
  if (!updated.includes(oldText)) {
    throw new Error(`Could not find ${label}. Refusing to patch parts visibility automatically.`);
  }
  updated = updated.replace(oldText, newText);
}

replaceOnce(
  '  const activeParts = useMemo(() => parts.filter((p) => p.status !== "cancelled"), [parts]);',
  '  // Keep cancelled/not-required parts visible so the sourcing decision remains part of the Work Order record.\n  const activeParts = useMemo(() => parts, [parts]);',
  "active parts filter",
);

replaceOnce(
  '    return resolutionByPartId[part.id] || (part.status === "ordered" || part.status === "backordered" ? "purchased" : null);',
  '    return resolutionByPartId[part.id] || (part.status === "cancelled" ? "not_required" : part.status === "ordered" || part.status === "backordered" ? "purchased" : null);',
  "part resolution fallback",
);

if (updated !== source) {
  writeFileSync(path, updated, "utf8");
  console.log("Kept Not Required parts visible in Active Work parts sourcing.");
}
