import { readFileSync, writeFileSync } from "node:fs";

const path = "components/partner/partner-inspection-list.tsx";
let source = readFileSync(path, "utf8");
let changed = false;

function replaceIfPresent(oldText, newText) {
  if (source.includes(newText)) return;
  if (!source.includes(oldText)) return;
  source = source.replace(oldText, newText);
  changed = true;
}

replaceIfPresent(
  '<div className="mt-5"><div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">Findings to validate</div><div className="mt-3 space-y-3">',
  '<div className="mt-5 rounded-2xl border border-blue-200 bg-blue-50/30 p-4"><div className="text-xs font-black uppercase tracking-[0.1em] text-blue-600">Findings to validate</div><div className="mt-1 text-sm text-slate-500">Validate Lot Logic observations and document your recommendation for each finding.</div><div className="mt-3 space-y-3">',
);

replaceIfPresent(
  '{item.upgrades.length ? <div className="mt-6"><div className="text-xs font-black uppercase tracking-[0.1em] text-violet-500">Owner-requested upgrades</div>',
  '{item.upgrades.length ? <div className="mt-6 rounded-2xl border border-violet-200 bg-violet-50/30 p-4"><div className="text-xs font-black uppercase tracking-[0.1em] text-violet-600">Owner-requested upgrades</div>',
);

replaceIfPresent(
  '<div className="mt-6 rounded-xl border border-dashed border-slate-300 p-4"><div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">New mechanical finding</div>',
  '<div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50/30 p-4"><div className="text-xs font-black uppercase tracking-[0.1em] text-amber-700">New mechanical finding</div><div className="mt-1 text-sm text-slate-500">Add any mechanical issue you discover during this inspection that was not already identified.</div>',
);

if (changed) {
  writeFileSync(path, source, "utf8");
  console.log("Aligned inspector finding, upgrade, and new-finding section hierarchy.");
} else {
  console.log("Inspector section hierarchy already aligned or no matching legacy markup found.");
}
