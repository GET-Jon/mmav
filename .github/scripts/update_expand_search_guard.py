from pathlib import Path

path = Path("scripts/ensure-expand-search-source.mjs")
text = path.read_text()

old = '''  const correctedGate = `                  {marketCheckSearchMeta &&\\n                  marketCheckSearchMeta.searchStage !== "metro" &&\\n                  !marketCheckLoading ? (`;\n\n  if (source.includes(correctedGate)) {\n    return source;\n  }\n'''
new = '''  const correctedGate = `                  {marketCheckSearchMeta &&\\n                  marketCheckSearchMeta.searchStage !== "metro" &&\\n                  !marketCheckLoading ? (`;\n\n  const strongCompGate = `                  {marketCheckSearchMeta &&\\n                  compSummary.includedCount < 6 &&\\n                  marketCheckSearchMeta.searchStage !== "metro" &&\\n                  !marketCheckLoading ? (`;\n\n  if (source.includes(strongCompGate) || source.includes(correctedGate)) {\n    return source;\n  }\n'''

if old not in text:
    raise RuntimeError("Could not locate expand-search guard logic")

path.write_text(text.replace(old, new))
print("Updated expand-search guard for strong-comp threshold")
