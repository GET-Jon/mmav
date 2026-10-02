import fs from "node:fs";
import path from "node:path";

const workspacePath = path.join(process.cwd(), "components/evaluation/evaluation-workspace.tsx");
let source = fs.readFileSync(workspacePath, "utf8");

const openEditorNeedle = `  function openCompMarketEditor() {\n    const searched = new Set(marketCheckSearchMeta?.searchedZips || []);`;
const guidedOpenEditor = `  function openCompVehicleMatchEditor() {\n    setCompEditorTab("vehicle");\n    setCompMarketEditorOpen(true);\n  }\n\n  function openCompMarketEditor() {\n    const searched = new Set(marketCheckSearchMeta?.searchedZips || []);`;

if (!source.includes("function openCompVehicleMatchEditor()")) {
  if (!source.includes(openEditorNeedle)) {
    throw new Error("Could not find comp editor opener for guided vehicle-match action.");
  }
  source = source.replace(openEditorNeedle, guidedOpenEditor);
}

const genericActions = `                      <div className="mt-3 flex flex-wrap gap-2">\n                        <button\n                          type="button"\n                          onClick={openCompMarketEditor}\n                          className="rounded-lg bg-blue-700 px-4 py-2 text-xs font-black text-white shadow-sm hover:bg-blue-800"\n                        >\n                          Expand / Improve Comps\n                        </button>\n                        <button\n                          type="button"\n                          onClick={() => setCompDetailsOpen(true)}\n                          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-600 hover:bg-slate-50"\n                        >\n                          More comp details\n                        </button>\n                      </div>`;

const guidedActions = `                      <div className="mt-3 flex flex-wrap gap-2">\n                        {compNextStep.path === "vehicle-match" ? (\n                          <button\n                            type="button"\n                            onClick={openCompVehicleMatchEditor}\n                            className="rounded-lg bg-blue-700 px-4 py-2 text-xs font-black text-white shadow-sm hover:bg-blue-800"\n                          >\n                            Review Vehicle Match →\n                          </button>\n                        ) : (\n                          <button\n                            type="button"\n                            onClick={openCompMarketEditor}\n                            className="rounded-lg bg-blue-700 px-4 py-2 text-xs font-black text-white shadow-sm hover:bg-blue-800"\n                          >\n                            {compNextStep.title || "Expand / Improve Comps"}\n                          </button>\n                        )}\n                        <button\n                          type="button"\n                          onClick={() => setCompDetailsOpen(true)}\n                          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-600 hover:bg-slate-50"\n                        >\n                          More comp details\n                        </button>\n                      </div>`;

if (!source.includes("Review Vehicle Match →")) {
  if (!source.includes(genericActions)) {
    throw new Error("Could not find Market card comp actions for guided vehicle-match action.");
  }
  source = source.replace(genericActions, guidedActions);
}

source = source.replace(
  `title: "Review Vehicle Match",\n        reason:\n          compModelMismatchCount > 0\n            ? \`MarketCheck returned inventory, but \${compModelMismatchCount} listing\${compModelMismatchCount === 1 ? "" : "s"} failed model identity checks. Review how this vehicle is classified before widening farther.\`\n            : "MarketCheck is finding inventory, but this vehicle has a known taxonomy fallback. Review the vehicle match before spending calls on more geography.",`,
  `title: "Vehicle match needs confirmation",\n        reason:\n          compModelMismatchCount > 0\n            ? \`We found inventory, but \${compModelMismatchCount} listing\${compModelMismatchCount === 1 ? "" : "s"} did not reliably match the vehicle Lot Logic is evaluating. Confirm the vehicle classification before expanding the search.\`\n            : "We found inventory, but this vehicle uses a MarketCheck taxonomy fallback. Confirm the vehicle classification before expanding the search.",`,
);

fs.writeFileSync(workspacePath, source);
console.log("Guided vehicle-match recovery is present.");