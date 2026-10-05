import fs from "node:fs";
import path from "node:path";

const workspacePath = path.join(process.cwd(), "components/evaluation/evaluation-workspace.tsx");
const valuationPath = path.join(process.cwd(), "lib/valuation.ts");

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) {
    console.warn(`Evaluator refinement already diverged or was applied elsewhere: ${label}`);
    return source;
  }
  return source.replace(before, after);
}

let valuation = fs.readFileSync(valuationPath, "utf8");
valuation = replaceOnce(
  valuation,
  `  if (currentBid <= safeBid) {\n    return "Strong Buy";\n  }\n\n  if (currentBid <= maxSmartBid) {\n    return "Bid If Clean";\n  }\n\n  if (currentBid <= stretchBid) {\n    return "Watch / Stretch Only";\n  }\n\n  return "Pass";`,
  `  // Lot Logic now exposes one acquisition ceiling. Keep the legacy bid fields\n  // in the type for saved-evaluation compatibility, but do not manufacture\n  // separate decision bands from identical thresholds.\n  if (currentBid <= maxSmartBid) {\n    return "Strong Buy";\n  }\n\n  return "Pass";`,
  "single acquisition ceiling decision",
);
fs.writeFileSync(valuationPath, valuation);

let workspace = fs.readFileSync(workspacePath, "utf8");
workspace = replaceOnce(
  workspace,
  `  const suggestedBid =\n    "safeBid" in valuation && typeof valuation.safeBid === "number"\n      ? valuation.safeBid\n      : valuation.maxSmartBid;`,
  `  // Recommended Max Buy is the evaluator's single acquisition ceiling.\n  // safeBid/stretchBid remain in saved payloads only for backwards compatibility.\n  const suggestedBid = valuation.maxSmartBid;`,
  "recommended max buy source",
);

workspace = replaceOnce(
  workspace,
  `  const hasLowCompConfidence =\n    comps.length > 0 &&\n    String(compSummary.confidence || "").toLowerCase() === "low";`,
  `  const normalizedCompConfidence = String(compSummary.confidence || "").toLowerCase();\n  const marketEvidenceStrength: "Strong" | "Moderate" | "Limited" =\n    compSummary.includedCount >= 8 && normalizedCompConfidence === "high"\n      ? "Strong"\n      : compSummary.includedCount >= 4 && normalizedCompConfidence !== "low"\n        ? "Moderate"\n        : "Limited";\n  const hasLimitedMarketEvidence =\n    compSummary.includedCount > 0 && marketEvidenceStrength === "Limited";\n  const hasLowCompConfidence = hasLimitedMarketEvidence;`,
  "market evidence strength",
);

workspace = replaceOnce(
  workspace,
  `      valuation.decision === "Watch / Stretch Only" ||\n      hasLowCompConfidence ||`,
  `      hasLimitedMarketEvidence ||`,
  "review routing without legacy stretch decision",
);

workspace = replaceOnce(
  workspace,
  `    hasLowCompConfidence ? "market evidence is still thin" : null,`,
  `    hasLimitedMarketEvidence ? "market evidence is limited; strengthen the comp set before treating the recommendation as high-confidence" : null,`,
  "limited evidence review reason",
);

workspace = replaceOnce(
  workspace,
  `          : isAboveRecommendedBuy\n          ? "ABOVE TARGET PRICE"\n          : valuation.decision === "Watch / Stretch Only"\n            ? "WATCH CLOSELY"\n            : requiresReview`,
  `          : isAboveRecommendedBuy\n          ? "ABOVE TARGET PRICE"\n          : requiresReview`,
  "remove legacy watch label",
);

workspace = replaceOnce(
  workspace,
  `  const compConfidenceDisplay =\n    comps.length > 0 ? compSummary.confidence : "—";`,
  `  const compConfidenceDisplay =\n    compSummary.includedCount > 0 ? marketEvidenceStrength : "—";`,
  "evidence strength display",
);

workspace = replaceOnce(
  workspace,
  `<div className="mt-1 text-xl font-black text-slate-950">{compSummary.confidence || "—"}</div>`,
  `<div className="mt-1 text-xl font-black text-slate-950">{marketEvidenceStrength}</div>\n                          <div className="mt-0.5 text-[10px] font-bold text-slate-400">Evidence strength</div>`,
  "market card evidence label",
);

workspace = replaceOnce(
  workspace,
  `                      {activeStage === "market" ? (\n                        <>\n                        <div className="mt-3 flex flex-wrap gap-2">`,
  `                      {activeStage === "market" ? (\n                        <>\n                        {hasLimitedMarketEvidence ? (\n                          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">\n                            <div className="text-xs font-black text-amber-900">Recommended next step: {compNextStep.title || "Improve market evidence"}</div>\n                            <div className="mt-1 text-[11px] font-semibold leading-5 text-amber-800">{compNextStep.reason || "Strengthen the comp set before relying heavily on the recommendation."}</div>\n                            <div className="mt-2">\n                              {compNextStep.path === "national-discovery" ? (\n                                <button type="button" onClick={() => void runAutoDevDiscovery()} disabled={autoDevDiscoveryLoading} className="rounded-lg bg-blue-700 px-3 py-2 text-[11px] font-black text-white disabled:bg-slate-300">{autoDevDiscoveryLoading ? "Scanning..." : "Scan National Inventory"}</button>\n                              ) : compNextStep.path === "discovered-markets" ? (\n                                <button type="button" onClick={() => void searchAutoDevRecommendedMarkets()} disabled={marketCheckLoading} className="rounded-lg bg-blue-700 px-3 py-2 text-[11px] font-black text-white disabled:bg-slate-300">Search Recommended Markets</button>\n                              ) : (\n                                <button type="button" onClick={openCompMarketEditor} className="rounded-lg bg-blue-700 px-3 py-2 text-[11px] font-black text-white">{compNextStep.title || "Expand / Improve Comps"}</button>\n                              )}\n                            </div>\n                          </div>\n                        ) : null}\n                        <div className="mt-3 flex flex-wrap gap-2">`,
  "action-oriented limited evidence card",
);

workspace = replaceOnce(
  workspace,
  `    if (compSummary.includedCount > 0 && compSummary.includedCount < 3) {`,
  `    if (compSummary.includedCount > 0 && (compSummary.includedCount < 4 || String(compSummary.confidence || "").toLowerCase() === "low")) {`,
  "next-step routing for limited evidence",
);

const marketHeadingBefore =
  '          ? `${compSummary.includedCount} valuation comp${compSummary.includedCount === 1 ? "" : "s"}`';
const marketHeadingAfter =
  '          ? `${compSummary.includedCount} valuation comp${compSummary.includedCount === 1 ? "" : "s"} · ${marketEvidenceStrength} evidence`';
workspace = replaceOnce(
  workspace,
  marketHeadingBefore,
  marketHeadingAfter,
  "market heading evidence strength",
);

fs.writeFileSync(workspacePath, workspace);
console.log("Evaluator decision/evidence refinement is present.");