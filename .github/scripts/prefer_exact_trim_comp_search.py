from pathlib import Path

# --- metro expansion: enforce 100-mile separation from searched markets ---
metro_path = Path('lib/marketcheck/metro-expansion.ts')
metro = metro_path.read_text()

old = '''function findAnchor(configured: RegionalMarket[], searchedZips: string[]) {
  const bySearchedZip = searchedZips
    .map((zip) => metroSeeds.find((seed) => seed.zip === zip))
    .find(Boolean);
  if (bySearchedZip) return bySearchedZip;

  for (const market of configured) {
    const exactZip = metroSeeds.find((seed) => seed.zip === market.zip);
    if (exactZip) return exactZip;

    const normalized = normalizeMarketName(market.market);
    const byName = metroSeeds.find((seed) => {
      const seedName = normalizeMarketName(seed.market);
      const seedCity = seedName.split(" ").slice(0, -1).join(" ");
      return normalized.includes(seedCity) || seedName.includes(normalized);
    });
    if (byName) return byName;
  }

  return metroSeeds[0];
}

export function buildExpansionMarkets(
  configuredMarkets: RegionalMarket[],
  searchedZips: string[] = [],
): ExpansionMarket[] {'''
new = '''function findSeedByMarketLabel(value: string) {
  const normalized = normalizeMarketName(value.replace(/\\(\\d{5}\\)/g, " "));
  if (!normalized) return null;

  return (
    metroSeeds.find((seed) => {
      const seedName = normalizeMarketName(seed.market);
      const seedCity = seedName.split(" ").slice(0, -1).join(" ");
      return normalized.includes(seedName) || normalized.includes(seedCity);
    }) || null
  );
}

function getSearchedSeeds(searchedZips: string[], searchedRegions: string[]) {
  const seeds = [
    ...searchedZips.map((zip) => metroSeeds.find((seed) => seed.zip === zip) || null),
    ...searchedRegions.map((region) => findSeedByMarketLabel(region)),
  ].filter(Boolean) as MetroSeed[];

  return Array.from(new Map(seeds.map((seed) => [seed.zip, seed])).values());
}

function findAnchor(
  configured: RegionalMarket[],
  searchedZips: string[],
  searchedRegions: string[],
) {
  const searchedSeeds = getSearchedSeeds(searchedZips, searchedRegions);
  if (searchedSeeds.length) return searchedSeeds[0];

  for (const market of configured) {
    const exactZip = metroSeeds.find((seed) => seed.zip === market.zip);
    if (exactZip) return exactZip;

    const byName = findSeedByMarketLabel(market.market);
    if (byName) return byName;
  }

  return metroSeeds[0];
}

export function buildExpansionMarkets(
  configuredMarkets: RegionalMarket[],
  searchedZips: string[] = [],
  searchedRegions: string[] = [],
): ExpansionMarket[] {'''
if old not in metro:
    raise RuntimeError('metro findAnchor signature block not found')
metro = metro.replace(old, new, 1)

old = '''  const anchor = findAnchor(configured, searchedZips);
  const configuredZips = new Set(configured.map((market) => market.zip));'''
new = '''  const anchor = findAnchor(configured, searchedZips, searchedRegions);
  const searchedSeeds = getSearchedSeeds(searchedZips, searchedRegions);
  const searchedZipSet = new Set(searchedZips);
  const configuredZips = new Set(configured.map((market) => market.zip));'''
if old not in metro:
    raise RuntimeError('metro anchor block not found')
metro = metro.replace(old, new, 1)

old = '''  const seeded = metroSeeds
    .filter(
      (seed) =>
        !configuredZips.has(seed.zip) &&
        !configuredNames.has(normalizeMarketName(seed.market)),
    )'''
new = '''  const isFarEnoughFromSearched = (seed: MetroSeed) =>
    searchedSeeds.length === 0 ||
    searchedSeeds.every((searchedSeed) => haversineMiles(searchedSeed, seed) >= 100);

  const configuredForExpansion = configured.filter((market) => {
    if (searchedZipSet.has(market.zip)) return true;
    const seed =
      metroSeeds.find((candidate) => candidate.zip === market.zip) ||
      findSeedByMarketLabel(market.market);
    return !seed || isFarEnoughFromSearched(seed);
  });

  const seeded = metroSeeds
    .filter(
      (seed) =>
        !configuredZips.has(seed.zip) &&
        !configuredNames.has(normalizeMarketName(seed.market)) &&
        isFarEnoughFromSearched(seed),
    )'''
if old not in metro:
    raise RuntimeError('metro seeded filter block not found')
