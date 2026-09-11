import { readFileSync, writeFileSync } from "node:fs";

const path = "components/mindful-inventory/mechanical-owner-upgrade-review.tsx";
let source = readFileSync(path, "utf8");
let changed = false;

if (source.includes('data-owner-upgrade-review="resolved-row-v1"')) {
  console.log("Owner upgrade review already uses the compact resolved-row presentation.");
  process.exit(0);
}

function replaceOnce(oldText, newText, label) {
  if (source.includes(newText)) return;
  if (!source.includes(oldText)) throw new Error(`Could not find ${label}. Refusing to patch Owner Review visual consistency automatically.`);
  source = source.replace(oldText, newText);
  changed = true;
}

replaceOnce(
  '<section className="rounded-2xl border border-violet-200 bg-white p-5 shadow-sm">',
  '<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">',
  "upgrade review outer card",
);

replaceOnce(
  '<div className="text-xs font-black uppercase tracking-[0.1em] text-violet-500">Requested Upgrades</div>',
  '<div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">Requested Upgrades</div>',
  "upgrade review eyebrow",
);

replaceOnce(
  'return <div key={upgrade.id} className="rounded-xl border border-slate-200 bg-white p-4">',
  'return <div key={upgrade.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">',
  "upgrade review item card",
);

replaceOnce(
  '<div className="font-black text-slate-900">{upgrade.title}</div>',
  '<div className="text-base font-black leading-6 text-slate-950">{upgrade.title}</div>',
  "upgrade title typography",
);

replaceOnce(
  '{upgrade.mechanicalValidationNotes ? <div className="mt-3 text-sm font-semibold text-slate-600"><span className="font-black">Mechanic notes:</span> {upgrade.mechanicalValidationNotes}</div> : null}',
  '{upgrade.mechanicalValidationNotes ? <div className="mt-3 text-xs font-semibold leading-5 text-slate-500"><span className="font-black text-slate-700">Mechanic note:</span> {upgrade.mechanicalValidationNotes}</div> : null}',
  "mechanic note styling",
);

const oldAssessmentStart = '{upgrade.mechanicalValidationStatus !== "pending" ? <div className="mt-3 rounded-xl bg-slate-50 p-3">\n          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">\n            <div><div className="text-[10px] font-black uppercase text-slate-400">Recommended action</div><div className="mt-1 font-semibold text-slate-800">{upgrade.mechanicalRecommendedAction || "—"}</div></div>\n            <div><div className="text-[10px] font-black uppercase text-slate-400">Labor</div><div className="mt-1 font-semibold text-slate-800">{upgrade.mechanicalLaborHours === null ? "—" : `${upgrade.mechanicalLaborHours} hr`}</div></div>\n            <div><div className="text-[10px] font-black uppercase text-slate-400">Proposed labor price</div><div className="mt-1 font-semibold text-slate-800">{money(upgrade.mechanicalProposedLaborPrice)}</div></div>\n            <div><div className="text-[10px] font-black uppercase text-slate-400">Inspector can perform</div><div className={`mt-1 font-black ${needsDifferentPartner ? "text-amber-800" : "text-slate-800"}`}>{upgrade.mechanicalCanPerform === null ? "—" : upgrade.mechanicalCanPerform ? "Yes" : "No — assign another partner"}</div></div>\n          </div>';

const newAssessmentStart = '{upgrade.mechanicalValidationStatus !== "pending" ? <div className="mt-3">\n          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-y border-slate-100 py-3 text-xs font-semibold text-slate-600">\n            <span><span className="text-slate-400">Inspector can perform:</span> <span className={`font-black ${needsDifferentPartner ? "text-amber-800" : "text-slate-800"}`}>{upgrade.mechanicalCanPerform === null ? "—" : upgrade.mechanicalCanPerform ? "Yes" : "No"}</span></span>\n            <span><span className="text-slate-400">Labor:</span> <span className="font-black text-slate-800">{upgrade.mechanicalLaborHours === null ? "—" : `${upgrade.mechanicalLaborHours} hr`}</span></span>\n            <span><span className="text-slate-400">Estimate:</span> <span className="font-black text-slate-800">{money(upgrade.mechanicalProposedLaborPrice)}</span></span>\n            {upgrade.mechanicalRecommendedAction ? <span className="min-w-0 sm:flex-1"><span className="text-slate-400">Recommended:</span> <span className="font-black text-slate-800">{upgrade.mechanicalRecommendedAction}</span></span> : null}\n          </div>';

replaceOnce(oldAssessmentStart, newAssessmentStart, "upgrade assessment facts layout");

if (changed) {
  writeFileSync(path, source, "utf8");
  console.log("Aligned Owner finding and upgrade review visual language.");
} else {
  console.log("Owner Review visual language already aligned.");
}
