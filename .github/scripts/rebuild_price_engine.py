from pathlib import Path
import re

# --- lib/valuation.ts ---
path = Path('lib/valuation.ts')
text = path.read_text()

anchor = '''function roundToNearest(value: number, increment = 100) {\n  return Math.round(value / increment) * increment;\n}\n'''
insert = '''function roundToNearest(value: number, increment = 100) {\n  return Math.round(value / increment) * increment;\n}\n\nconst AUTO_PROFIT_FLOOR = 2500;\nconst AUTO_PROFIT_RATE = 0.2;\n\nfunction interpolateScore(\n  value: number,\n  points: Array<[number, number]>,\n) {\n  if (value <= points[0][0]) return points[0][1];\n\n  for (let index = 1; index < points.length; index += 1) {\n    const [upperValue, upperScore] = points[index];\n    const [lowerValue, lowerScore] = points[index - 1];\n\n    if (value <= upperValue) {\n      const span = upperValue - lowerValue || 1;\n      const progress = (value - lowerValue) / span;\n      return lowerScore + (upperScore - lowerScore) * progress;\n    }\n  }\n\n  return points[points.length - 1][1];\n}\n\nexport function calculateDealEconomicsScore(\n  expectedGrossProfit: number,\n  allInCost: number,\n) {\n  const absoluteProfitScore = interpolateScore(expectedGrossProfit, [\n    [0, 20],\n    [500, 35],\n    [1000, 48],\n    [1500, 60],\n    [2000, 70],\n    [2500, 77],\n    [3000, 82],\n    [4000, 89],\n    [5000, 95],\n    [6000, 98],\n    [7000, 100],\n  ]);\n\n  const returnOnCapital =\n    allInCost > 0 ? expectedGrossProfit / allInCost : 0;\n  const capitalEfficiencyScore = interpolateScore(returnOnCapital, [\n    [0, 20],\n    [0.05, 40],\n    [0.1, 60],\n    [0.15, 75],\n    [0.2, 88],\n    [0.25, 95],\n    [0.3, 100],\n  ]);\n\n  return Math.max(0, Math.min(100, Math.round(\n    absoluteProfitScore * 0.85 + capitalEfficiencyScore * 0.15,\n  )));\n}\n\nfunction calculatePreReconFixedCosts(input: ValuationInput) {\n  return (\n    input.costs.auctionFee +\n    input.costs.transport +\n    input.costs.detailAdmin +\n    input.costs.generalRiskReserve +\n    input.costs.brandRiskAdd\n  );\n}\n\nexport function calculateDesiredProfitTarget(\n  input: ValuationInput,\n  totalCostAdders = calculateTotalCostAdders(input),\n) {\n  const manualFloor = Math.max(0, input.targetProfit || 0);\n  const preReconFixedCosts = calculatePreReconFixedCosts(input);\n  let desiredProfit = Math.max(AUTO_PROFIT_FLOOR, manualFloor);\n\n  // Solve the 20% target against the recommended acquisition basis itself,\n  // rather than the current live bid. This keeps Max Buy stable as bidding moves.\n  for (let iteration = 0; iteration < 12; iteration += 1) {\n    const impliedMaxBid = Math.max(\n      0,\n      input.targetResaleUsed - totalCostAdders - desiredProfit,\n    );\n    const preReconAcquisitionBasis = impliedMaxBid + preReconFixedCosts;\n    const automaticTarget = Math.max(\n      AUTO_PROFIT_FLOOR,\n      preReconAcquisitionBasis * AUTO_PROFIT_RATE,\n    );\n    const nextDesiredProfit = Math.max(manualFloor, automaticTarget);\n\n    if (Math.abs(nextDesiredProfit - desiredProfit) < 1) {\n      desiredProfit = nextDesiredProfit;\n      break;\n    }\n\n    desiredProfit = nextDesiredProfit;\n  }\n\n  return roundToNearest(desiredProfit);\n}\n'''
if anchor not in text:
    raise RuntimeError('valuation round anchor not found')
text = text.replace(anchor, insert, 1)