metro = metro.replace(old, new, 1)

old = '''    ...configured.map((market) => ({
      ...market,
      source: "configured" as const,
    })),'''
new = '''    ...configuredForExpansion.map((market) => ({
      ...market,
      source: "configured" as const,
    })),'''
if old not in metro:
    raise RuntimeError('configured return block not found')
metro = metro.replace(old, new, 1)
metro_path.write_text(metro)

# --- evaluator: larger candidate pool, actual searched regions, exact-trim-first UX ---
ws_path = Path('components/evaluation/evaluation-workspace.tsx')
ws = ws_path.read_text()

old = '''      rows: 10,'''
new = '''      // Pull a broader candidate pool per region before spending another API call.
      // Lot Logic still qualifies/ranks the returned listings strictly.
      rows: 25,'''
if old not in ws:
    raise RuntimeError('rows 10 marker not found')
ws = ws.replace(old, new, 1)

old = '''    return buildExpansionMarkets(
      activeAssumptions.regionalMarkets,
      marketCheckSearchMeta?.searchedZips || [],
    );'''
new = '''    return buildExpansionMarkets(
      activeAssumptions.regionalMarkets,
      marketCheckSearchMeta?.searchedZips || [],
      marketCheckSearchMeta?.regionsChecked || [],
    );'''
if old not in ws:
    raise RuntimeError('getCompExpansionMarkets call not found')
ws = ws.replace(old, new, 1)

marker = '''  async function broadenCompVehicleMatch() {'''
helper = '''  function getPreviouslySearchedCompRegions() {
    const labels = marketCheckSearchMeta?.regionsChecked || [];
    const searchedZips = marketCheckSearchMeta?.searchedZips || [];

    return searchedZips.map((zip, index) => {
      const label = labels[index] || "";
      const match = label.match(/^(.*)\\s+\\((\\d{5})\\)$/);
      return {
        market: match?.[1]?.trim() || `Previously searched market ${index + 1}`,
        zip,
        order: index + 1,
        enabled: true,
      };
    });
  }

'''
if helper not in ws:
    if marker not in ws:
        raise RuntimeError('broaden marker not found')
    ws = ws.replace(marker, helper + marker, 1)

old = '''    const searched = new Set(marketCheckSearchMeta?.searchedZips || []);
    const regions = activeAssumptions.regionalMarkets
      .filter((market) => searched.has(market.zip))
      .sort((a, b) => a.order - b.order)
      .map((market) => ({ ...market, enabled: true }));'''
new = '''    // When the user deliberately relaxes trim, rerun the geography they actually
    // searched — including generated and custom markets — rather than falling
    // back to the original configured-region list.
    const regions = getPreviouslySearchedCompRegions();'''
if old not in ws:
    raise RuntimeError('broaden regions block not found')
ws = ws.replace(old, new, 1)

# Allow an explicit broaden action to revisit all searched regions (route caps at 10).
old = '''      mergeResults?: boolean;
    },'''
new = '''      mergeResults?: boolean;
      maxApiCallsPerSearch?: number;
    },'''
if old not in ws:
    raise RuntimeError('pull options block not found')
ws = ws.replace(old, new, 1)

old = '''          maxApiCallsPerSearch:
            options?.searchStage === "expanded" ||
            options?.searchStage === "metro"
              ? 3
              : marketCheckApiControls.maxApiCallsPerSearch,'''
new = '''          maxApiCallsPerSearch:
            options?.maxApiCallsPerSearch ??
            (options?.searchStage === "expanded" ||
            options?.searchStage === "metro"
              ? 3
              : marketCheckApiControls.maxApiCallsPerSearch),'''
if old not in ws:
    raise RuntimeError('max api calls body block not found')
ws = ws.replace(old, new, 1)

old = '''        mergeResults: false,
      },'''
new = '''        mergeResults: false,
        maxApiCallsPerSearch: Math.min(10, Math.max(3, regions.length)),
      },'''
# only first occurrence after broaden is expected, ensure localized by split
broaden_pos = ws.find('async function broadenCompVehicleMatch()')
if broaden_pos < 0:
    raise RuntimeError('broaden function not found after helper')
idx = ws.find(old, broaden_pos)
if idx < 0:
    raise RuntimeError('broaden mergeResults block not found')
ws = ws[:idx] + ws[idx:].replace(old, new, 1)

