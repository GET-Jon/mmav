export type CompSearchAction =
  | "complete"
  | "broaden-vehicle"
  | "expand-geography"
  | "national-discovery"
  | "discovered-markets"
  | "manual-review";

export type CompSearchOrchestrationInput = {
  includedCount: number;
  confidence: string;
  returnedListings: number;
  usableListings: number;
  modelMismatchCount: number;
  qualityBelowThresholdCount: number;
  generationMismatchCount: number;
  regionsSearched: number;
  unsearchedExpansionMarkets: number;
  hasTaxonomyFallback: boolean;
  trimRelaxed: boolean;
  nationalDiscoveryAttempted: boolean;
  nationalDiscoveryTotal: number;
  nationalRecommendedMarkets: number;
};

export type CompSearchRecommendation = {
  action: CompSearchAction;
  title: string;
  reason: string;
};

export type CompSearchReportEntry = {
  id: string;
  source: "MarketCheck" | "Auto.dev";
  strategy: string;
  summary: string;
  details: string[];
  apiCalls: number;
  candidateListings: number;
  usableComps: number;
  regions: string[];
  createdAt: string;
};

function normalizedConfidence(value: string) {
  return String(value || "").trim().toLowerCase();
}

export function recommendCompSearchAction(
  input: CompSearchOrchestrationInput,
): CompSearchRecommendation {
  const confidence = normalizedConfidence(input.confidence);
  const evidenceIsUsable =
    input.includedCount >= 4 && confidence !== "low" && confidence !== "weak";
  const regionalSearchIsMature = input.regionsSearched >= 5;

  if (evidenceIsUsable) {
    return {
      action: "complete",
      title: "Market evidence is usable",
      reason:
        "Lot Logic has enough qualifying evidence to continue without searching farther.",
    };
  }

  // Once national discovery has located inventory, stop guessing at geography.
  // Validate the discovered clusters directly with MarketCheck.
  if (input.nationalRecommendedMarkets > 0) {
    return {
      action: "discovered-markets",
      title: "Verify the strongest national markets",
      reason:
        "Matching inventory was found nationwide. Lot Logic can now verify the best markets with MarketCheck.",
    };
  }

  // If the provider is returning inventory under the wrong model taxonomy,
  // normalize retrieval once before spending calls on more geography.
  if (
    !input.trimRelaxed &&
    (input.modelMismatchCount > 0 || input.hasTaxonomyFallback) &&
    input.usableListings === 0
  ) {
    return {
      action: "broaden-vehicle",
      title: "Improve the vehicle match",
      reason:
        "Lot Logic found possible inventory, but the provider is classifying the vehicle differently. Broaden retrieval once while keeping the final comp rules strict.",
    };
  }

  // Do not blindly walk the country market-by-market. After a meaningful
  // regional sample, national discovery is the higher-information next step.
  if (regionalSearchIsMature && !input.nationalDiscoveryAttempted) {
    return {
      action: "national-discovery",
      title: "Search nationally for matching inventory",
      reason:
        "The regional search is broad enough. Find where matching cars actually exist, then verify those markets instead of guessing at more cities.",
    };
  }

  if (input.includedCount > 0) {
    if (input.unsearchedExpansionMarkets > 0) {
      return {
        action: "expand-geography",
        title: "Check a few more nearby markets",
        reason:
          "The current comp set is useful but still thin. One more regional pass may strengthen it before national discovery.",
      };
    }

    if (!input.nationalDiscoveryAttempted) {
      return {
        action: "national-discovery",
        title: "Search nationally for matching inventory",
        reason:
          "The available regional evidence is still thin. Find where matching inventory is concentrated before searching farther.",
      };
    }

    return {
      action: "manual-review",
      title: "Review the available evidence",
      reason:
        "Lot Logic has exhausted the strongest automatic search paths for this vehicle.",
    };
  }

  if (input.returnedListings === 0) {
    if (input.regionsSearched < 3 && input.unsearchedExpansionMarkets > 0) {
      return {
        action: "expand-geography",
        title: "Widen the regional search",
        reason:
          "The first search was too narrow to draw a conclusion. Check the next nearby markets.",
      };
    }

    if (!input.nationalDiscoveryAttempted) {
      return {
        action: "national-discovery",
        title: "Search nationally for matching inventory",
        reason:
          "Nearby searches found no candidate inventory. Locate matching cars nationwide before spending more MarketCheck calls.",
      };
    }

    return {
      action: "manual-review",
      title: "Confirm the vehicle identity",
      reason:
        "Regional and national searches did not produce usable evidence. Review the vehicle match before searching farther.",
    };
  }

  // Returned inventory that still fails qualification gets one measured
  // geography expansion. After five markets, switch to national discovery.
  if (
    input.usableListings === 0 &&
    input.unsearchedExpansionMarkets > 0 &&
    !regionalSearchIsMature
  ) {
    return {
      action: "expand-geography",
      title: "Look for stronger matches nearby",
      reason:
        "The listings found so far were not close enough to trust. Check the next nearby markets once, then move to national discovery if needed.",
    };
  }

  if (!input.nationalDiscoveryAttempted) {
    return {
      action: "national-discovery",
      title: "Search nationally for matching inventory",
      reason:
        "The regional evidence is not strong enough. Find where matching inventory actually exists before making more regional calls.",
    };
  }

  return {
    action: "manual-review",
    title: "Review the vehicle match",
    reason:
      "Lot Logic has completed the strongest automatic search paths available for this vehicle.",
  };
}

export function describeMarketCheckAttempt(attemptName: string) {
  const value = String(attemptName || "").trim();

  if (!value) return "MarketCheck search";
  if (value.startsWith("vin-match-year-make-model-trim")) {
    return "Exact VIN-based vehicle match";
  }
  if (value.startsWith("vin-match-same-generation")) {
    return "Nearby model years in the same generation";
  }
  if (value.startsWith("exact-year-requested-model")) {
    return "Exact year and model";
  }
  if (value.startsWith("fallback-taxonomy")) {
    return "Normalized provider model classification";
  }
  if (value.startsWith("fallback-model-alias")) {
    return "Provider model alias";
  }
  if (value.startsWith("fallback-model-facet")) {
    return "Provider-discovered model classification";
  }
  if (value.startsWith("same-generation")) {
    return "Nearby model years in the same generation";
  }

  return value.replace(/[-_]+/g, " ");
}
