from pathlib import Path

path = Path('components/evaluation/evaluation-workspace.tsx')
text = path.read_text()

old = '''                <div className="flex-1 space-y-2 overflow-y-auto px-6 py-5">
                  {[...getCompExpansionMarkets(), ...customCompMarkets.map((market, index) => ({ ...market, order: 10000 + index, enabled: true }))]
                    .sort((a, b) => a.order - b.order)
                    .map((market) => {'''

new = '''                <div className="flex-1 space-y-2 overflow-y-auto px-6 py-5">
                  {[
                    ...getCompExpansionMarkets().filter((market) => {
                      const searchedZips = marketCheckSearchMeta?.searchedZips || [];
                      if (searchedZips.includes(market.zip)) return true;

                      return getCompExpansionMarkets()
                        .filter((candidate) => !searchedZips.includes(candidate.zip))
                        .slice(0, compSuggestionCount)
                        .some((candidate) => candidate.zip === market.zip);
                    }),
                    ...customCompMarkets.map((market, index) => ({ ...market, order: 10000 + index, enabled: true })),
                  ]
                    .sort((a, b) => a.order - b.order)
                    .map((market) => {'''

if old not in text:
    raise RuntimeError('Could not find comp market render list')

text = text.replace(old, new, 1)
path.write_text(text)
print('Limited comp geography list to searched + progressively revealed markets')
