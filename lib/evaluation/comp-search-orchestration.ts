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

  if (evidenceIsUsable) {
    return {
      action: "complete",
      title: "Market evidence is usable",
      reason:
        "Lot Logic has enough qualifying evidence to continue without spending more search calls.",
    };
  }

  if (input.nationalRecommendedMarkets > 0) {
    return {
      action: "discovered-markets",
      title: "Search the markets where matching cars exist",
      reason:
        "National discovery found matching inventory. The highest-value next step is to validate those specific markets with MarketCheck.",
    };
  }

  if (
    input.returnedListings > 0 &&
    input.usableListings === 0 &&
    !input.trimRelaxed &&
    (input.modelMismatchCount > 0 || input.hasTaxonomyFallback)
  ) {
    return {
      action: "broaden-vehicle",
      title: "Broaden retrieval, keep strict qualification",
      reason:
        "Inventory is being returned, but the provider taxonomy is preventing it from qualifying. Lot Logic should broaden retrieval while keeping final vehicle-equivalence safeguards active.",
    };
  }

  if (input.includedCount > 0) {
    if (input.unsearchedExpansionMarkets > 0 && input.regionsSearched < 6) {
      return {
        action: "expand-geography",
        title: "Expand to the next best markets",
        reason:
          "The current comp set is useful but still thin. Search the next nearby markets before escalating to national discovery.",
      };
    }

    if (!input.nationalDiscoveryAttempted) {
      return {
        action: "national-discovery",
        title: "Use national discovery",
        reason:
          "The local and regional evidence is still thin. Locate where matching inventory actually exists before spending more MarketCheck calls.",
      };
    }

    if (input.unsearchedExpansionMarkets > 0) {
      return {
        action: "expand-geography",
        title: "Search additional markets",
        reason:
          "National discovery did not produce a better cluster, so the next useful move is to continue widening geography while preserving strict qualification.",
      };
    }

    return {
      action: "manual-review",
      title: "Review the available evidence",
      reason:
        "Lot Logic has exhausted its high-value automatic search paths. Review the vehicle match or add a specific market only if you have additional information.",
    };
  }

  if (input.returnedListings === 0) {
    if (input.regionsSearched < 3 && input.unsearchedExpansionMarkets > 0) {
      return {
        action: "expand-geography",
        title: "Expand the regional search",
        reason:
          "The search is still shallow. Check the next nearby markets before escalating to a national inventory scan.",
      };
    }

    if (!input.nationalDiscoveryAttempted) {
      return {
        action: "national-discovery",
        title: "Use national discovery",
        reason:
          "Regional MarketCheck searches found no candidate inventory. Locate where matching cars actually exist before spending more MarketCheck calls.",
      };
    }

    if (
      input.nationalDiscoveryTotal === 0 &&
      !input.trimRelaxed &&
      input.hasTaxonomyFallback
    ) {
      return {
        action: "broaden-vehicle",
        title: "Check the broader provider classification",
        reason:
          "Neither regional nor national discovery found the exact provider identity. Broaden retrieval once while keeping final qualification strict.",
      };
    }

    if (input.unsearchedExpansionMarkets > 0) {
      return {
        action: "expand-geography",
        title: "Search additional markets",
        reason:
          "National discovery did not identify a stronger cluster. Continue to the next unsearched markets if you want more evidence.",
      };
    }

    return {
      action: "manual-review",
      title: "Confirm the vehicle identity",
      reason:
        "Exact, normalized, regional, and national search paths did not produce usable evidence. Confirm the vehicle classification before spending more provider calls.",
    };
  }

  if (input.usableListings === 0 && input.unsearchedExpansionMarkets > 0) {
    return {
      action: "expand-geography",
      title: "Look for better-quality matches",
      reason:
        "Inventory exists, but the current listings do not clear Lot Logic's quality and equivalence checks. Search the next markets for stronger matches.",
    };
  }

  if (!input.nationalDiscoveryAttempted) {
    return {
      action: "national-discovery",
      title: "Use national discovery",
      reason:
        "The current evidence is not strong enough. Find where matching inventory is concentrated before making more regional calls.",
    };
  }

  return {
    action: "manual-review",
    title: "Review the available evidence",
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
