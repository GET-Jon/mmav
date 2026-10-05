import fs from "node:fs";
import path from "node:path";

const workspacePath = path.join(process.cwd(), "components/evaluation/evaluation-workspace.tsx");
let source = fs.readFileSync(workspacePath, "utf8");
let changed = false;

function replaceOnce(search, replacement, label) {
  if (source.includes(replacement)) return;
  if (!source.includes(search)) {
    console.warn(`[guided-vehicle-match] ${label} anchor not found; leaving current source unchanged.`);
    return;
  }
  source = source.replace(search, replacement);
  changed = true;
}

replaceOnce(
  `  function openCompMarketEditor() {\n    const searched = new Set(marketCheckSearchMeta?.searchedZips || []);`,
  `  function openCompVehicleMatchEditor() {\n    setCompEditorTab("vehicle");\n    setCompMarketEditorOpen(true);\n  }\n\n  function openCompMarketEditor() {\n    const searched = new Set(marketCheckSearchMeta?.searchedZips || []);`,
  "vehicle-match editor opener",
);

replaceOnce(
  `title: "Review Vehicle Match",\n        reason:\n          compModelMismatchCount > 0\n            ? \`MarketCheck returned inventory, but \${compModelMismatchCount} listing\${compModelMismatchCount === 1 ? "" : "s"} failed model identity checks. Review how this vehicle is classified before widening farther.\`\n            : "MarketCheck is finding inventory, but this vehicle has a known taxonomy fallback. Review the vehicle match before spending calls on more geography.",`,
  `title: "Vehicle match needs confirmation",\n        reason:\n          compModelMismatchCount > 0\n            ? \`We found inventory, but \${compModelMismatchCount} listing\${compModelMismatchCount === 1 ? "" : "s"} did not reliably match the vehicle Lot Logic is evaluating. Confirm the vehicle classification before expanding the search.\`\n            : "We found inventory, but this vehicle uses a MarketCheck taxonomy fallback. Confirm the vehicle classification before expanding the search.",`,
  "vehicle-match guidance copy",
);

replaceOnce(
  `                        ) : (\n                          <button type="button" onClick={openCompMarketEditor} className="rounded-lg bg-blue-700 px-4 py-2 text-xs font-black text-white">Expand / Improve Comps</button>\n                        )}`,
  `                        ) : compNextStep.path === "vehicle-match" ? (\n                          <button type="button" onClick={openCompVehicleMatchEditor} className="rounded-lg bg-blue-700 px-4 py-2 text-xs font-black text-white">Review Vehicle Match →</button>\n                        ) : (\n                          <button type="button" onClick={openCompMarketEditor} className="rounded-lg bg-blue-700 px-4 py-2 text-xs font-black text-white">Expand / Improve Comps</button>\n                        )}`,
  "Market card vehicle-match action",
);

replaceOnce(
  `<button type="button" onClick={() => setCompSectionExpanded(true)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600">More comp details</button>`,
  `<button type="button" onClick={openCompMarketEditor} disabled={marketCheckLoading} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600 hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60">Expand / Improve Comps</button>`,
  "Market card secondary comp action",
);

if (changed) {
  fs.writeFileSync(workspacePath, source);
  console.log("Applied guided vehicle-match recovery updates.");
} else {
  console.log("Guided vehicle-match recovery already present or no compatible anchor required changes.");
}
