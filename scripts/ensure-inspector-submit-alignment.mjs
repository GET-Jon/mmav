import { readFileSync, writeFileSync } from "node:fs";

const path = "components/partner/partner-inspection-list.tsx";
let source = readFileSync(path, "utf8");

// Current V15 inspection UX intentionally shows parts readiness only when there is
// an unresolved parts decision. Do not reintroduce the legacy always-visible
// readiness row or fail the build because that older markup no longer exists.
const currentInspectionUx =
  source.includes("!partsReady && partsReadyMessage") ||
  source.includes("inspection-finding-") ||
  source.includes("INSPECTOR RESULT");

const oldBlock = `</select>\n    <div>\n      <div className={\`mb-2 text-xs font-black \${partsReady ? "text-emerald-700" : "text-amber-700"}\`}>{partsReadyMessage}</div>\n      <button type="button"`;
const newBlock = `</select>\n    <div className={\`sm:col-span-2 rounded-lg px-3 py-2 text-xs font-black \${partsReady ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}\`}>{partsReadyMessage}</div>\n    <div className="flex items-stretch">\n      <button type="button"`;

if (currentInspectionUx) {
  console.log("Current inspector submit UX detected; legacy alignment patch skipped.");
} else if (source.includes(newBlock)) {
  console.log("Inspector submit controls already aligned.");
} else if (source.includes(oldBlock)) {
  source = source.replace(oldBlock, newBlock);
  source = source.replace('className="w-full rounded-xl bg-slate-950 px-4 py-2 text-sm font-black text-white disabled:bg-slate-200 disabled:text-slate-400"', 'className="w-full rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white disabled:bg-slate-200 disabled:text-slate-400"');
  writeFileSync(path, source, "utf8");
  console.log("Aligned mechanic readiness message, capability selector, and submit action.");
} else {
  console.log("Legacy inspector submit layout not present; no alignment patch needed.");
}
