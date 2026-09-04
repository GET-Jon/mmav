import { readFileSync, writeFileSync } from "node:fs";

const path = "components/mindful-inventory/inventory-mechanical-inspection.tsx";
let source = readFileSync(path, "utf8");

function replaceOnce(oldText, newText, label) {
  if (source.includes(newText)) return;
  if (!source.includes(oldText)) {
    throw new Error(`Could not find expected ${label} source. Refusing to patch automatically.`);
  }
  source = source.replace(oldText, newText);
}

replaceOnce(
`          <div className="flex flex-col gap-2 border-b border-slate-100 pb-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">Mechanical Inspection</div>
              <h2 className="mt-1 text-xl font-black text-slate-950">Scope Validation</h2>
              <p className="mt-1 max-w-2xl text-sm text-slate-500">Confirm the preliminary issues and requested upgrades before the Work Plan is built.</p>
            </div>
            <span className={\`rounded-full px-3 py-1.5 text-xs font-black \${reconciliation.pending > 0 ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}\`}>
              {reconciliation.pending > 0 ? \`${reconciliation.pending} needs review\` : "Scope validated"}
            </span>
          </div>`,
`          <div className="border-b border-slate-100 pb-3">
            <h2 className="text-xl font-black text-slate-950">Scope Validation</h2>
          </div>`,
"Scope Validation header",
);

replaceOnce(
`          <div className="mt-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-black text-slate-950">Known Issues</h3>
                <p className="mt-1 text-sm text-slate-500">Confirm whether each Lot Logic issue is actually present.</p>
              </div>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-600">{aiFindings.length}</span>
            </div>`,
`          <div className="mt-4">`,
"Known Issues heading",
);

writeFileSync(path, source, "utf8");
console.log("Simplified Mechanical Inspection page hierarchy.");
