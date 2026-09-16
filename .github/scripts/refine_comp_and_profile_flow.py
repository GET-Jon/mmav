from pathlib import Path
import re

path = Path('components/evaluation/evaluation-workspace.tsx')
text = path.read_text()

# 1) Run Evaluation should always perform the first-level comp search.
text = text.replace(
'''                    setMarketCheckStatus("Vehicle ready. Use Find Comps when you are ready to search the market.");
                    return;''',
'''                    await pullMarketCheckComps(manualOverride);
                    return;'''
)
text = text.replace(
'''                  setMarketCheckStatus("Vehicle ready. Use Find Comps when you are ready to search the market.");''',
'''                  await pullMarketCheckComps(newlyDecodedVehicle);'''
)

# 2) Add state for comp-market editing and dealer profile.
state_anchor = '  const [bidLogicOpen, setBidLogicOpen] = useState(false);\n'
if state_anchor not in text:
    raise RuntimeError('Could not find bid logic state anchor')
text = text.replace(state_anchor, state_anchor + '''  const [compMarketEditorOpen, setCompMarketEditorOpen] = useState(false);
  const [selectedCompMarketZips, setSelectedCompMarketZips] = useState<string[]>([]);
  const [dealerProfileOpen, setDealerProfileOpen] = useState(false);
''')

# 3) Add helpers for Edit Comps.
func_anchor = '  async function expandMarketCheckSearch() {\n'
if func_anchor not in text:
    raise RuntimeError('Could not find comp expansion function anchor')
helpers = '''  function openCompMarketEditor() {
    const searched = new Set(marketCheckSearchMeta?.searchedZips || []);
    const suggested = activeAssumptions.regionalMarkets
      .filter((market) => market.enabled && !searched.has(market.zip))
      .sort((a, b) => a.order - b.order)
      .slice(0, 3)
      .map((market) => market.zip);

    setSelectedCompMarketZips(suggested);
    setCompMarketEditorOpen(true);
  }

  async function searchSelectedCompMarkets() {
    const searched = new Set(marketCheckSearchMeta?.searchedZips || []);
    const regions = activeAssumptions.regionalMarkets
      .filter(
        (market) =>
          market.enabled &&
          selectedCompMarketZips.includes(market.zip) &&
          !searched.has(market.zip),
      )
      .sort((a, b) => a.order - b.order)
      .map((market) => ({ market: market.market, zip: market.zip }));

    if (!regions.length) {
      setMarketCheckStatus('Choose at least one new market to search.');
      return;
    }

    setCompMarketEditorOpen(false);
    await pullMarketCheckComps(null, {
      searchStage: 'expanded',
      regions,
      mergeResults: true,
    });
  }

'''
text = text.replace(func_anchor, helpers + func_anchor)

# 4) Replace Find/Refresh Comps with Edit Comps.
old_comp_button = '''                  <button
                    type="button"
                    onClick={() => void pullMarketCheckComps()}
                    disabled={!hasEvaluationData || marketCheckLoading}
                    className="rounded-lg bg-blue-700 px-3.5 py-2 text-xs font-black text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    {marketCheckLoading ? "Finding Comps..." : comps.length ? "Refresh Comps" : "Find Comps"}
                  </button>
'''
new_comp_button = '''                  <button
                    type="button"
                    onClick={openCompMarketEditor}
                    disabled={!hasEvaluationData || marketCheckLoading}
                    className="rounded-lg bg-blue-700 px-3.5 py-2 text-xs font-black text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    {marketCheckLoading ? "Finding Comps..." : "Edit Comps"}
                  </button>
'''
if old_comp_button not in text:
    raise RuntimeError('Could not find comp action button')
text = text.replace(old_comp_button, new_comp_button)

# Remove the old inline nearby/major-market expansion controls. Edit Comps owns this now.
pattern = re.compile(r'''\n\s*\{marketCheckSearchMeta &&\n\s*compSummary\.includedCount < 6 &&\n\s*marketCheckSearchMeta\.searchStage !== "metro" &&\n\s*!marketCheckLoading \? \(.*?\n\s*\) : null\}\n''', re.S)
text, count = pattern.subn('\n', text, count=1)
if count != 1:
    raise RuntimeError(f'Expected to remove one inline comp expansion block, removed {count}')

# 5) Replace dead score-details action with Dealer Profile & Preferences.
old_score_button = '''              <button
                type="button"
                onClick={() => setBidLogicOpen(true)}
                disabled={!hasEvaluationData}
                className="mx-auto mt-4 block text-xs font-extrabold text-blue-700 hover:text-blue-900 disabled:cursor-not-allowed disabled:text-slate-400"
              >
                See how these scores are built →
              </button>'''
new_score_button = '''              <button
                type="button"
                onClick={() => setDealerProfileOpen(true)}
                disabled={!hasEvaluationData}
                className="mx-auto mt-4 block text-xs font-extrabold text-blue-700 hover:text-blue-900 disabled:cursor-not-allowed disabled:text-slate-400"
              >
                Dealer Profile & Preferences →
              </button>'''
if old_score_button not in text:
    raise RuntimeError('Could not find score details button')
text = text.replace(old_score_button, new_score_button)

# 6) Insert modal surfaces before legacy bid-logic modal.
modal_anchor = '      {bidLogicOpen ? (\n'
if modal_anchor not in text:
    raise RuntimeError('Could not find modal insertion anchor')