old = '''  // Transparent bid ceiling:\n  // selected sale value\n  // minus explicit costs\n  // minus the user's selected target profit.\n  const maxSmartBidRaw =\n    input.targetResaleUsed - input.targetProfit - totalCostAdders;\n\n  const maxSmartBid = roundToNearest(maxSmartBidRaw);'''
new = '''  // Dynamic desired-profit ceiling:\n  // - never less than $2,500\n  // - scales to roughly 20% of the pre-recon acquisition basis\n  // - a user-entered target can raise, but never lower, the system target.\n  const desiredProfitTarget = calculateDesiredProfitTarget(\n    input,\n    totalCostAdders,\n  );\n  const maxSmartBidRaw =\n    input.targetResaleUsed - desiredProfitTarget - totalCostAdders;\n\n  const maxSmartBid = roundToNearest(maxSmartBidRaw);'''
if old not in text:
    raise RuntimeError('old max bid block not found')
text = text.replace(old, new, 1)

old = '''    expectedGrossProfit,\n    maxSmartBid,'''
new = '''    expectedGrossProfit,\n    desiredProfitTarget,\n    maxSmartBid,'''
if old not in text:
    raise RuntimeError('valuation return anchor not found')
text = text.replace(old, new, 1)
path.write_text(text)

# --- types/evaluation.ts ---
path = Path('types/evaluation.ts')
text = path.read_text()
old = '''  expectedGrossProfit: number;\n  maxSmartBid: number;'''
new = '''  expectedGrossProfit: number;\n  desiredProfitTarget: number;\n  maxSmartBid: number;'''
if old not in text:
    raise RuntimeError('valuation output type anchor not found')
path.write_text(text.replace(old, new, 1))

# --- evaluator UI ---
path = Path('components/evaluation/evaluation-workspace.tsx')
text = path.read_text()
text = text.replace(
    'import { calculateValuation } from "@/lib/valuation";',
    'import { calculateDealEconomicsScore, calculateValuation } from "@/lib/valuation";',
    1,
)

pattern = re.compile(
    r'''  const targetProfitForScore = Math\.max\(valuationInput\.targetProfit \|\| 0, 1\);\n'''
    r'''  const profitRatio = valuation\.expectedGrossProfit / targetProfitForScore;\n\n'''
    r'''  const profitabilityScore =\n'''
    r'''(?:.|\n)*?'''
    r'''(?=\n  const )''',
    re.MULTILINE,
)
match = pattern.search(text)
if not match:
    raise RuntimeError('profitability score block not found')
replacement = '''  const profitabilityScore = calculateDealEconomicsScore(\n    valuation.expectedGrossProfit,\n    valuation.allInCost,\n  );\n'''
text = text[:match.start()] + replacement + text[match.end():]

# Rename manual target to clarify that automatic target is the default engine.
text = text.replace('<FormRow label="Target Profit">', '<FormRow label="Profit Target Override">', 1)

# Add helper copy below the target override input by patching the first targetProfit input block.
needle = '''                    onChange={(event) =>\n                      updateEvaluationField(\n                        "targetProfit",\n                        toNumber(event.target.value),'''
if needle not in text:
    raise RuntimeError('target profit input change anchor not found')
# Add helper after the enclosing input by targeted regex around this FormRow.
form_pattern = re.compile(
    r'''(<FormRow label="Profit Target Override">.*?</div>\n\s*</FormRow>)''',
    re.DOTALL,
)
fm = form_pattern.search(text)
if not fm:
    raise RuntimeError('profit target override form row not found')
block = fm.group(1)
if 'Lot Logic automatic target' not in block:
    block = block.replace(
        '''                </div>\n              </FormRow>''',
        '''                </div>\n                <p className="mt-1 text-[10px] font-semibold leading-4 text-slate-400">\n                  Leave at $0 to use the Lot Logic automatic target: at least $2,500, scaling to roughly 20% of the pre-recon acquisition basis. Current target: {money(valuation.desiredProfitTarget)}.\n                </p>\n              </FormRow>''',
        1,
    )
    text = text[:fm.start()] + block + text[fm.end():]

# Feed effective target to downstream AI context instead of the raw optional override.
text = text.replace('targetProfit: valuationInput.targetProfit,', 'targetProfit: valuation.desiredProfitTarget,')

path.write_text(text)
print('Rebuilt desired-profit and deal-economics engines')
