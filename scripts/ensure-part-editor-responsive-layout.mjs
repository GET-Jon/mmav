import { readFileSync, writeFileSync } from "node:fs";

const path = "components/partner/partner-inspection-list.tsx";
let source = readFileSync(path, "utf8");
let updated = source;

function replaceOnce(oldText, newText, label) {
  if (updated.includes(newText)) return;
  if (!updated.includes(oldText)) throw new Error(`Could not find ${label}. Refusing to patch part editor layout automatically.`);
  updated = updated.replace(oldText, newText);
}

replaceOnce(
  'className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(180px,1.2fr)_72px_minmax(120px,0.7fr)_120px_minmax(220px,1.2fr)]"',
  'className="grid min-w-0 gap-2 sm:grid-cols-3"',
  "expanded part fields grid",
);

replaceOnce(
  '<div><input value={part.name}',
  '<div className="min-w-0 sm:col-span-3"><input value={part.name}',
  "part name field span",
);

replaceOnce(
  'placeholder="Qty" className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs"',
  'placeholder="Qty" className="min-w-0 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs"',
  "quantity field width",
);

replaceOnce(
  'placeholder="Part # / ref" className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs"',
  'placeholder="Part # / ref" className="min-w-0 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs"',
  "part reference field width",
);

replaceOnce(
  'placeholder="My cost $" title="Optional: enter your expected unit cost." className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs"',
  'placeholder="My cost $" title="Optional: enter your expected unit cost." className="min-w-0 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs"',
  "cost field width",
);

replaceOnce(
  'placeholder="Sourcing / price note or link" className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs"',
  'placeholder="Sourcing / price note or link" className="min-w-0 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs sm:col-span-3"',
  "source note field span",
);

if (updated !== source) {
  writeFileSync(path, updated, "utf8");
  console.log("Fixed expanded mechanical part editor layout inside suggestion cards.");
}
