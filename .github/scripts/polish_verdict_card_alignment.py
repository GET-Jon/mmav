from pathlib import Path

path = Path('components/evaluation/evaluation-workspace.tsx')
text = path.read_text()

old = '''              <div>
                <div className="flex items-center gap-2 whitespace-nowrap">
                  <h2 className="text-base font-black text-slate-950">Lot Logic Verdict</h2>
                  <span className="grid h-4 w-4 place-items-center rounded-full bg-white/70 text-[10px] font-black text-slate-500">i</span>
                </div>

                <div className="mt-3 flex flex-col items-start gap-2">
                  <span className={`inline-flex shrink-0 items-center rounded-full px-3 py-1.5 text-xs font-black ${decisionBadgeTone}`}>
                    {lotLogicIcon}{lotLogicLabel}
                  </span>
                  {hasEvaluationData ? (
                    <span className={`inline-flex shrink-0 items-center rounded-full px-3 py-1.5 text-[10px] font-black ${dealerFitPillTone}`}>
                      Dealer Fit: {dealerFitResult.label} · {dealerFitResult.score}/100
                    </span>
                  ) : null}
                </div>
              </div>'''
new = '''              <div className="flex items-start justify-between gap-3">
                <h2 className="whitespace-nowrap text-base font-black text-slate-950">Lot Logic Verdict</h2>

                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-black ${decisionBadgeTone}`}>
                    {lotLogicIcon}{lotLogicLabel}
                  </span>
                  {hasEvaluationData ? (
                    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[9px] font-black ${dealerFitPillTone}`}>
                      Dealer Fit: {dealerFitResult.label} · {dealerFitResult.score}/100
                    </span>
                  ) : null}
                </div>
              </div>'''
if old not in text:
    raise RuntimeError('Could not find verdict header block')
text = text.replace(old, new, 1)

old = '''                  <div className="mt-1 text-[9px] font-bold leading-4 text-slate-500 sm:text-[10px]">
                    {hasEvaluationData && valuationInput.currentBid > 0
                      ? `${money(valuationInput.currentBid)} bid + ≈ ${money(displayedReconReserve)} recon`
                      : "Bid + recon reserve"}
                  </div>'''
new = '''                  <div className="mt-1 text-[9px] font-bold leading-4 text-slate-500 sm:text-[10px]">
                    {hasEvaluationData && valuationInput.currentBid > 0 ? (
                      <>
                        {money(valuationInput.currentBid)} bid +<br />
                        ≈ {money(displayedReconReserve)} recon
                      </>
                    ) : (
                      <>Bid +<br />recon reserve</>
                    )}
                  </div>'''
if old not in text:
    raise RuntimeError('Could not find all-in support line')
text = text.replace(old, new, 1)

old = '''                  <div className="mt-1 text-[9px] font-bold leading-4 text-slate-500 sm:text-[10px]">
                    Comp-supported sale value
                  </div>'''
new = '''                  <div className="mt-1 text-[9px] font-bold leading-4 text-slate-500 sm:text-[10px]">
                    Comp-supported<br />sale value
                  </div>'''
if old not in text:
    raise RuntimeError('Could not find sale support line')
text = text.replace(old, new, 1)

old = '''                  <div className="mt-1 text-[9px] font-bold leading-4 text-slate-500 sm:text-[10px]">
                    After modeled fees, costs & reserves
                  </div>'''
new = '''                  <div className="mt-1 text-[9px] font-bold leading-4 text-slate-500 sm:text-[10px]">
                    After modeled fees,<br />costs & reserves
                  </div>'''
if old not in text:
    raise RuntimeError('Could not find profit support line')
text = text.replace(old, new, 1)

old = '''                <div className="mt-2 text-center text-[10px] font-semibold text-slate-500">
                  {hasEvaluationData
                    ? "Based on market data, visible costs, condition, and dealer fit."
                    : "Enter vehicle details and run an evaluation to calculate the bid, sale value, and projected profit."}
                </div>'''
new = '''                {!hasEvaluationData ? (
                  <div className="mt-2 text-center text-[10px] font-semibold text-slate-500">
                    Enter vehicle details and run an evaluation to calculate the bid, sale value, and projected profit.
                  </div>
                ) : null}'''
if old not in text:
    raise RuntimeError('Could not find verdict footer helper')
text = text.replace(old, new, 1)

path.write_text(text)
print('Polished verdict header alignment and supporting line breaks')
