import { readFileSync, writeFileSync } from "node:fs";

const path = "components/mindful-inventory/inventory-part-suggestions-v4.tsx";
const source = readFileSync(path, "utf8");
let updated = source;

function replaceOnce(oldText, newText, label) {
  if (updated.includes(newText)) return;
  if (!updated.includes(oldText)) throw new Error(`Could not find ${label}. Refusing to patch ETA state colors.`);
  updated = updated.replace(oldText, newText);
}

replaceOnce(
  '    const draft = drafts[args.key] || draftFromPart(args.part);\n    const set = (patch: Partial<Draft>) => setDrafts((current) => ({ ...current, [args.key]: { ...(current[args.key] || draftFromPart(args.part)), ...patch } }));',
  '    const draft = drafts[args.key] || draftFromPart(args.part);\n    const set = (patch: Partial<Draft>) => setDrafts((current) => ({ ...current, [args.key]: { ...(current[args.key] || draftFromPart(args.part)), ...patch } }));\n    const etaMissing = !draft.etaMonthDay.trim() || !draft.etaYear.trim();\n    const etaDelayed = args.part?.status === "backordered";\n    const etaSaved = Boolean(args.part?.etaAt) && !etaDelayed;\n    const etaLabelClass = etaDelayed || etaMissing ? "text-amber-700" : etaSaved ? "text-emerald-700" : "text-slate-400";\n    const etaInputClass = etaDelayed || etaMissing ? "border-amber-200 bg-amber-50/40" : etaSaved ? "border-emerald-200 bg-emerald-50/30" : "border-slate-200 bg-white";',
  "ETA state computation",
);

replaceOnce(
  '<label className="grid gap-1"><span className="text-[9px] font-black uppercase tracking-[0.08em] text-amber-700">{args.part?.status === "backordered" ? "Revised Expected Arrival" : "Expected Arrival"}</span><div className="grid grid-cols-[1fr_86px] gap-2"><input inputMode="numeric" value={draft.etaMonthDay} onChange={(e) => set({ etaMonthDay: e.target.value })} placeholder="MM/DD" className="rounded-lg border border-amber-200 bg-amber-50/40 px-3 py-2 text-xs" /><input inputMode="numeric" value={draft.etaYear} onChange={(e) => set({ etaYear: e.target.value.replace(/\\D/g, "").slice(0, 4) })} aria-label="Expected arrival year" className="rounded-lg border border-amber-200 bg-amber-50/40 px-3 py-2 text-xs font-bold" /></div></label>',
  '<label className="grid gap-1"><span className={`text-[9px] font-black uppercase tracking-[0.08em] ${etaLabelClass}`}>{args.part?.status === "backordered" ? "Revised Expected Arrival" : "Expected Arrival"}</span><div className="grid grid-cols-[1fr_86px] gap-2"><input inputMode="numeric" value={draft.etaMonthDay} onChange={(e) => set({ etaMonthDay: e.target.value })} placeholder="MM/DD" className={`rounded-lg border px-3 py-2 text-xs ${etaInputClass}`} /><input inputMode="numeric" value={draft.etaYear} onChange={(e) => set({ etaYear: e.target.value.replace(/\\D/g, "").slice(0, 4) })} aria-label="Expected arrival year" className={`rounded-lg border px-3 py-2 text-xs font-bold ${etaInputClass}`} /></div></label>',
  "ETA field styling",
);

if (updated !== source) {
  writeFileSync(path, updated, "utf8");
  console.log("Updated parts ETA colors to reflect missing, delayed, and saved states.");
}
