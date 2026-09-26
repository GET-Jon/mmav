import {
  canonicalModelFamily,
  canonicalVehicleMake,
  normalizeVehicleText,
} from "./vehicle-identity";

export type DiscoveredMarketCheckModel = {
  item: string;
  count: number;
};

function normalizedModel(value: unknown) {
  return normalizeVehicleText(value);
}

function canonicalFamily({
  make,
  model,
}: {
  make: string;
  model: string;
}) {
  return canonicalModelFamily({
    year: 0,
    make,
    model,
    trim: "",
  });
}

/**
 * Resolves MarketCheck facet model labels that are plausible retrieval pools
 * for the requested vehicle.
 *
 * This intentionally broadens retrieval only. Individual listings are still
 * required to prove the requested model/variant later in the comp pipeline.
 */
export function resolveMarketCheckModelCandidates({
  make,
  requestedModel,
  discoveredModels,
}: {
  make: string;
  requestedModel: string;
  discoveredModels: DiscoveredMarketCheckModel[];
}) {
  const requested = normalizedModel(requestedModel);
  const requestedMake = canonicalVehicleMake(make);
  const requestedFamily = canonicalFamily({
    make: requestedMake,
    model: requestedModel,
  });

  if (!requested || !requestedFamily) return [];

  const candidates = discoveredModels
    .map((candidate) => {
      const normalizedCandidate = normalizedModel(candidate.item);
      const candidateFamily = canonicalFamily({
        make: requestedMake,
        model: candidate.item,
      });

      const exact = normalizedCandidate === requested;
      const lexicalRelationship =
        normalizedCandidate.startsWith(`${requested} `) ||
        requested.startsWith(`${normalizedCandidate} `);
      const sameCanonicalFamily =
        Boolean(candidateFamily) && candidateFamily === requestedFamily;

      if (!exact && !lexicalRelationship && !sameCanonicalFamily) {
        return null;
      }

      return {
        ...candidate,
        exact,
        lexicalRelationship,
        sameCanonicalFamily,
      };
    })
    .filter(
      (
        candidate,
      ): candidate is DiscoveredMarketCheckModel & {
        exact: boolean;
        lexicalRelationship: boolean;
        sameCanonicalFamily: boolean;
      } => Boolean(candidate),
    )
    .sort((a, b) => {
      if (a.exact !== b.exact) return a.exact ? -1 : 1;
      if (a.lexicalRelationship !== b.lexicalRelationship) {
        return a.lexicalRelationship ? -1 : 1;
      }
      return b.count - a.count;
    })
    .map(({ item }) => item);

  return [...new Set(candidates)].slice(0, 5);
}
