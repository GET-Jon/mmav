import { readFileSync, writeFileSync } from "node:fs";

const path = "components/partner/partner-inspection-list.tsx";
let source = readFileSync(path, "utf8");
let changed = false;

const replacements = [
  [
    '<div className="mt-5"><div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">Findings to validate</div><div className="mt-3 space-y-3">',
    '<section className="mt-5 rounded-2xl border border-blue-200 bg-blue-50/30 p-4"><div className="text-xs font-black uppercase tracking-[0.1em] text-blue-600">Findings to validate</div><div className="mt-1 text-sm text-slate-500">Validate Lot Logic observations and document your inspection outcome.</div><div className="mt-3 space-y-3">',
  ],
  [
    '</div></div>\n\n          {item.upgrades.length ? <div className="mt-6"><div className="text-xs font-black uppercase tracking-[0.1em] text-violet-500">Owner-requested upgrades</div>',
    '</div></section>\n\n          {item.upgrades.length ? <section className="mt-5 rounded-2xl border border-violet-200 bg-violet-50/30 p-4"><div className="text-xs font-black uppercase tracking-[0.1em] text-violet-600">Owner-requested upgrades</div>',
  ],
  [
    '</div></div> : null}\n\n          <div className="mt-6 rounded-xl border border-dashed border-slate-300 p-4"><div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">New mechanical finding</div>',
    '</div></section> : null}\n\n          <section className="mt-5 rounded-2xl border border-amber-200 bg-amber-50/30 p-4"><div className="text-xs font-black uppercase tracking-[0.1em] text-amber-700">New mechanical finding</div><div className="mt-1 text-sm text-slate-500">Add anything you discover during the inspection that was not already listed above.</div>',
  ],
  [
    'submitLabel="Add Finding" onSubmit={() => void addFinding(item, fresh)} disabled={working === item.id || !fresh.title.trim()} /></div></div>\n\n          <div className="mt-5">',
    'submitLabel="Add Finding" onSubmit={() => void addFinding(item, fresh)} disabled={working === item.id || !fresh.title.trim()} /></div></section>\n\n          <div className="mt-5">',
  ],
];

for (const [before, after] of replacements) {
  if (source.includes(after)) continue;
  if (!source.includes(before)) throw new Error(`Could not find inspection hierarchy source: ${before.slice(0, 80)}...`);
  source = source.replace(before, after);
  changed = true;
}

if (changed) {
  writeFileSync(path, source, "utf8");
  console.log("Aligned Findings, Owner Upgrades, and New Mechanical Finding as peer inspection sections.");
}
