from pathlib import Path

path = Path('components/evaluation/evaluation-workspace.tsx')
text = path.read_text()

# Import the expansion engine.
old = 'import { VinDecodeCard } from "@/components/evaluation/vin-decode-card";\n'
new = 'import { VinDecodeCard } from "@/components/evaluation/vin-decode-card";\nimport { buildExpansionMarkets } from "@/lib/marketcheck/metro-expansion";\n'
if new not in text:
    if old not in text:
        raise RuntimeError('import marker not found')
    text = text.replace(old, new, 1)

# Add a component-local helper immediately before the editor opener.
marker = '  function openCompMarketEditor() {\n'
helper = '''  function getCompExpansionMarkets() {\n    return buildExpansionMarkets(\n      activeAssumptions.regionalMarkets,\n      marketCheckSearchMeta?.searchedZips || [],\n    );\n  }\n\n'''
if helper not in text:
    if marker not in text:
        raise RuntimeError('openCompMarketEditor marker not found')
    text = text.replace(marker, helper + marker, 1)

# Use the expanded catalog for opening suggestions.
old = '''    const suggested = activeAssumptions.regionalMarkets\n      .filter((market) => market.enabled && /^\\d{5}$/.test(market.zip) && market.market.trim() && !searched.has(market.zip))\n      .sort((a, b) => a.order - b.order)\n      .slice(0, 3)\n      .map((market) => market.zip);'''
new = '''    const suggested = getCompExpansionMarkets()\n      .filter((market) => !searched.has(market.zip))\n      .slice(0, 3)\n      .map((market) => market.zip);'''
if old not in text:
    raise RuntimeError('open editor suggestion block not found')
text = text.replace(old, new, 1)

# Use expanded catalog for repeated suggestions.
old = '''    const available = activeAssumptions.regionalMarkets\n      .filter((market) => market.enabled && /^\\d{5}$/.test(market.zip) && market.market.trim() && !searched.has(market.zip))\n      .sort((a, b) => a.order - b.order);'''
new = '''    const available = getCompExpansionMarkets()\n      .filter((market) => !searched.has(market.zip));'''
if old not in text:
    raise RuntimeError('suggestMoreCompMarkets block not found')
text = text.replace(old, new, 1)

# Let selected generated metros participate in searchSelectedCompMarkets.
old = '''    const configuredRegions = activeAssumptions.regionalMarkets\n      .filter(\n        (market) =>\n          selectedCompMarketZips.includes(market.zip) &&\n          !searched.has(market.zip),\n      )\n      .sort((a, b) => a.order - b.order)\n      .map((market) => ({ ...market, enabled: true }));'''
new = '''    const configuredRegions = getCompExpansionMarkets()\n      .filter(\n        (market) =>\n          selectedCompMarketZips.includes(market.zip) &&\n          !searched.has(market.zip),\n      )\n      .sort((a, b) => a.order - b.order)\n      .map((market) => ({\n        market: market.market,\n        zip: market.zip,\n        order: market.order,\n        enabled: true,\n      }));'''
if old not in text:
    raise RuntimeError('search selected configured block not found')
text = text.replace(old, new, 1)

# Replace the render-time fixed-list checks with expansion catalog checks.
old = 'activeAssumptions.regionalMarkets.filter((market) => market.enabled && /^\\d{5}$/.test(market.zip) && market.market.trim() && !(marketCheckSearchMeta?.searchedZips || []).includes(market.zip)).length <= compSuggestionCount'
new = 'getCompExpansionMarkets().filter((market) => !(marketCheckSearchMeta?.searchedZips || []).includes(market.zip)).length <= compSuggestionCount'
if old not in text:
    raise RuntimeError('suggest button availability expression not found')
text = text.replace(old, new)

text = text.replace('"No More Suggested Markets"', '"All Metro Suggestions Loaded"')

old = '''                  {[...activeAssumptions.regionalMarkets.filter((market) => market.enabled && /^\\d{5}$/.test(market.zip) && market.market.trim()), ...customCompMarkets.map((market, index) => ({ ...market, order: 1000 + index, enabled: true }))]'''
new = '''                  {[...getCompExpansionMarkets(), ...customCompMarkets.map((market, index) => ({ ...market, order: 10000 + index, enabled: true }))]'''
if old not in text:
    raise RuntimeError('market render list not found')
text = text.replace(old, new, 1)

old = '''                      const nextRecommended = !searched && activeAssumptions.regionalMarkets\n                        .filter((candidate) => candidate.enabled && /^\\d{5}$/.test(candidate.zip) && candidate.market.trim() && !(marketCheckSearchMeta?.searchedZips || []).includes(candidate.zip))\n                        .sort((a, b) => a.order - b.order)\n                        .slice(0, compSuggestionCount)\n                        .some((candidate) => candidate.zip === market.zip);'''
new = '''                      const nextRecommended = !searched && getCompExpansionMarkets()\n                        .filter((candidate) => !(marketCheckSearchMeta?.searchedZips || []).includes(candidate.zip))\n                        .slice(0, compSuggestionCount)\n                        .some((candidate) => candidate.zip === market.zip);'''
if old not in text:
    raise RuntimeError('nextRecommended block not found')
text = text.replace(old, new, 1)

old = '''                              {searched ? "Already searched" : nextRecommended ? "Recommended next market" : customCompMarkets.some((item) => item.zip === market.zip) ? "Custom ZIP" : "Available market"}'''
new = '''                              {searched\n                                ? "Already searched"\n                                : nextRecommended\n                                  ? "Recommended next market"\n                                  : customCompMarkets.some((item) => item.zip === market.zip)\n                                    ? "Custom ZIP"\n                                    : activeAssumptions.regionalMarkets.some((item) => item.zip === market.zip)\n                                      ? "Configured market"\n                                      : "Expanded metro market"}'''
if old not in text:
    raise RuntimeError('market status label not found')
text = text.replace(old, new, 1)

# Clarify the geography tab behavior.
old = '''                  Expand where Lot Logic looks, or broaden how specifically it matches this vehicle.'''
new = '''                  Expand where Lot Logic looks, or broaden how specifically it matches this vehicle. Geography suggestions keep widening outward from your starting market.'''
if old not in text:
    raise RuntimeError('modal description not found')
text = text.replace(old, new, 1)

path.write_text(text)
print('Installed outward metro expansion for comp market suggestions')