# Improve empty state messaging for completed relaxed search.
old = '''                      {marketCheckSearchMeta
                        ? marketCheckApiUsage?.filterDiagnostics?.returnedListings
                          ? "Listings found, but none qualified as strong comps"
                          : `No strong comps found after searching ${marketCheckSearchMeta.regionsChecked.length} ${marketCheckSearchMeta.regionsChecked.length === 1 ? "region" : "regions"}`
                        : "No comparable vehicles loaded"}'''
new = '''                      {marketCheckSearchMeta
                        ? compTrimRelaxed
                          ? `Broader ${vehicleMake} ${vehicleModel} search completed — no strong comps yet`
                          : marketCheckApiUsage?.filterDiagnostics?.returnedListings
                            ? "Listings found, but none qualified as strong comps"
                            : `No strong comps found after searching ${marketCheckSearchMeta.regionsChecked.length} ${marketCheckSearchMeta.regionsChecked.length === 1 ? "region" : "regions"}`
                        : "No comparable vehicles loaded"}'''
if old not in ws:
    raise RuntimeError('empty state heading block not found')
ws = ws.replace(old, new, 1)

old = '''                      {marketCheckSearchMeta
                        ? marketCheckApiUsage?.filterDiagnostics?.returnedListings
                          ? "Lot Logic found listings, but the current vehicle-match rules did not produce usable evidence. Use Edit Comps to expand geography or broaden the vehicle match below."
                          : `Lot Logic searched ${marketCheckSearchMeta.regionsChecked.join(", ") || "the selected markets"} without finding usable comps. Use Edit Comps above to expand the search.`
                        : "Run the evaluation to search the local market for a usable comp set."}'''
new = '''                      {marketCheckSearchMeta
                        ? compTrimRelaxed
                          ? `Lot Logic reran ${vehicleMake} ${vehicleModel} with trim ignored across ${marketCheckSearchMeta.regionsChecked.join(", ") || "the previously searched markets"}. It reviewed ${marketCheckApiUsage?.filterDiagnostics?.returnedListings || 0} returned listings, but none met the strong-comp criteria. Use Edit Comps to expand geography further or review the match strategy.`
                          : marketCheckApiUsage?.filterDiagnostics?.returnedListings
                            ? "Lot Logic found listings, but the current vehicle-match rules did not produce usable evidence. Keep the exact configuration and expand geography first; broaden Vehicle Match only when exact-trim evidence remains thin."
                            : `Lot Logic searched ${marketCheckSearchMeta.regionsChecked.join(", ") || "the selected markets"} without finding usable comps. Keep the exact configuration and use Edit Comps to expand into additional non-overlapping markets.`
                        : "Run the evaluation to search the local market for a usable comp set."}'''
if old not in ws:
    raise RuntimeError('empty state body block not found')
ws = ws.replace(old, new, 1)

old = '''                      <div className="mt-4 text-xs font-bold text-blue-700">Vehicle match broadened to {vehicleMake} {vehicleModel}; trim is no longer required.</div>'''
new = '''                      <div className="mt-4 text-xs font-bold text-blue-700">✓ Broader vehicle search completed: {vehicleMake} {vehicleModel} (trim ignored).</div>'''
if old not in ws:
    raise RuntimeError('trim relaxed status line not found')
ws = ws.replace(old, new, 1)

# Reframe Vehicle Match tab to prefer farther exact matches before looser local matches.
old = '''                    <div className="text-[10px] font-black uppercase tracking-[0.09em] text-amber-700">Broader model match</div>
                    <div className="mt-1 text-lg font-black text-slate-950">Search as {vehicleMake} {vehicleModel}</div>
                    <p className="mt-2 text-xs font-semibold leading-5 text-slate-600">
                      Remove trim specificity from the comp search. This is useful when the VIN decoder returns a package or trim designation that is narrowing the market too aggressively. Other equivalence and relevance safeguards remain active.
                    </p>'''
new = '''                    <div className="text-[10px] font-black uppercase tracking-[0.09em] text-amber-700">Secondary recovery step</div>
                    <div className="mt-1 text-lg font-black text-slate-950">Search as {vehicleMake} {vehicleModel}</div>
                    <p className="mt-2 text-xs font-semibold leading-5 text-slate-600">
                      Lot Logic prefers an exact-trim comp from a farther non-overlapping market over a looser match nearby. Expand Geography first when practical. Use this option after exact-configuration evidence remains thin; it removes trim specificity while keeping the other equivalence and relevance safeguards active.
                    </p>'''
if old not in ws:
    raise RuntimeError('broader match copy block not found')
ws = ws.replace(old, new, 1)

ws_path.write_text(ws)
print('Applied exact-trim-first comp search strategy and geography safeguards')
