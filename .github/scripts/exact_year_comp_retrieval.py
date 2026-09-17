from pathlib import Path

route_path = Path('app/api/marketcheck/search/strict-search.ts')
text = route_path.read_text()

# MarketCheck standard inventory search supports up to 50 rows. Pull a deeper
# candidate pool per region before spending additional API calls.
text = text.replace(
    'const rows = Math.min(toNumber(body.rows, 10), 25);',
    'const rows = Math.min(toNumber(body.rows, 25), 50);',
    1,
)

# Configuration fidelity should dominate modest geographic distance. A looser
# trim nearby should not outrank the requested trim farther away.
old = '''  if (preferredTrim && !trimMatches({ listingTrim, preferredTrim })) {
    score -= 10;
  }

  if (targetMileage && mileage) {
    const mileageDelta = Math.abs(mileage - targetMileage);
    score -= Math.min(24, Math.round(mileageDelta / 2500));
  } else {
    score -= 10;
  }

  if (distance) {
    score -= Math.min(16, Math.round(distance / 10));
  } else {
    score -= 3;
  }'''
new = '''  if (preferredTrim && !trimMatches({ listingTrim, preferredTrim })) {
    // Trim/configuration fidelity is intentionally more important than a
    // moderate distance advantage. Search farther before matching looser.
    score -= 28;
  }

  if (targetMileage && mileage) {
    const mileageDelta = Math.abs(mileage - targetMileage);
    score -= Math.min(22, Math.round(mileageDelta / 3000));
  } else {
    score -= 10;
  }

  if (distance) {
    // Geography matters, but it should not overpower an exact configuration.
    score -= Math.min(8, Math.round(distance / 30));
  } else {
    score -= 2;
  }'''
if old not in text:
    raise RuntimeError('quality score weighting block not found')
text = text.replace(old, new, 1)

old = '''    const exactSearches = await runProgressiveRegionSearches({
      attemptName: taxonomyRetrieval
        ? `taxonomy-retrieval-${model}-via-${taxonomyRetrieval.fallbackModel}`
        : aliasRetrievalModel
          ? `model-alias-${model}-via-${aliasRetrievalModel}`
          : generationCompRule
            ? `generation-aware-make-model-${generationCompRule.generation}`
            : "exact-year-make-model",
      attemptYear: generationCompRule ? undefined : year,
      attemptModel: retrievalModel,
      attemptRows:
        taxonomyRetrieval || aliasRetrievalModel
          ? 25
          : undefined,
    });'''
new = '''    const exactSearches = await runProgressiveRegionSearches({
      attemptName: taxonomyRetrieval
        ? `exact-year-taxonomy-${model}-via-${taxonomyRetrieval.fallbackModel}`
        : aliasRetrievalModel
          ? `exact-year-model-alias-${model}-via-${aliasRetrievalModel}`
          : "exact-year-make-model",
      // Always retrieve the requested model year first. Generation rules remain
      // a qualification safeguard, but no longer cause older-generation cars
      // to fill the first MarketCheck result page.
      attemptYear: year,
      attemptModel: retrievalModel,
      attemptRows: 50,
    });'''
if old not in text:
    raise RuntimeError('exact search block not found')
text = text.replace(old, new, 1)

# The prior fallback intentionally omitted year for some searches. With the new
# strategy, do not silently widen year inside the same search action. Geography
# is expanded first; vehicle/year relaxation should be explicit and observable.
old = '''    // Do not broaden vehicle identity when the primary search returns no results.
    // For vehicles without a generation rule, we may still widen the YEAR search
    // while keeping the exact same make/model.
    if (exactSummary.rawCount === 0 && !generationCompRule) {
      const remainingApiCalls = Math.max(
        0,
        apiControls.maxApiCallsPerSearch - searches.length,
      );

      const fallbackSearches =
        remainingApiCalls > 0
          ? await runProgressiveRegionSearches({
              attemptName: "same-model-year-expanded",
              maxApiCallsOverride: remainingApiCalls,
            })
          : [];

      const failedFallbackSearch = fallbackSearches.find(
        (search) => !search.ok,
      );

      if (failedFallbackSearch) {
        return buildFailedMarketCheckResponse({
          failedSearch: failedFallbackSearch,
          searches: [...searches, ...fallbackSearches],
          orderedRegions,
          apiControls,
        });
      }

      searches = [...searches, ...fallbackSearches];
    }
'''
new = '''    // Keep this action exact-year. If evidence remains thin, Lot Logic expands
    // non-overlapping geography first. Broader year/trim matching is a later,
    // explicit recovery step rather than a silent retrieval change.
    void exactSummary;
'''
if old not in text:
    raise RuntimeError('old silent year fallback block not found')
text = text.replace(old, new, 1)

route_path.write_text(text)

workspace_path = Path('components/evaluation/evaluation-workspace.tsx')
workspace = workspace_path.read_text()
workspace = workspace.replace(
    '''      // Pull a broader candidate pool per region before spending another API call.\n      // Lot Logic still qualifies/ranks the returned listings strictly.\n      rows: 25,''',
    '''      // Pull the full standard MarketCheck candidate pool per region before\n      // spending another API call. Lot Logic still qualifies/ranks strictly.\n      rows: 50,''',
    1,
)
workspace_path.write_text(workspace)
print('Applied exact-year-first retrieval, 50-row candidate pools, and trim-first ranking')
