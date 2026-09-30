import { readFileSync, writeFileSync } from "node:fs";

const path = "components/partner/partner-inspection-list.tsx";
let source = readFileSync(path, "utf8");
let changed = false;

const oldField = 'placeholder="Labor price $" className="rounded-xl border border-slate-200 px-3 py-2 text-sm"';
const newField = 'placeholder="Total labor $" title="Total labor charge for this job, not an hourly rate." aria-label="Total labor charge" className="rounded-xl border border-slate-200 px-3 py-2 text-sm"';

if (!source.includes(newField)) {
  if (!source.includes(oldField)) {
    throw new Error("Could not find inspector labor-price field. Refusing to patch labor semantics automatically.");
  }
  source = source.replaceAll(oldField, newField);
  changed = true;
}

const oldRow = '<div className="grid grid-cols-2 gap-2"><input inputMode="decimal" value={draft.laborHours} onChange={(e) => onChange({ ...draft, laborHours: e.target.value })} placeholder="Labor hours" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" /><input inputMode="decimal" value={draft.proposedLaborPrice} onChange={(e) => onChange({ ...draft, proposedLaborPrice: e.target.value })} placeholder="Total labor $" title="Total labor charge for this job, not an hourly rate." aria-label="Total labor charge" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" /></div>';
const newRow = `${oldRow}<div className="col-span-2 -mt-1 text-[11px] font-semibold text-slate-500">Total labor is the full labor charge for this job, not an hourly rate.</div>`;

if (!source.includes('Total labor is the full labor charge for this job, not an hourly rate.')) {
  if (!source.includes(oldRow)) {
    throw new Error("Could not find inspector labor-hours/total row. Refusing to add labor helper text automatically.");
  }
  source = source.replace(oldRow, newRow);
  changed = true;
}

if (changed) {
  writeFileSync(path, source, "utf8");
  console.log("Clarified total labor pricing semantics for mechanical inspectors.");
}
