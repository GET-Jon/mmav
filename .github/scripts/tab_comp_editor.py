from pathlib import Path

path = Path('components/evaluation/evaluation-workspace.tsx')
text = path.read_text()

# Add tab state.
old = '  const [compMarketEditorOpen, setCompMarketEditorOpen] = useState(false);\n  const [selectedCompMarketZips, setSelectedCompMarketZips] = useState<string[]>([]);'
new = '  const [compMarketEditorOpen, setCompMarketEditorOpen] = useState(false);\n  const [compEditorTab, setCompEditorTab] = useState<"geography" | "vehicle">("geography");\n  const [selectedCompMarketZips, setSelectedCompMarketZips] = useState<string[]>([]);'
if old not in text:
    raise RuntimeError('comp editor state marker not found')
text = text.replace(old, new, 1)

# Tighten the open-editor suggestions to real configured regions only.
start = text.index('  function openCompMarketEditor() {')
end = text.index('\n  function suggestMoreCompMarkets()', start)
block = text[start:end]
block = block.replace(
    '.filter((market) => !searched.has(market.zip))',
    '.filter((market) => market.enabled && /^\\d{5}$/.test(market.zip) && market.market.trim() && !searched.has(market.zip))',
    1,
)
if 'setCompEditorTab("geography");' not in block:
    block = block.replace('    setCompSuggestionCount(3);', '    setCompSuggestionCount(3);\n    setCompEditorTab("geography");', 1)
text = text[:start] + block + text[end:]

# Tighten repeated suggestions to valid configured markets only.
start = text.index('  function suggestMoreCompMarkets() {')
end = text.index('\n  function addCustomCompZip()', start)
block = text[start:end]
block = block.replace(
    '.filter((market) => !searched.has(market.zip))',
    '.filter((market) => market.enabled && /^\\d{5}$/.test(market.zip) && market.market.trim() && !searched.has(market.zip))',
    1,
)
text = text[:start] + block + text[end:]

