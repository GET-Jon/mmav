import { recommendCompSearchAction, type CompSearchOrchestrationInput } from "./comp-search-orchestration";

const base: CompSearchOrchestrationInput = {
  includedCount:11,primaryCompCount:0,confidence:"Low",returnedListings:42,usableListings:20,
  modelMismatchCount:0,qualityBelowThresholdCount:0,generationMismatchCount:0,
  regionsSearched:4,unsearchedExpansionMarkets:3,hasTaxonomyFallback:false,
  trimRelaxed:false,nationalDiscoveryAttempted:false,nationalDiscoveryTotal:0,nationalRecommendedMarkets:0,
};
export function assertCompSearchIntelligenceRegressionCases() {
  const cases: Array<[string,CompSearchOrchestrationInput,string]> = [
    ["11 related listings but zero close peers still warrants national search",base,"national-discovery"],
    ["4 close peers with sufficient confidence can finish",{...base,primaryCompCount:4,confidence:"Medium"},"complete"],
    ["Discovered national markets take precedence over generic expansion",{...base,nationalDiscoveryAttempted:true,nationalRecommendedMarkets:4},"discovered-markets"],
    ["A sparse regional sample still checks nearby markets",{...base,includedCount:2,primaryCompCount:0,regionsSearched:1},"expand-geography"],
  ];
  for (const [name,input,expected] of cases) {
    const actual = recommendCompSearchAction(input).action;
    if (actual !== expected) throw new Error(`${name}: expected ${expected}, got ${actual}`);
  }
  return {passed:cases.length};
}