modals = r'''      {compMarketEditorOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 backdrop-blur-sm">
          <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
              <div>
                <h2 className="text-[20px] font-extrabold tracking-[-0.025em] text-slate-950">Edit Comp Markets</h2>
                <p className="mt-1 max-w-md text-sm font-semibold leading-5 text-slate-500">
                  Lot Logic keeps markets already searched and preselects the next three configured regions. Add or remove markets before searching again.
                </p>
              </div>
              <button type="button" onClick={() => setCompMarketEditorOpen(false)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-black text-slate-500 hover:bg-slate-50">Close</button>
            </div>

            <div className="max-h-[430px] space-y-2 overflow-y-auto px-6 py-5">
              {activeAssumptions.regionalMarkets
                .filter((market) => market.enabled)
                .sort((a, b) => a.order - b.order)
                .map((market) => {
                  const searched = marketCheckSearchMeta?.searchedZips.includes(market.zip) || false;
                  const selected = searched || selectedCompMarketZips.includes(market.zip);
                  const nextRecommended = !searched && activeAssumptions.regionalMarkets
                    .filter((candidate) => candidate.enabled && !(marketCheckSearchMeta?.searchedZips || []).includes(candidate.zip))
                    .sort((a, b) => a.order - b.order)
                    .slice(0, 3)
                    .some((candidate) => candidate.zip === market.zip);

                  return (
                    <label key={market.zip} className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${selected ? "border-blue-200 bg-blue-50/60" : "border-slate-200 bg-white"} ${searched ? "cursor-default" : "cursor-pointer"}`}>
                      <input
                        type="checkbox"
                        checked={selected}
                        disabled={searched}
                        onChange={(event) => {
                          setSelectedCompMarketZips((current) =>
                            event.target.checked
                              ? Array.from(new Set([...current, market.zip]))
                              : current.filter((zip) => zip !== market.zip),
                          );
                        }}
                        className="h-4 w-4 rounded border-slate-300 accent-blue-700"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-black text-slate-900">{market.market} <span className="font-semibold text-slate-400">({market.zip})</span></div>
                        <div className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">
                          {searched ? "Already searched" : nextRecommended ? "Recommended next market" : "Available market"}
                        </div>
                      </div>
                    </label>
                  );
                })}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/70 px-6 py-4">
              <button
                type="button"
                onClick={() => {
                  setCompMarketEditorOpen(false);
                  void searchMajorMetropolitanAreas();
                }}
                className="text-xs font-extrabold text-slate-500 hover:text-slate-800"
              >
                Search major reference markets instead
              </button>
              <button
                type="button"
                onClick={() => void searchSelectedCompMarkets()}
                disabled={!selectedCompMarketZips.length || marketCheckLoading}
                className="rounded-xl bg-blue-700 px-5 py-2.5 text-sm font-black text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                Search Selected Markets
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {dealerProfileOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 backdrop-blur-sm">
          <div className="w-full max-w-3xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.1em] text-blue-600">Dealer intelligence</div>
                <h2 className="mt-1 text-[20px] font-extrabold tracking-[-0.025em] text-slate-950">Dealer Profile & Preferences</h2>
                <p className="mt-1 max-w-2xl text-sm font-semibold leading-5 text-slate-500">
                  This is the context Lot Logic uses to judge whether a vehicle fits your dealership. Deal economics still drive the overall verdict.
                </p>
              </div>
              <button type="button" onClick={() => setDealerProfileOpen(false)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-black text-slate-500 hover:bg-slate-50">Close</button>
            </div>

            <div className="grid gap-5 px-6 py-5 md:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">Current fit model</div>
                    <div className="mt-1 text-lg font-black text-slate-950">{dealerFitResult.label}</div>
                  </div>
                  <div className="rounded-full bg-white px-3 py-1.5 text-sm font-black text-blue-700 shadow-sm">{dealerFitResult.score}/100</div>
                </div>
                <div className="mt-4 text-xs font-black uppercase tracking-[0.08em] text-emerald-700">Signals helping fit</div>
                <ul className="mt-2 space-y-2">
                  {(dealerFitResult.reasons.length ? dealerFitResult.reasons : ["No strong dealership-specific fit signal has been established yet."]).slice(0, 5).map((reason) => (
                    <li key={reason} className="flex gap-2 text-xs font-semibold leading-5 text-slate-700"><span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />{reason}</li>
                  ))}
                </ul>
                {dealerFitResult.cautions.length ? (
                  <>
                    <div className="mt-4 text-xs font-black uppercase tracking-[0.08em] text-amber-700">Fit cautions</div>
                    <ul className="mt-2 space-y-2">
                      {dealerFitResult.cautions.slice(0, 4).map((caution) => (
                        <li key={caution} className="flex gap-2 text-xs font-semibold leading-5 text-slate-700"><span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />{caution}</li>
                      ))}
                    </ul>
                  </>
                ) : null}
              </div>

              <div className="space-y-3">
                <div className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-black text-slate-900">Dealership website intelligence</div>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.08em] text-slate-500">Next onboarding step</span>
                  </div>
                  <p className="mt-2 text-xs font-semibold leading-5 text-slate-500">Lot Logic will use the dealership URL to infer inventory mix, price bands, vehicle types, age/mileage patterns, and positioning, then let the dealer confirm or correct the profile.</p>
                </div>

                <div className="rounded-2xl border border-slate-200 p-4">
                  <div className="text-sm font-black text-slate-900">Your acquisition preferences</div>
                  <p className="mt-2 text-xs font-semibold leading-5 text-slate-500">This will be where dealers add preferred makes, body styles, price bands, mileage/age targets, target gross, and categories they avoid.</p>
                </div>

                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 p-4">
                  <div className="text-sm font-black text-slate-900">Deal spec / buying guide</div>
                  <p className="mt-2 text-xs font-semibold leading-5 text-slate-500">Planned: upload a dealership buying guide or deal-spec document so Lot Logic can incorporate those rules into dealer fit.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

'''
text = text.replace(modal_anchor, modals + modal_anchor)

path.write_text(text)
print('Comp search and dealer profile flow refined')