# Replace the old market-only modal with a two-tab comp editor.
modal_start = text.index('      {compMarketEditorOpen ? (')
modal_end = text.index('      {dealerProfileOpen ? (', modal_start)
new_modal = '''      {compMarketEditorOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 backdrop-blur-sm">
          <div className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
              <div>
                <h2 className="text-[20px] font-extrabold tracking-[-0.025em] text-slate-950">Edit Comps</h2>
                <p className="mt-1 max-w-lg text-sm font-semibold leading-5 text-slate-500">
                  Expand where Lot Logic looks, or broaden how specifically it matches this vehicle.
                </p>
              </div>
              <button type="button" onClick={() => setCompMarketEditorOpen(false)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-black text-slate-500 hover:bg-slate-50">Close</button>
            </div>

            <div className="border-b border-slate-200 px-6">
              <div className="flex gap-6" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={compEditorTab === "geography"}
                  onClick={() => setCompEditorTab("geography")}
                  className={`relative py-3 text-sm font-black ${compEditorTab === "geography" ? "text-blue-700" : "text-slate-400 hover:text-slate-700"}`}
                >
                  Geography
                  <span className={`absolute inset-x-0 bottom-0 h-0.5 ${compEditorTab === "geography" ? "bg-blue-700" : "bg-transparent"}`} />
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={compEditorTab === "vehicle"}
                  onClick={() => setCompEditorTab("vehicle")}
                  className={`relative py-3 text-sm font-black ${compEditorTab === "vehicle" ? "text-blue-700" : "text-slate-400 hover:text-slate-700"}`}
                >
                  Vehicle Match
                  <span className={`absolute inset-x-0 bottom-0 h-0.5 ${compEditorTab === "vehicle" ? "bg-blue-700" : "bg-transparent"}`} />
                </button>
              </div>
            </div>

            {compEditorTab === "geography" ? (
              <>
                <div className="border-b border-slate-100 px-6 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={suggestMoreCompMarkets}
                      disabled={activeAssumptions.regionalMarkets.filter((market) => market.enabled && /^\\d{5}$/.test(market.zip) && market.market.trim() && !(marketCheckSearchMeta?.searchedZips || []).includes(market.zip)).length <= compSuggestionCount}
                      className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-black text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400"
                    >
                      {activeAssumptions.regionalMarkets.filter((market) => market.enabled && /^\\d{5}$/.test(market.zip) && market.market.trim() && !(marketCheckSearchMeta?.searchedZips || []).includes(market.zip)).length <= compSuggestionCount
                        ? "No More Suggested Markets"
                        : "Suggest 3 More Markets"}
                    </button>
                    <div className="flex min-w-[220px] flex-1 items-center gap-2">
                      <input
                        value={customCompZip}
                        onChange={(event) => setCustomCompZip(event.target.value.replace(/\\D/g, "").slice(0, 5))}
                        placeholder="Advanced: add ZIP"
                        inputMode="numeric"
                        className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:border-blue-300"
                      />
                      <button
                        type="button"
                        onClick={addCustomCompZip}
                        disabled={customCompZip.length !== 5}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
                      >
                        Add ZIP
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex-1 space-y-2 overflow-y-auto px-6 py-5">
                  {[...activeAssumptions.regionalMarkets.filter((market) => market.enabled && /^\\d{5}$/.test(market.zip) && market.market.trim()), ...customCompMarkets.map((market, index) => ({ ...market, order: 1000 + index, enabled: true }))]
                    .sort((a, b) => a.order - b.order)
                    .map((market) => {
                      const searched = marketCheckSearchMeta?.searchedZips.includes(market.zip) || false;
                      const selected = searched || selectedCompMarketZips.includes(market.zip);
                      const nextRecommended = !searched && activeAssumptions.regionalMarkets
                        .filter((candidate) => candidate.enabled && /^\\d{5}$/.test(candidate.zip) && candidate.market.trim() && !(marketCheckSearchMeta?.searchedZips || []).includes(candidate.zip))
                        .sort((a, b) => a.order - b.order)
                        .slice(0, compSuggestionCount)
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
                            className="h-4 w-4 accent-blue-700"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-black text-slate-800">{market.market} <span className="text-slate-400">({market.zip})</span></span>
                            <span className="mt-0.5 block text-[10px] font-black uppercase tracking-[0.08em] text-slate-400">
                              {searched ? "Already searched" : nextRecommended ? "Recommended next market" : customCompMarkets.some((item) => item.zip === market.zip) ? "Custom ZIP" : "Available market"}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50 px-6 py-4">
                  <button
                    type="button"
                    onClick={() => { setCompMarketEditorOpen(false); void searchMajorMetropolitanAreas(); }}
                    disabled={marketCheckLoading}
                    className="text-xs font-black text-slate-500 hover:text-blue-700 disabled:text-slate-300"
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
              </>
            ) : (
              <div className="flex-1 overflow-y-auto px-6 py-5">
                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                  <div className="text-[10px] font-black uppercase tracking-[0.09em] text-slate-400">Current vehicle match</div>
                  <div className="mt-1 text-base font-black text-slate-950">
                    {[vehicleYear, vehicleMake, vehicleModel, compTrimRelaxed ? null : vehicleTrim].filter(Boolean).join(" ") || "Vehicle details unavailable"}
                  </div>
                  <p className="mt-2 text-xs font-semibold leading-5 text-slate-500">
                    Lot Logic still uses year, mileage, body/configuration, drivetrain, geography, and relevance checks when ranking the evidence.
                  </p>
                </div>

                {vehicleTrim ? (
                  <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/70 p-5">
                    <div className="text-[10px] font-black uppercase tracking-[0.09em] text-amber-700">Broader model match</div>
                    <div className="mt-1 text-lg font-black text-slate-950">Search as {vehicleMake} {vehicleModel}</div>
                    <p className="mt-2 text-xs font-semibold leading-5 text-slate-600">
                      Remove trim specificity from the comp search. This is useful when the VIN decoder returns a package or trim designation that is narrowing the market too aggressively. Other equivalence and relevance safeguards remain active.
                    </p>
                    {compTrimRelaxed ? (
                      <div className="mt-4 rounded-xl bg-blue-100 px-3 py-2 text-xs font-black text-blue-800">
                        Vehicle match is already broadened to {vehicleMake} {vehicleModel}.
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => { setCompMarketEditorOpen(false); void broadenCompVehicleMatch(); }}
                        disabled={marketCheckLoading}
                        className="mt-4 rounded-xl bg-amber-700 px-4 py-2.5 text-sm font-black text-white hover:bg-amber-800 disabled:bg-slate-300"
                      >
                        Search as {vehicleMake} {vehicleModel}
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="mt-4 rounded-2xl border border-slate-200 p-5">
                    <div className="text-sm font-black text-slate-900">Already using a model-level match</div>
                    <p className="mt-2 text-xs font-semibold leading-5 text-slate-500">
                      There is no trim-level specificity to remove for this vehicle. Use Geography to expand the market instead.
                    </p>
                  </div>
                )}

                <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/50 px-4 py-3 text-xs font-semibold leading-5 text-blue-900/80">
                  Broaden vehicle match changes what qualifies as a comparable; Geography changes where Lot Logic looks. Keeping those choices separate makes it clear which assumption you are changing.
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}

'''
text = text[:modal_start] + new_modal + text[modal_end:]

path.write_text(text)
print('Tabbed comp editor installed; invalid placeholder regions filtered')
